import { useEffect } from "react";
import { api, toClientTrack } from "@/shared/api";
import { getSupabaseClient } from "@/shared/supabase/client";
import { useAuthStore } from "@/features/auth/store/authStore";
import { playerEngine } from "@/features/player/engine/playerEngine";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { listeningClient, type ListeningRoom } from "./listeningClient";
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
const COMMAND_POLL_MS = 1600;
const GUEST_SYNC_MS = 750;
const SEEK_TOLERANCE_MS = 450;

export default function ListeningSync() {
  const userId = useAuthStore((state) => state.user?.id);

  useEffect(() => {
    if (!userId) { useListeningStore.getState().reset(); return; }
    const client = getSupabaseClient();
    const refresh = () => void useListeningStore.getState().refresh();
    refresh();
    const poll = window.setInterval(refresh, REFRESH_POLL_MS);
    const channel = client.channel(`wavo-listening-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wavo_listening_rooms" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "wavo_listening_members" }, refresh)
      .subscribe();

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
      try {
        await listeningClient.publish(room.id, trackId, player.currentTrack?.title ?? null, positionMs, isPlaying, queue);
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
      if (!room || room.host_id === userId || !room.active) return;
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
          let track = toClientTrack(await api.getTrack(room.track_id));
          const latest = useListeningStore.getState().room;
          if (!latest || latest.id !== room.id || latest.track_id !== track.id) return;
          if (!track.title) {
            track = { ...track, title: room.track_title ?? "Wavo" };
          }
          await playerEngine.playTrack(track, [track], `listening:${room.id}`);
        } catch {
          // Metadata can be unavailable (e.g. the catalog API does not host
          // this source). Playback still works from the id alone, so fall back
          // to the snapshot title instead of blocking the session.
          const latest = useListeningStore.getState().room;
          if (!latest || latest.id !== room.id || latest.track_id !== room.track_id) return;
          await playerEngine.playTrack(
            { id: room.track_id, title: room.track_title ?? "Wavo", artists: "", coverUrl: "", durationMs: 0, playCount: 0 },
            [],
            `listening:${room.id}`,
          );
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

      if (latest.is_playing && fresh && !atTrackEnd) {
        if (current.status === "paused" || current.status === "idle" || current.status === "error") playerEngine.resume();
      } else if (!latest.is_playing && (current.status === "playing" || current.status === "loading")) {
        playerEngine.pause();
      }
      if (!latest.is_playing || !fresh || atTrackEnd) return;

      const bounded = duration > 0 ? Math.min(target, duration) : target;
      if (Math.abs(usePlayerStore.getState().positionMs - bounded) > SEEK_TOLERANCE_MS) playerEngine.seek(bounded);
    };
    const follower = window.setInterval(() => void syncGuest(), GUEST_SYNC_MS);
    void syncGuest();

    return () => {
      window.clearInterval(poll);
      window.clearInterval(heartbeat);
      window.clearInterval(commandPoll);
      window.clearInterval(follower);
      window.clearTimeout(debounce);
      unsubscribe();
      void client.removeChannel(channel);
      useListeningStore.getState().reset();
    };
  }, [userId]);

  return null;
}
