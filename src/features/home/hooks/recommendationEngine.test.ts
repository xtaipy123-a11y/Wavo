import { describe, expect, it } from "vitest";
import type { RadioTrack } from "@/shared/contracts/catalog";
import type { Track } from "@/shared/types";
import {
  artistNamesOf,
  rankRecommendationTracks,
  selectRecommendationSeeds,
} from "./recommendationEngine";

const track = (id: string, artists: string): Track => ({
  id,
  title: id,
  artists,
  coverUrl: "",
  durationMs: 180000,
  playCount: 0,
});

const radioTrack = (id: string, artist: string): RadioTrack => ({
  id,
  title: id,
  artists: [{ id: artist, name: artist }],
  durationMs: 180000,
});

describe("recommendation engine", () => {
  it("reads artists from client tracks, catalog tracks and plain strings", () => {
    expect(artistNamesOf(track("a", "Alpha, Beta"))).toEqual(["Alpha", "Beta"]);
    expect(artistNamesOf({ id: "b", artists: [{ name: "Gamma" }] })).toEqual(["Gamma"]);
    expect(artistNamesOf({ id: "c", artistList: [{ name: "Delta" }] })).toEqual(["Delta"]);
    expect(artistNamesOf({ id: "d", artists: "Unknown" })).toEqual([]);
  });

  it("picks one seed per artist, prioritising likes over history and playlists", () => {
    const seeds = selectRecommendationSeeds({
      liked: [track("liked-a1", "Alpha"), track("liked-a2", "Alpha"), track("liked-b", "Beta")],
      recent: [track("recent-c", "Gamma")],
      playlist: [track("playlist-d", "Delta")],
    });

    expect(seeds).toEqual(["liked-a1", "liked-b", "recent-c"]);
  });

  it("does not seed the same track twice when it credits several artists", () => {
    const seeds = selectRecommendationSeeds({
      liked: [track("duo", "Alpha feat. Beta")],
    });

    expect(seeds).toEqual(["duo"]);
  });

  it("skips local uploads that cannot seed a YouTube Music radio", () => {
    const seeds = selectRecommendationSeeds({
      liked: [track("upload:local-1", "Alpha"), track("yt-1", "Beta")],
    });

    expect(seeds).toEqual(["yt-1"]);
  });

  it("falls back to discovery tracks when no personal artist signal exists", () => {
    const seeds = selectRecommendationSeeds({
      liked: [track("unknown", "Unknown")],
      fallback: [
        track("fallback-1", "One"),
        track("fallback-2", "One"),
        track("fallback-3", "Two"),
        track("fallback-4", "Three"),
      ],
    });

    expect(seeds).toEqual(["fallback-1", "fallback-3", "fallback-4"]);
  });

  it("merges radios, drops known tracks, boosts repeat matches and respects the limit", () => {
    const ranked = rankRecommendationTracks(
      [
        [radioTrack("known", "Alpha"), radioTrack("other", "New"), radioTrack("match", "Alpha")],
        [radioTrack("match", "Alpha"), radioTrack("other", "New")],
      ],
      [track("known", "Alpha")],
    );

    expect(ranked.map((entry) => entry.id)).toEqual(["match", "other"]);
  });

  it("caps the recommendation row", () => {
    const radio = Array.from({ length: 30 }, (_, index) => radioTrack(`song-${index}`, `Artist ${index}`));
    expect(rankRecommendationTracks([radio], [], 20)).toHaveLength(20);
  });
});
