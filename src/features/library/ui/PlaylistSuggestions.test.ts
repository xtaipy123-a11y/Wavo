import { describe, expect, it } from "vitest";
import { rankSuggestions } from "./playlistSuggestionRanking";
import type { RadioTrack } from "@/shared/contracts/catalog";
import type { Track } from "@/shared/types";

const song = (id: string, artist: string): RadioTrack => ({
  id,
  title: id,
  artists: [{ id: artist, name: artist }],
  durationMs: 180000,
});

describe("playlist recommendations", () => {
  it("excludes songs already in the playlist and gives priority to shared artists and repeated radio matches", () => {
    const playlist: Track[] = [{
      id: "original", title: "Original", artists: "The Artist", coverUrl: "", durationMs: 180000, playCount: 0,
    }];
    const ranked = rankSuggestions([
      [song("original", "The Artist"), song("other", "New Artist"), song("match", "The Artist")],
      [song("match", "The Artist"), song("other", "New Artist")],
    ], playlist);

    expect(ranked.map((track) => track.id)).toEqual(["match", "other"]);
  });
});
