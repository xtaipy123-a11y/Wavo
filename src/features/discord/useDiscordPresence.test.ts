import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useDiscordSettingsStore } from "./discordSettingsStore";
import { startDiscordPresenceSync } from "./useDiscordPresence";
import type { Track } from "@/shared/types";

const track: Track = { id: "song", title: "Song", artists: "Artist", durationMs: 180000, coverUrl: "", playCount: 0 };
let stop: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-02T20:00:00Z"));
  localStorage.clear();
  usePlayerStore.setState({ currentTrack: track, status: "playing", positionMs: 30000, durationMs: 180000, playbackRate: 1 });
  useDiscordSettingsStore.setState({ enabled: true });
});
afterEach(() => { stop?.(); stop = undefined; vi.useRealTimers(); });

describe("Discord playback bridge", () => {
  it("publishes playback without sending every progress tick, then resyncs a seek and speed change", () => {
    const send = vi.fn();
    stop = startDiscordPresenceSync(send);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ title: "Song", artist: "Artist", positionMs: 30000 }));
    vi.advanceTimersByTime(1000);
    usePlayerStore.setState({ positionMs: 31000 });
    expect(send).toHaveBeenCalledTimes(1);
    usePlayerStore.setState({ positionMs: 90000 });
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ positionMs: 90000 }));
    usePlayerStore.setState({ playbackRate: 2 });
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ playbackRate: 2 }));
  });

  it.each(["paused", "loading", "idle", "error"] as const)("clears presence on %s and restores it on resume", (status) => {
    const send = vi.fn();
    stop = startDiscordPresenceSync(send);
    usePlayerStore.setState({ status });
    expect(send).toHaveBeenLastCalledWith(null);
    usePlayerStore.setState({ status: "playing" });
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ trackId: "song" }));
  });

  it("remembers opting out, clears immediately and republishes when enabled", async () => {
    const send = vi.fn();
    stop = startDiscordPresenceSync(send);
    useDiscordSettingsStore.getState().setEnabled(false);
    expect(send).toHaveBeenLastCalledWith(null);
    await useDiscordSettingsStore.persist.rehydrate();
    expect(useDiscordSettingsStore.getState().enabled).toBe(false);
    usePlayerStore.setState({ positionMs: 90000 });
    expect(send).toHaveBeenCalledTimes(2);
    useDiscordSettingsStore.getState().setEnabled(true);
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ positionMs: 90000 }));
  });

  it("clears on teardown and unsubscribes from playback updates", () => {
    const send = vi.fn();
    const cleanup = startDiscordPresenceSync(send);
    cleanup();
    expect(send).toHaveBeenLastCalledWith(null);
    usePlayerStore.setState({ positionMs: 90000 });
    expect(send).toHaveBeenCalledTimes(2);
  });
});
