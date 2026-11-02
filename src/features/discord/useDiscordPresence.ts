import { useEffect } from "react";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useDiscordSettingsStore } from "./discordSettingsStore";
import type { DiscordPlayback } from "./contracts";

export function startDiscordPresenceSync(send: (state: DiscordPlayback | null) => void): () => void {
  let last: DiscordPlayback | null = null;
  let lastSentAt = 0;
  const sync = () => {
    const player = usePlayerStore.getState();
    const track = player.currentTrack;
    const next: DiscordPlayback | null = useDiscordSettingsStore.getState().enabled && player.status === "playing" && track ? {
      trackId: track.id,
      title: track.title,
      artist: track.artists,
      positionMs: player.positionMs,
      durationMs: player.durationMs || track.durationMs || 0,
      playbackRate: player.playbackRate,
    } : null;
    const now = Date.now();
    if (last && next && last.trackId === next.trackId && last.title === next.title && last.artist === next.artist &&
        last.durationMs === next.durationMs && last.playbackRate === next.playbackRate &&
        Math.abs(next.positionMs - (last.positionMs + (now - lastSentAt) * last.playbackRate)) < 1500 &&
        now - lastSentAt < 15000) return;
    if (!last && !next && lastSentAt) return;
    last = next;
    lastSentAt = now;
    send(next);
  };
  const unsubscribePlayer = usePlayerStore.subscribe(sync);
  const unsubscribeSettings = useDiscordSettingsStore.subscribe(sync);
  sync();
  return () => {
    unsubscribePlayer();
    unsubscribeSettings();
    send(null);
  };
}

export function useDiscordPresence(): void {
  useEffect(() => {
    const send = window.wavoElectron?.discordUpdatePlayback;
    if (send) return startDiscordPresenceSync(send);
  }, []);
}
