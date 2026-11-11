import { describe, expect, it } from "vitest";
import type { Track } from "@/shared/types";
import {
  filterDislikedTracks,
  smartShuffleTracks,
  trackArtistKey,
} from "./smartShuffle";

function makeTrack(
  id: string,
  artist = `Artist ${id}`,
  artistList?: Track["artistList"],
): Track {
  return {
    id,
    title: `Track ${id}`,
    artists: artist,
    artistList,
    coverUrl: "",
    durationMs: 1000,
    playCount: 0,
  };
}

const constantRandom = (value: number) => () => value;

describe("trackArtistKey", () => {
  it("prefers the first artistList entry", () => {
    const track = makeTrack("a", "Fallback", [{ name: "  First Artist  " }]);
    expect(trackArtistKey(track)).toBe("first artist");
  });

  it("falls back to the first comma-separated artist name", () => {
    expect(trackArtistKey(makeTrack("b", "Main Artist, Featured"))).toBe(
      "main artist",
    );
  });
});

describe("filterDislikedTracks", () => {
  const tracks = [makeTrack("a"), makeTrack("b"), makeTrack("c")];

  it("returns a copy when nothing is disliked", () => {
    const result = filterDislikedTracks(tracks, new Set());
    expect(result).toEqual(tracks);
    expect(result).not.toBe(tracks);
  });

  it("removes disliked tracks", () => {
    const result = filterDislikedTracks(tracks, new Set(["b"]));
    expect(result.map((track) => track.id)).toEqual(["a", "c"]);
  });

  it("keeps the explicit playback track even when disliked", () => {
    const result = filterDislikedTracks(tracks, new Set(["b"]), "b");
    expect(result.map((track) => track.id)).toEqual(["a", "b", "c"]);
  });
});

describe("smartShuffleTracks", () => {
  it("never includes disliked tracks", () => {
    const tracks = [makeTrack("a"), makeTrack("b"), makeTrack("c")];
    const result = smartShuffleTracks(tracks, {
      dislikedTrackIds: new Set(["b"]),
      random: constantRandom(0.5),
    });
    expect(result.map((track) => track.id)).toEqual(["a", "c"]);
  });

  it("keeps every eligible track exactly once", () => {
    const tracks = Array.from({ length: 12 }, (_, index) =>
      makeTrack(`t${index}`),
    );
    const result = smartShuffleTracks(tracks, {
      dislikedTrackIds: new Set(["t3", "t7"]),
      random: constantRandom(0.42),
    });
    const ids = result.map((track) => track.id).sort();
    expect(ids).toEqual(
      tracks
        .filter((track) => track.id !== "t3" && track.id !== "t7")
        .map((track) => track.id)
        .sort(),
    );
  });

  it("puts liked tracks ahead when the random weight is constant", () => {
    const tracks = [
      makeTrack("plain-1"),
      makeTrack("liked-1"),
      makeTrack("plain-2"),
      makeTrack("liked-2"),
    ];
    const result = smartShuffleTracks(tracks, {
      likedTrackIds: new Set(["liked-1", "liked-2"]),
      random: constantRandom(0.5),
    });
    expect(result.slice(0, 2).map((track) => track.id).sort()).toEqual([
      "liked-1",
      "liked-2",
    ]);
  });

  it("boosts tracks from liked artists", () => {
    const tracks = [
      makeTrack("plain", "Unknown"),
      makeTrack("favorite-artist", "Favorite"),
    ];
    const result = smartShuffleTracks(tracks, {
      likedArtistKeys: new Set(["favorite"]),
      random: constantRandom(0.5),
    });
    expect(result[0].id).toBe("favorite-artist");
  });

  it("keeps the same artist apart when alternatives exist", () => {
    const tracks = [
      makeTrack("a1", "Artist A"),
      makeTrack("a2", "Artist A"),
      makeTrack("b1", "Artist B"),
    ];
    const result = smartShuffleTracks(tracks, {
      random: constantRandom(0.9),
    });
    expect(result.map((track) => track.id)).toEqual(["a1", "b1", "a2"]);
  });

  it("returns every track when all share one artist", () => {
    const tracks = [makeTrack("a1", "Solo"), makeTrack("a2", "Solo")];
    const result = smartShuffleTracks(tracks, { random: constantRandom(0.5) });
    expect(result.map((track) => track.id).sort()).toEqual(["a1", "a2"]);
  });
});
