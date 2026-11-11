import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryCache } from "@/shared/cache/queryCache";

const { radio, likedTracks, playlists, getUserPlaylist } = vi.hoisted(() => {
  const likedTracks = [{
    id: "liked-1", title: "Liked song", artists: "Alpha",
    artistList: [{ name: "Alpha" }], coverUrl: "", durationMs: 0, playCount: 0,
  }];
  const playlists = [{
    id: "p1", title: "My mix", trackCount: 1, coverUrl: "", coverUrls: [],
    updatedAt: "2026-01-02", createdAt: "2026-01-01", revision: 1,
  }];
  return { radio: vi.fn(), likedTracks, playlists, getUserPlaylist: vi.fn() };
});

vi.mock("@/shared/media/innertube", () => ({
  innertubeCatalog: { getRadio: radio },
  toCardArtworkUrl: (url: string) => url,
}));
vi.mock("@/shared/api", () => ({
  api: { getUserPlaylist },
  toClientTrack: (track: any) => ({
    id: track.id,
    title: track.title,
    artists: Array.isArray(track.artists)
      ? track.artists.map((artist: any) => artist.name).join(", ")
      : track.artists,
    coverUrl: track.cover?.url ?? "",
    durationMs: track.durationMs ?? 0,
    playCount: 0,
  }),
}));
vi.mock("@/features/library/hooks/useLikedTracks", () => ({
  useLikedTracks: () => ({ data: { total: likedTracks.length, tracks: likedTracks }, isLoading: false }),
  getCachedLikedTracks: () => likedTracks,
}));
vi.mock("@/features/library/hooks/usePlaylists", () => ({
  usePlaylistsList: () => ({ data: { playlists, total: playlists.length }, isLoading: false }),
}));

import { useRecommendations } from "./useRecommendations";

function Harness() {
  const { data } = useRecommendations();
  return <div>{data.map((entry) => <span key={entry.item.id}>{entry.type === "track" ? entry.item.title : entry.item.id}</span>)}</div>;
}

describe("useRecommendations", () => {
  let container: HTMLDivElement, root: Root;
  beforeEach(() => {
    queryCache.set("playlist:detail:p1", {
      id: "p1", title: "My mix", trackCount: 1, coverUrl: "", coverUrls: [], revision: 1,
      tracks: [{ id: "playlist-1", title: "Playlist song", artists: "Beta", coverUrl: "", durationMs: 0, playCount: 0 }],
    });
    radio.mockResolvedValue({
      items: [
        { id: "liked-1", title: "Liked song", artists: [{ id: "", name: "Alpha" }], durationMs: 0 },
        { id: "playlist-1", title: "Playlist song", artists: [{ id: "", name: "Beta" }], durationMs: 0 },
        { id: "fresh-1", title: "Fresh suggestion", artists: [{ id: "", name: "Gamma" }], durationMs: 0 },
      ],
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
    queryCache.delete("playlist:detail:p1");
  });

  it("seeds radios from likes and playlists and only shows unknown tracks", async () => {
    await act(async () => { root.render(<Harness />); });

    expect(radio).toHaveBeenCalledTimes(2);
    expect(radio.mock.calls.map((call) => call[0]).sort()).toEqual(["liked-1", "playlist-1"]);
    expect(container.textContent).toBe("Fresh suggestion");
  });
});
