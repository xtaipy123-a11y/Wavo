import { useEffect } from "react";
import { api, toClientTrack } from "@/shared/api";
import { getSupabaseClient } from "@/shared/supabase/client";
import { useAuthStore } from "@/features/auth/store/authStore";
import { getDevGuestId } from "@/shared/api/devIdentity";
import { playerEngine } from "@/features/player/engine/playerEngine";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { getStoredLocale } from "@/languages";
import { showToast } from "@/shared/ui/Toast";
import type { Track } from "@/shared/types";
import { listeningClient, type ListeningRoom } from "./listeningClient";
import { clearListeningFollowClock, setListeningFollowClock } from "./listeningClock";
import {
  advanceListeningAnchor,
  canRequestListeningAction,
  estimateListeningClockSkew,
  expectedAnchorPosition,
  isListeningAnchorFresh,
  listeningError,
  upcomingListeningQueue,
  useListeningStore,
  type ListeningPlaybackAnchor,
} from "./listeningStore";

const PUBLISH_HEARTBEAT_MS = 2000;
const PUBLISH_DEBOUNCE_MS = 120;
const REFRESH_POLL_MS = 5000;
const COMMAND_POLL_MS = 800;
const GUEST_SYNC_MS = 750;
// Guests drift naturally because the host only publishes every two seconds.
// Correcting every small difference made the audio element seek constantly,
// which stalled playback and starved the lyrics clock.
const SEEK_TOLERANCE_MS = 1400;
const SEEK_HARD_TOLERANCE_MS = 4500;
const SEEK_COOLDOWN_MS = 2500;

