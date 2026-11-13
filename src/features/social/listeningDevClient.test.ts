import { beforeEach, describe, expect, it } from "vitest";
import { createDevListeningClient } from "./listeningDevClient";
import type { ListeningPlaylistSnapshot } from "./listeningClient";

const playlist: ListeningPlaylistSnapshot = {
  id: "playlist-1",
  title: "Mix",
  coverUrl: "",
  trackCount: 1,
  durationMs: 60_000,
  tracks: [{ id: "track-1", title: "Track", artists: "Artist", coverUrl: "", durationMs: 60_000 }],
};

describe("dev listening backend", () => {
  const client = createDevListeningClient();

  beforeEach(() => {
    localStorage.clear();
  });

  it("starts a local session with the selected playlist", async () => {
    const room = await client.createRoom("track-1", "Track", 1_000, true, [], playlist, "all", true);
    expect(room).toMatchObject({
      active: true,
      host_id: "dev-guest",
      playlist_title: "Mix",
      repeat_mode: "all",
      shuffle: true,
    });
    const snapshot = await client.snapshot();
    expect(snapshot.room?.id).toBe(room.id);
    expect(snapshot.members).toHaveLength(1);
    expect(snapshot.members[0]).toMatchObject({ user_id: "dev-guest", status: "active" });
  });

  it("publishes playback, handles queue commands and votes", async () => {
    const room = await client.createRoom("track-1", "Track", 1_000, true, []);
    await client.publish(room.id, "track-2", "Next", 2_000, true, [
      { index: 1, id: "track-2", title: "Next", artists: "Artist" },
    ]);
    const snapshot = await client.snapshot();
    expect(snapshot.room).toMatchObject({ track_id: "track-2", position_ms: 2_000, is_playing: true });
    expect(snapshot.room?.queue_snapshot).toHaveLength(1);

    await client.request(room.id, "skip");
    const pending = await client.pendingCommands(room.id);
    expect(pending).toHaveLength(1);
    expect(await client.claimCommand(pending[0].id)).toBe(true);
    expect(await client.pendingCommands(room.id)).toHaveLength(0);

    await client.toggleVote(room.id, "track-2", false);
    expect(await client.votes(room.id)).toEqual([
      { room_id: room.id, track_id: "track-2", voter_id: "dev-guest" },
    ]);
    await client.toggleVote(room.id, "track-2", true);
    expect(await client.votes(room.id)).toHaveLength(0);
  });

  it("ends the session and hides it from the snapshot", async () => {
    const room = await client.createRoom(null, null, 0, false, []);
    await client.end(room.id);
    expect((await client.snapshot()).room).toBeNull();
  });
});
