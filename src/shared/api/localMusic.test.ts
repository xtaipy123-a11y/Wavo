import { beforeEach, describe, expect, it, vi } from "vitest";
import { localMusic } from "./localMusic";
import { getAuthSession } from "./auth-session";
import type { RecordPlaybackEventRequest, Track } from "../contracts";

vi.mock("./auth-session", () => ({ getAuthSession: vi.fn() }));

const track: Track = {
  id: "song-1",
  title: "Example Song",
  artists: [{ id: "artist-1", name: "Example Artist" }],
  durationMs: 180000,
};

function setUser(id: string) {
  vi.mocked(getAuthSession).mockReturnValue({ user: { id }, accessToken: "test" } as ReturnType<typeof getAuthSession>);
}

beforeEach(() => {
  localStorage.clear();
  setUser("user-a");
});

describe("local music library", () => {
  it("persists likes separately for each signed-in account", () => {
    localMusic.likeTrack(track);
    expect(localMusic.listLikedTracks().items[0].track.title).toBe("Example Song");
    setUser("user-b");
    expect(localMusic.listLikedTracks().items).toEqual([]);
    setUser("user-a");
    localMusic.unlikeTrack(track.id);
    expect(localMusic.listLikedTracks().items).toEqual([]);
  });

  it("records playback snapshots and pages history", () => {
    const event: RecordPlaybackEventRequest = {
      playbackSessionId: "session-1",
      listeningSessionId: "listen-1",
      trackId: track.id,
      trackSnapshot: track,
      playedDurationMs: 45000,
      completionRate: 0.25,
    };
    localMusic.recordPlaybackEvent(event);
    localMusic.recordPlaybackEvent({ ...event, playbackSessionId: "session-2" });
    const first = localMusic.getHistory(undefined, 1);
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBe("1");
    expect(localMusic.getHistory(first.nextCursor!, 1).items[0].track).toEqual(track);
  });

  it("saves and removes album library entries", () => {
    localMusic.saveCollection("albums", "album-1", { id: "album-1", title: "Example Album" });
    expect(localMusic.listSavedCollections("albums").items[0]).toMatchObject({
      album: { title: "Example Album" },
    });
    localMusic.removeCollection("albums", "album-1");
    expect(localMusic.listSavedCollections("albums").items).toEqual([]);
  });
});
