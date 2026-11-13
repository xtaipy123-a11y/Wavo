import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Local libraries without a session used to throw synchronously from the
// telemetry write. That exception escaped the player store subscriber and
// aborted skipNext halfway, so the old audio kept playing and the listening
// room was never updated.
vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      recordPlaybackEvent: () => {
        throw new Error("Sign in to save your music library.");
      },
    },
  };
});

import { playerEngine, usePlayerStore } from "./playerEngine";
import { playerRuntime } from "./playerRuntime";
import type { Track } from "@/shared/types";

function track(id: string, title: string): Track {
  return { id, title, artists: "Artist", durationMs: 180_000, coverUrl: "", playCount: 0 };
}

describe("skip with failing playback telemetry", () => {
  beforeEach(() => {
    usePlayerStore.setState({
      status: "idle",
      queue: [],
      currentIndex: -1,
      currentTrack: null,
      positionMs: 0,
      durationMs: 0,
      repeat: "off",
      shuffle: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("still switches the track when reporting the previous song throws", async () => {
    vi.useFakeTimers();
    const first = track("a", "First");
    const second = track("b", "Second");
    await playerEngine.playTrack(first, [first, second]);

    // Accumulate more than the 3s threshold the telemetry needs to report a
    // track, so flushing on the skip really runs.
    usePlayerStore.setState({ status: "playing" });
    await vi.advanceTimersByTimeAsync(4_000);
    usePlayerStore.setState({ positionMs: 4_000 });

    const loadSpy = vi.spyOn(playerRuntime!, "loadAndPlay");
    await playerEngine.skipNext();

    const state = usePlayerStore.getState();
    expect(state.currentTrack?.id).toBe("b");
    expect(state.status).toBe("loading");
    expect(state.positionMs).toBe(0);
    expect(loadSpy).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
    loadSpy.mockRestore();
  });
});
