import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { AuthTokens, Track } from "@/shared/contracts";
import { wavoDb } from "@/shared/storage/wavoDb";
import { setAuthSession } from "./auth-session";
import { api } from "./api";
import { localPlaylists } from "./localPlaylists";
import { finalizeImportedPlaylist } from "@/features/library/services/import/manager/finalizeImport";

function signIn(id: string): void {
  const session: AuthTokens = {
    accessToken: `test-token-${id}`,
    refreshToken: `test-refresh-${id}`,
    accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    user: { id },
  };
  setAuthSession(session);
}

function track(id: string): Track {
  return { id, title: `Track ${id}`, artists: [{ id: "artist", name: "Artist" }], durationMs: 120_000 };
}

afterEach(async () => {
  setAuthSession(null);
  await wavoDb.close();
});

describe("local user playlists", () => {
  it("persists imported tracks, edits and ordering across database reopen", async () => {
    signIn(`import-owner-${crypto.randomUUID()}`);
    const result = await finalizeImportedPlaylist("Road trip", "From Spotify", [track("song-a"), track("song-b"), track("song-a")]);
    expect(result.saved).toBe(2);

    const created = await api.getUserPlaylist(result.playlistId);
    expect(created.playlist.title).toBe("Road trip");
    expect(created.items.map((item) => item.track.id)).toEqual(["song-a", "song-b"]);

    const added = await api.addPlaylistTrackSnapshots(result.playlistId, [track("song-b"), track("song-c")]);
    expect(added).toMatchObject({ added: 1, rejected: 1 });
    const beforeMove = await api.getUserPlaylist(result.playlistId);
    const moved = await api.movePlaylistItem(result.playlistId, beforeMove.items[2].id, beforeMove.items[0].id, beforeMove.playlist.revision);
    expect(moved.items.map((item) => item.track.id)).toEqual(["song-c", "song-a", "song-b"]);

    await api.updatePlaylist(result.playlistId, { title: "New title" });
    await wavoDb.close();
    const reloaded = await api.getUserPlaylist(result.playlistId);
    expect(reloaded.playlist.title).toBe("New title");
    expect(reloaded.items.map((item) => item.track.id)).toEqual(["song-c", "song-a", "song-b"]);
    expect((await api.listPlaylists()).items.some((playlist) => playlist.id === result.playlistId)).toBe(true);

    await api.removePlaylistItem(result.playlistId, reloaded.items[1].id);
    expect((await api.getUserPlaylist(result.playlistId)).items.map((item) => item.track.id)).toEqual(["song-c", "song-b"]);
    await api.deletePlaylist(result.playlistId);
    await expect(api.getUserPlaylist(result.playlistId)).rejects.toThrow("Playlist not found");
  });

  it("keeps playlists separate between signed-in accounts", async () => {
    const firstOwner = `first-${crypto.randomUUID()}`;
    const secondOwner = `second-${crypto.randomUUID()}`;
    signIn(firstOwner);
    const playlist = await api.createPlaylist({ title: "Private mix" });
    await api.addPlaylistTrack(playlist.id, "song-a", track("song-a"));

    signIn(secondOwner);
    expect((await api.listPlaylists()).items).toEqual([]);
    await expect(api.getUserPlaylist(playlist.id)).rejects.toThrow("Playlist not found");

    signIn(firstOwner);
    expect((await api.getUserPlaylist(playlist.id)).items).toHaveLength(1);
    await api.deletePlaylist(playlist.id);
  });

  it("keeps concurrent additions and does not remove playlists when media cache is cleared", async () => {
    signIn(`parallel-${crypto.randomUUID()}`);
    const playlist = await api.createPlaylist({ title: "Concurrent import" });
    await Promise.all(Array.from({ length: 20 }, (_, index) =>
      api.addPlaylistTrack(playlist.id, `track-${index}`, track(`track-${index}`)),
    ));
    expect((await api.getUserPlaylist(playlist.id)).items).toHaveLength(20);
    await wavoDb.clearAll();
    expect((await api.getUserPlaylist(playlist.id)).items).toHaveLength(20);
    await api.deletePlaylist(playlist.id);
  });

  it("exports local playlists and restores copies under the currently signed-in account", async () => {
    const originalOwner = `backup-original-${crypto.randomUUID()}`;
    const restoredOwner = `backup-restored-${crypto.randomUUID()}`;
    signIn(originalOwner);
    const original = await api.createPlaylist({ title: "Road trip", description: "Favorites" });
    await api.addPlaylistTrackSnapshots(original.id, [track("song-a"), track("song-b")]);
    const backup = await localPlaylists.exportBackup();
    expect(backup.playlists).toHaveLength(1);
    expect(backup.playlists[0].tracks.map((item) => item.id)).toEqual(["song-a", "song-b"]);

    signIn(restoredOwner);
    expect(await localPlaylists.importBackup(backup)).toBe(1);
    const [copy] = (await api.listPlaylists()).items;
    expect(copy.title).toBe("Road trip");
    expect(copy.id).not.toBe(original.id);
    expect(copy.ownerId).toBe(restoredOwner);
    expect((await api.getUserPlaylist(copy.id)).items.map((item) => item.track.id)).toEqual(["song-a", "song-b"]);
    await api.deletePlaylist(copy.id);
    signIn(originalOwner);
    await api.deletePlaylist(original.id);
  });

  it("rejects malformed backups before writing playlists", async () => {
    signIn(`backup-invalid-${crypto.randomUUID()}`);
    await expect(localPlaylists.importBackup({ format: "wavo-playlists", version: 1, playlists: [{ title: "Unsafe", tracks: [{ id: "song", title: "Song", artists: "bad" }] }] })).rejects.toThrow();
    expect((await api.listPlaylists()).items).toEqual([]);
  });
});
