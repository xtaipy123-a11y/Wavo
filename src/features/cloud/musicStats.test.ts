import { describe, expect, it } from "vitest";
import { summarizeEvents } from "./musicStats";

describe("music statistics", () => {
  it("counts a retried playback event only once", () => {
    const event = {
      event_id: "listen:1", track_id: "song-1",
      track_snapshot: { title: "Song", artists: [{ id: "artist-1", name: "Artist" }],
        album: { id: "album-1", title: "Album" }, genre: "Pop" },
      context: { type: "playlist", id: "playlist-1" },
      played_duration_ms: 60000, listened_at: "2026-10-20T10:00:00.000Z",
    };
    const result = summarizeEvents([event, event]);
    expect(result.plays).toBe(1);
    expect(result.minutes).toBe(1);
    expect(result.topTracks[0]).toMatchObject({ id: "song-1", plays: 1 });
    expect(result.topArtists[0].name).toBe("Artist");
    expect(result.topAlbums[0].name).toBe("Album");
    expect(result.topGenres[0].name).toBe("Pop");
    expect(result.topPlaylists[0].id).toBe("playlist-1");
  });
});
