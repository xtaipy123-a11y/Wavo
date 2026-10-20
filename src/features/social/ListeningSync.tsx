import { useEffect } from "react";
import { api, toClientTrack } from "@/shared/api";
import { getSupabaseClient } from "@/shared/supabase/client";
import { useAuthStore } from "@/features/auth/store/authStore";
import { playerEngine } from "@/features/player/engine/playerEngine";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { listeningClient } from "./listeningClient";
import { canRequestListeningAction, expectedListeningPosition, isListeningRoomFresh, listeningError, upcomingListeningQueue, useListeningStore } from "./listeningStore";

export default function ListeningSync() {
  const userId = useAuthStore((state) => state.user?.id);

  useEffect(() => {
    if (!userId) { useListeningStore.getState().reset(); return; }
    const client = getSupabaseClient();
    const refresh = () => void useListeningStore.getState().refresh();
    refresh();
    const poll = window.setInterval(refresh, 5000);
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
        published.isPlaying !== isPlaying || published.queueKey !== queueKey || Math.abs(positionMs - expected) > 1600;
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
      debounce = window.setTimeout(() => void publish(), 120);
    };
    const unsubscribe = usePlayerStore.subscribe(onPlayerChange);
    const heartbeat = window.setInterval(() => void publish(true), 3000);
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
    const commandPoll = window.setInterval(() => void processCommands(), 1600);
    void processCommands();
    let loadingTrack: string | null = null;

    const syncGuest = async () => {
      const room = useListeningStore.getState().room;
      if (!room || room.host_id === userId || !room.active) return;
      const player = usePlayerStore.getState();
      if (!room.track_id) {
        if (player.status === "playing" || player.status === "loading") playerEngine.pause();
        return;
      }
      if (player.currentTrack?.id !== room.track_id) {
        if (loadingTrack) return;
        loadingTrack = room.track_id;
        try {
          const track = toClientTrack(await api.getTrack(room.track_id));
          const latest = useListeningStore.getState().room;
          if (!latest || latest.id !== room.id || latest.track_id !== track.id) return;
          await playerEngine.playTrack(track, [track], `listening:${room.id}`);
          if (!latest.is_playing || !isListeningRoomFresh(latest)) playerEngine.pause();
          playerEngine.seek(Math.min(expectedListeningPosition(latest), track.durationMs || Number.POSITIVE_INFINITY));
        } catch (cause) {
          useListeningStore.setState({ error: listeningError(cause) });
        } finally {
          loadingTrack = null;
        }
        return;
      }
      const target = Math.min(expectedListeningPosition(room), player.durationMs || Number.POSITIVE_INFINITY);
      if (room.is_playing && isListeningRoomFresh(room)) {
        if (player.status === "paused" || player.status === "idle" || player.status === "error") playerEngine.resume();
      } else if (player.status === "playing" || player.status === "loading") {
        playerEngine.pause();
      }
      if (Math.abs(usePlayerStore.getState().positionMs - target) > 1700) playerEngine.seek(target);
    };
    const follower = window.setInterval(() => void syncGuest(), 1000);
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