export default function ListeningSync() {
  const sessionUserId = useAuthStore((state) => state.user?.id);
  // Dev guest mode has no Supabase session but still runs a local session.
  const userId = sessionUserId ?? getDevGuestId() ?? undefined;

  useEffect(() => {
    if (!userId) { useListeningStore.getState().reset(); return; }
    const refresh = () => void useListeningStore.getState().refresh();
    refresh();
    const poll = window.setInterval(refresh, REFRESH_POLL_MS);
    // The dev listening backend lives in localStorage and announces every write,
    // so the room row does not have to wait for the next poll.
    window.addEventListener("wavo:dev-listening", refresh);
    let cleanupRealtime: (() => void) | null = null;
    if (sessionUserId) {
      try {
        const client = getSupabaseClient();
        const channel = client.channel(`wavo-listening-${userId}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "wavo_listening_rooms" }, refresh)
          .on("postgres_changes", { event: "*", schema: "public", table: "wavo_listening_members" }, refresh)
          .subscribe();
        cleanupRealtime = () => { void client.removeChannel(channel); };
      } catch {
        // A cached session without Supabase config falls back to polling.
      }
    }

    type Published = { roomId: string; trackId: string | null; isPlaying: boolean; positionMs: number; queueKey: string; at: number };
    let published: Published | null = null;
    let publishing = false;
    let pending = false;
    let debounce: number | undefined;

    const publish = async (heartbeat = false) => {
      const room = useListeningStore.getState().room;
      if (!room || room.host_id !== userId || !room.active) return;
      const player = usePlayerStore.getState();
      const trackId = player.currentTrack?.id ?? null;
      const isPlaying = Boolean(trackId && (player.status === "playing" || player.status === "loading"));
      const positionMs = trackId ? player.positionMs : 0;
      const queue = upcomingListeningQueue(player);
      const queueKey = JSON.stringify(queue);
      const expected = published ? published.positionMs + (published.isPlaying ? Date.now() - published.at : 0) : 0;
      const changed = !published || published.roomId !== room.id || published.trackId !== trackId ||
        published.isPlaying !== isPlaying || published.queueKey !== queueKey ||
        (!isPlaying && published.positionMs !== positionMs) || Math.abs(positionMs - expected) > 1500;
      if (!changed && !(heartbeat && isPlaying)) return;
      if (publishing) { pending = true; return; }
      publishing = true;
      const trackTitle = player.currentTrack?.title ?? null;
      // Mirror the host's own player into the room row before the network round
      // trip: the panel must show the skipped song immediately, even while the
      // publish request is still in flight (or fails).
      useListeningStore.getState().applyHostPlayback({ trackId, trackTitle, positionMs, isPlaying, queue });
      try {
        await listeningClient.publish(room.id, trackId, trackTitle, positionMs, isPlaying, queue);
        published = { roomId: room.id, trackId, isPlaying, positionMs, queueKey, at: Date.now() };
      } catch (cause) {
        useListeningStore.setState({ error: listeningError(cause) });
      } finally {
        publishing = false;
        if (pending) { pending = false; void publish(); }
      }
    };
    const onPlayerChange = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => void publish(), PUBLISH_DEBOUNCE_MS);
    };
    const unsubscribe = usePlayerStore.subscribe(onPlayerChange);
    const heartbeat = window.setInterval(() => void publish(true), PUBLISH_HEARTBEAT_MS);

    let processing = false;
    const processCommands = async () => {
      const room = useListeningStore.getState().room;
      if (processing || !room || room.host_id !== userId || !room.active) return;
      processing = true;
      try {
        for (const command of await listeningClient.pendingCommands(room.id)) {
          if (!await listeningClient.claimCommand(command.id)) continue;
          const member = useListeningStore.getState().members.find((entry) => entry.user_id === command.actor_id && entry.status === "active");
          if (command.kind === "add" && canRequestListeningAction(room, member, command.actor_id, "add") && command.track_id) {
            const track = toClientTrack(await api.getTrack(command.track_id));
            const player = usePlayerStore.getState();
            if (player.currentTrack) playerEngine.addToQueue(track);
            else await playerEngine.playTrack(track, [track], `listening:${room.id}`);
          } else if (command.kind === "skip" && canRequestListeningAction(room, member, command.actor_id, "skip")) {
            await playerEngine.skipNext();
          } else if (command.kind === "move" && canRequestListeningAction(room, member, command.actor_id, "move")) {
            const player = usePlayerStore.getState();
            const from = command.from_index ?? -1;
            const to = command.to_index ?? -1;
            if (from > player.currentIndex && to > player.currentIndex &&
              from < player.queue.length && to < player.queue.length) playerEngine.reorderQueue(from, to);
          }
        }
      } catch (cause) {
        useListeningStore.setState({ error: listeningError(cause) });
      } finally {
        processing = false;
      }
    };
    const commandPoll = window.setInterval(() => void processCommands(), COMMAND_POLL_MS);
    void processCommands();

    // Guests follow the host by extrapolating from the last published position.
    // The clock skew estimate makes this independent of the device clock, and
    // the anchor only moves when the host actually changes playback.
    let anchor: ListeningPlaybackAnchor | null = null;
    let anchorRoomId: string | null = null;
    let clockSkew: number | null = null;
    let seenUpdatedAt: string | null = null;
    let loadingTrack: string | null = null;
    let lastSeekAt = 0;

    const observeRoom = (room: ListeningRoom) => {
      if (anchorRoomId !== room.id) {
        anchorRoomId = room.id;
        anchor = null;
        clockSkew = null;
        seenUpdatedAt = null;
      }
      if (seenUpdatedAt !== room.updated_at) {
        seenUpdatedAt = room.updated_at;
        clockSkew = estimateListeningClockSkew(room, Date.now(), clockSkew);
      }
      anchor = advanceListeningAnchor(anchor, room);
    };

    const syncGuest = async () => {
      const room = useListeningStore.getState().room;
      if (!room || room.host_id === userId || !room.active) {
        clearListeningFollowClock();
        return;
      }
      observeRoom(room);
      const player = usePlayerStore.getState();
      if (!room.track_id) {
        if (player.status === "playing" || player.status === "loading") playerEngine.pause();
        return;
      }

      if (player.currentTrack?.id !== room.track_id) {
        if (loadingTrack) return;
        if (!room.is_playing) {
          if (player.status === "playing" || player.status === "loading") playerEngine.pause();
          return;
        }
        loadingTrack = room.track_id;
        try {
          const loaded = toClientTrack(await api.getTrack(room.track_id));
          const latest = useListeningStore.getState().room;
          if (!latest || latest.id !== room.id || latest.track_id !== room.track_id) return;
          // The room row owns the identity. Catalog lookups can normalize ids
          // (e.g. prefixed source ids); following the normalized id would make
          // this follower reload the same track forever.
          const track: Track = {
            ...loaded,
            id: room.track_id,
            title: loaded.title || room.track_title || "Wavo",
          };
          await playerEngine.playTrack(track, [track], `listening:${room.id}`);
        } catch {
          // Metadata can be unavailable (e.g. the catalog API does not host
          // this source). Playback still works from the id alone, so fall back
          // to the snapshot title instead of blocking the session.
          const latest = useListeningStore.getState().room;
          if (!latest || latest.id !== room.id || latest.track_id !== room.track_id) return;
          const fallback: Track = {
            id: room.track_id,
            title: room.track_title ?? "Wavo",
            artists: "",
            coverUrl: "",
            durationMs: 0,
            playCount: 0,
          };
          await playerEngine.playTrack(fallback, [fallback], `listening:${room.id}`);
        } finally {
          loadingTrack = null;
        }
      }

      const latest = useListeningStore.getState().room;
      if (!latest || latest.id !== room.id) return;
      observeRoom(latest);
      const current = usePlayerStore.getState();
      const skew = clockSkew ?? 0;
      const fresh = isListeningAnchorFresh(anchor, skew);
      const target = expectedAnchorPosition(anchor, skew);
      const duration = current.durationMs || current.currentTrack?.durationMs || 0;
      // Near the end of the track, stop steering: the host will publish the next
      // track shortly. Seeking to the final millisecond would just loop playback.
      const atTrackEnd = latest.is_playing && duration > 0 && target >= duration - 500;

      // Publish the extrapolated host clock for the lyrics views. The anchor is
      // authoritative even while this guest's own audio element is loading or
      // stalled, which is what kept the guest's lyrics frozen at line one.
      if (anchor) {
        setListeningFollowClock({
          roomId: latest.id,
          trackId: latest.track_id,
          isGuest: true,
          anchor,
          clockSkewMs: skew,
        });
      }

      if (latest.is_playing && fresh && !atTrackEnd) {
        if (current.status === "paused" || current.status === "idle" || current.status === "error") playerEngine.resume();
      } else if (!latest.is_playing && (current.status === "playing" || current.status === "loading")) {
        playerEngine.pause();
      }
      if (!latest.is_playing || !fresh || atTrackEnd) return;
      // Never fight the loader: a seek while the next track is still opening is
      // dropped by the media element and only adds another stall.
      if (current.status === "loading") return;
      const audio = document.getElementById("wavo-audio") as HTMLAudioElement | null;
      if (!audio || audio.readyState < 1 || audio.seeking) return;

      const bounded = duration > 0 ? Math.min(target, duration) : target;
      const drift = Math.abs(usePlayerStore.getState().positionMs - bounded);
      const now = Date.now();
      const shouldSeek = drift > SEEK_HARD_TOLERANCE_MS ||
        (drift > SEEK_TOLERANCE_MS && now - lastSeekAt > SEEK_COOLDOWN_MS);
      if (shouldSeek) {
        lastSeekAt = now;
        playerEngine.seek(bounded);
      }
    };
    // A guest cannot steer the shared playback. Skipping locally would replay
    // the guest's one-track queue or stop the audio until the next room refresh
    // put the host's song back, which looked like the skip did nothing.
    const interceptGuestSkip = (kind: "next" | "previous", isAutoEnd: boolean) => {
      const room = useListeningStore.getState().room;
      if (!room || !room.active || room.host_id === userId) return false;
      if (kind === "next" && !isAutoEnd) {
        const member = useListeningStore.getState().members
          .find((entry) => entry.user_id === userId && entry.status === "active");
        if (canRequestListeningAction(room, member, userId, "skip")) {
          void listeningClient.request(room.id, "skip").then(() => {
            showToast(
              getStoredLocale() === "de"
                ? "Skip-Anfrage an den Host gesendet."
                : "Skip request sent to the host.",
              "info",
            );
          }).catch((cause) => {
            useListeningStore.setState({ error: listeningError(cause) });
          });
        } else {
          showToast(
            getStoredLocale() === "de"
              ? "Nur der Host kann Songs überspringen."
              : "Only the host can skip songs.",
            "info",
          );
        }
      }
      return true;
    };
    playerEngine.skipInterceptor = interceptGuestSkip;

    const follower = window.setInterval(() => void syncGuest(), GUEST_SYNC_MS);
    void syncGuest();

    return () => {
      if (playerEngine.skipInterceptor === interceptGuestSkip) playerEngine.skipInterceptor = null;
      window.removeEventListener("wavo:dev-listening", refresh);
      window.clearInterval(poll);
      window.clearInterval(heartbeat);
      window.clearInterval(commandPoll);
      window.clearInterval(follower);
      window.clearTimeout(debounce);
      unsubscribe();
      cleanupRealtime?.();
      clearListeningFollowClock();
      useListeningStore.getState().reset();
    };
  }, [userId, sessionUserId]);

  return null;
}
