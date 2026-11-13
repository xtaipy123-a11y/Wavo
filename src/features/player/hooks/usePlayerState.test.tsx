import React, { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import type { Track } from "@/shared/types";

// The real runtime resolves streams over the network; this test only covers the
// store → React subscription, so a no-op runtime keeps it deterministic.
vi.mock("../engine/playerRuntime", () => ({
  playerRuntime: {
    loadAndPlay: vi.fn(async () => {}),
    preloadTrack: vi.fn(async () => {}),
    pause: vi.fn(),
    resume: vi.fn(),
    seek: vi.fn(),
    setPendingSeek: vi.fn(),
    hasLoadedSourceFor: () => true,
    getCurrentTrackId: () => null,
  },
}));

import { playerEngine, usePlayerStore } from "../engine/playerEngine";
import { usePlayerState } from "./usePlayerState";

// @ts-expect-error - act support flag in vitest browserless DOM environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function track(id: string, title: string): Track {
  return { id, title, artists: "Artist", durationMs: 60_000, coverUrl: "", playCount: 0 };
}

function TitleProbe() {
  const player = usePlayerState();
  return <span>{player.currentTrack?.title ?? "none"}</span>;
}

describe("usePlayerState", () => {
  beforeEach(() => {
    usePlayerStore.setState({
      status: "idle",
      queue: [],
      currentIndex: -1,
      currentTrack: null,
      positionMs: 0,
      durationMs: 0,
      error: null,
    });
  });

  it("re-renders the player UI with the new song after a skip", async () => {
    const first = track("1", "First Song");
    const second = track("2", "Second Song");
    await playerEngine.playTrack(first, [first, second]);

    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(<TitleProbe />);
    });
    expect(container.textContent).toBe("First Song");

    await act(async () => {
      await playerEngine.skipNext();
    });
    expect(container.textContent).toBe("Second Song");

    await act(async () => {
      root.unmount();
    });
  });
});
