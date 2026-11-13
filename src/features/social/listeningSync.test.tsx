import React, { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

vi.mock("../player/engine/playerRuntime", () => ({
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

// The player barrel pulls lottie/canvas UI that jsdom cannot load. The auth store
// only needs the store reference from it.
vi.mock("@/features/player", async () => {
  const store = await import("@/features/player/store/playerStore");
  return { usePlayerStore: store.usePlayerStore, playerRuntime: null };
});

vi.mock("@/shared/api", () => ({
  getAuthSession: () => null,
  toClientTrack: (track: unknown) => track,
  api: {
    getTrack: vi.fn(async (id: string) => ({
      id,
      title: `Title ${id}`,
      artists: "Artist",
      coverUrl: "",
      durationMs: 60_000,
      playCount: 0,
    })),
    recordPlaybackEvent: vi.fn(async () => {}),
  },
}));

import ListeningSync from "./ListeningSync";
import { listeningPlaylistFromTracks, useListeningStore } from "./listeningStore";
import { playerEngine, usePlayerStore } from "@/features/player/engine/playerEngine";
import type { Track } from "@/shared/types";

// @ts-expect-error - act support flag in vitest browserless DOM environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function track(id: string, title: string): Track {
  return { id, title, artists: "Artist", durationMs: 60_000, coverUrl: "", playCount: 0 };
}

async function flush(ms = 0) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

describe("ListeningSync host publishing", () => {
  beforeEach(() => {
    localStorage.clear();
    useListeningStore.getState().reset();
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

  it("mirrors a skipped host song into the room row", async () => {
    const first = track("song-1", "First Song");
    const second = track("song-2", "Second Song");
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<ListeningSync />);
    });
    await flush(50);

    await act(async () => {
      await useListeningStore.getState().startWithPlaylist(
        listeningPlaylistFromTracks("playlist-1", "Mix", "", [first, second]),
      );
    });
    await flush(50);

    expect(useListeningStore.getState().room?.track_title).toBe("First Song");

    await act(async () => {
      await playerEngine.skipNext();
    });
    await flush(400);

    expect(useListeningStore.getState().room?.track_title).toBe("Second Song");
    expect(useListeningStore.getState().room?.track_id).toBe("song-2");

    await act(async () => {
      root.unmount();
    });
  });
});
