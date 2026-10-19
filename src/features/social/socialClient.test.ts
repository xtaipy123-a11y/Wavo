import { describe, expect, it } from "vitest";
import { parseSharedPlaylist } from "./socialClient";

describe("shared playlist snapshots", () => {
  it("keeps only playable track fields from a valid shared playlist", () => {
    expect(parseSharedPlaylist({
      title: "  Mix  ",
      tracks: [{ id: "song-1", title: "Track", artists: [{ id: "artist-1", name: "Artist" }], durationMs: 120000, unexpected: "ignored" }],
    })).toEqual({ title: "Mix", tracks: [{ id: "song-1", title: "Track", artists: [{ id: "artist-1", name: "Artist" }], durationMs: 120000 }] });
  });

  it("rejects malformed and oversized snapshots before import", () => {
    expect(parseSharedPlaylist({ title: "Bad", tracks: [{ id: "x", title: "Track", artists: "not an array" }] })).toBeNull();
    expect(parseSharedPlaylist({ title: "Huge", tracks: Array.from({ length: 1001 }, () => ({ id: "x", title: "Track", artists: [] })) })).toBeNull();
  });
});
