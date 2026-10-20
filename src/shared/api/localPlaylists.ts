import type { ApiUserPlaylist, ApiUserPlaylistItem, Track } from "@/shared/contracts";
import { wavoDb, type StoredUserPlaylistRecord } from "@/shared/storage/wavoDb";
import { getAuthSession } from "./auth-session";

const mutationQueues = new Map<string, Promise<unknown>>();

export interface PlaylistBackup {
  format: "wavo-playlists";
  version: 1;
  exportedAt: string;
  playlists: Array<{ title: string; description?: string; tracks: Track[] }>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBackup(value: unknown): PlaylistBackup["playlists"] {
  if (!isObject(value) || value.format !== "wavo-playlists" || value.version !== 1 || !Array.isArray(value.playlists) || value.playlists.length > 500) {
    throw new Error("Invalid Wavo playlist backup.");
  }
  let totalTracks = 0;
  return value.playlists.map((rawPlaylist) => {
    if (!isObject(rawPlaylist) || typeof rawPlaylist.title !== "string" || !rawPlaylist.title.trim() || rawPlaylist.title.length > 200 || !Array.isArray(rawPlaylist.tracks) || rawPlaylist.tracks.length > 10_000) {
      throw new Error("Invalid playlist in backup.");
    }
    totalTracks += rawPlaylist.tracks.length;
    if (totalTracks > 50_000) throw new Error("Backup has too many tracks.");
    const tracks: Track[] = rawPlaylist.tracks.map((rawTrack) => {
      if (!isObject(rawTrack) || typeof rawTrack.id !== "string" || !rawTrack.id || typeof rawTrack.title !== "string" || !rawTrack.title || !Array.isArray(rawTrack.artists) || rawTrack.id.length > 500 || rawTrack.title.length > 500) {
        throw new Error("Invalid track in backup.");
      }
      const artists = rawTrack.artists.map((artist) => {
        if (!isObject(artist) || typeof artist.name !== "string" || typeof artist.id !== "string") throw new Error("Invalid artist in backup.");
        return { id: artist.id, name: artist.name };
      });
      return {
        id: rawTrack.id,
        title: rawTrack.title,
        artists,
        durationMs: typeof rawTrack.durationMs === "number" && Number.isFinite(rawTrack.durationMs) && rawTrack.durationMs >= 0 ? rawTrack.durationMs : 0,
        ...(isObject(rawTrack.cover) && typeof rawTrack.cover.url === "string" ? { cover: { url: rawTrack.cover.url, width: typeof rawTrack.cover.width === "number" ? rawTrack.cover.width : 512, height: typeof rawTrack.cover.height === "number" ? rawTrack.cover.height : 512 } } : {}),
        ...(typeof rawTrack.explicit === "boolean" ? { explicit: rawTrack.explicit } : {}),
        ...(isObject(rawTrack.album) && typeof rawTrack.album.id === "string" && typeof rawTrack.album.title === "string" ? { album: { id: rawTrack.album.id, title: rawTrack.album.title } } : {}),
      };
    });
    return { title: rawPlaylist.title.trim(), ...(typeof rawPlaylist.description === "string" ? { description: rawPlaylist.description.slice(0, 2000) } : {}), tracks };
  });
}

function ownerId(): string {
  const session = getAuthSession();
  if (!session?.user?.id) throw new Error("Sign in to manage playlists.");
  return session.user.id;
}

function newId(prefix: string): string {
  return `${prefix}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
}

function queueMutation<T>(owner: string, playlistId: string, action: () => Promise<T>): Promise<T> {
  const key = `${owner}:${playlistId}`;
  const previous = mutationQueues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(action);
  mutationQueues.set(key, current);
  void current.finally(() => {
    if (mutationQueues.get(key) === current) mutationQueues.delete(key);
  }).catch(() => {});
  return current;
}

async function requireRecord(owner: string, playlistId: string): Promise<StoredUserPlaylistRecord> {
  const record = await wavoDb.getUserPlaylistRecord(owner, playlistId);
  if (!record) throw new Error("Playlist not found.");
  return record;
}

function updateRecord(record: StoredUserPlaylistRecord, items: ApiUserPlaylistItem[]): StoredUserPlaylistRecord {
  const now = new Date().toISOString();
  return {
    ...record,
    playlist: { ...record.playlist, revision: record.playlist.revision + 1, updatedAt: now },
    items: items.map((item, position) => ({ ...item, position })),
  };
}

export const localPlaylists = {
  async exportBackup(): Promise<PlaylistBackup> {
    const records = await wavoDb.listUserPlaylistRecords(ownerId());
    return {
      format: "wavo-playlists",
      version: 1,
      exportedAt: new Date().toISOString(),
      playlists: records.map(({ playlist, items }) => ({
        title: playlist.title,
        ...(playlist.description ? { description: playlist.description } : {}),
        tracks: items.map(({ track }) => track),
      })),
    };
  },

  async importBackup(input: unknown): Promise<number> {
    const playlists = parseBackup(input);
    const owner = ownerId();
    const now = new Date().toISOString();
    for (const source of playlists) {
      const id = newId("wavo_pl");
      await wavoDb.putUserPlaylistRecord({
        storageId: `${owner}:${id}`,
        ownerId: owner,
        playlist: { id, title: source.title, ...(source.description ? { description: source.description } : {}), isPublic: false, createdAt: now, updatedAt: now, revision: 1, ownerId: owner },
        items: source.tracks.map((track, position) => ({ id: newId("wavo_item"), track, position, addedAt: now })),
      });
    }
    return playlists.length;
  },

  async list(): Promise<{ items: ApiUserPlaylist[] }> {
    const owner = ownerId();
    const records = await wavoDb.listUserPlaylistRecords(owner);
    return { items: records.map((record) => record.playlist).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) };
  },

  async get(playlistId: string): Promise<{ playlist: ApiUserPlaylist; items: ApiUserPlaylistItem[] }> {
    const record = await requireRecord(ownerId(), playlistId);
    return { playlist: record.playlist, items: record.items };
  },

  async create(input: { title: string; description?: string; isPublic?: boolean }): Promise<ApiUserPlaylist> {
    const owner = ownerId();
    const now = new Date().toISOString();
    const playlist: ApiUserPlaylist = {
      id: newId("wavo_pl"),
      title: input.title.trim() || "Untitled playlist",
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      isPublic: false,
      createdAt: now,
      updatedAt: now,
      revision: 1,
      ownerId: owner,
    };
    await wavoDb.putUserPlaylistRecord({ storageId: `${owner}:${playlist.id}`, ownerId: owner, playlist, items: [] });
    return playlist;
  },

  async update(playlistId: string, input: { title?: string; description?: string | null; isPublic?: boolean }): Promise<ApiUserPlaylist> {
    const owner = ownerId();
    return queueMutation(owner, playlistId, async () => {
      const record = await requireRecord(owner, playlistId);
      const playlist: ApiUserPlaylist = {
        ...record.playlist,
        ...(input.title !== undefined ? { title: input.title.trim() || record.playlist.title } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || undefined } : {}),
        isPublic: false,
        revision: record.playlist.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      await wavoDb.putUserPlaylistRecord({ ...record, playlist });
      return playlist;
    });
  },

  async delete(playlistId: string): Promise<void> {
    const owner = ownerId();
    return queueMutation(owner, playlistId, () => wavoDb.deleteUserPlaylistRecord(owner, playlistId));
  },

  async addTrack(playlistId: string, track: Track): Promise<ApiUserPlaylistItem> {
    const owner = ownerId();
    return queueMutation(owner, playlistId, async () => {
      const record = await requireRecord(owner, playlistId);
      const existing = record.items.find((item) => item.track.id === track.id);
      if (existing) return existing;
      const item: ApiUserPlaylistItem = {
        id: newId("wavo_item"),
        track,
        position: record.items.length,
        addedAt: new Date().toISOString(),
      };
      await wavoDb.putUserPlaylistRecord(updateRecord(record, [...record.items, item]));
      return item;
    });
  },

  async addTracks(playlistId: string, tracks: Track[]): Promise<{ items: ApiUserPlaylistItem[]; added: number; rejected: number }> {
    const owner = ownerId();
    return queueMutation(owner, playlistId, async () => {
      const record = await requireRecord(owner, playlistId);
      const seen = new Set(record.items.map((item) => item.track.id));
      const addedItems: ApiUserPlaylistItem[] = [];
      for (const track of tracks) {
        if (!track?.id || seen.has(track.id)) continue;
        seen.add(track.id);
        addedItems.push({
          id: newId("wavo_item"),
          track,
          position: record.items.length + addedItems.length,
          addedAt: new Date().toISOString(),
        });
      }
      if (addedItems.length) await wavoDb.putUserPlaylistRecord(updateRecord(record, [...record.items, ...addedItems]));
      return { items: addedItems, added: addedItems.length, rejected: tracks.length - addedItems.length };
    });
  },

  async removeItem(playlistId: string, itemId: string): Promise<void> {
    const owner = ownerId();
    return queueMutation(owner, playlistId, async () => {
      const record = await requireRecord(owner, playlistId);
      const items = record.items.filter((item) => item.id !== itemId);
      if (items.length !== record.items.length) await wavoDb.putUserPlaylistRecord(updateRecord(record, items));
    });
  },

  async moveItem(playlistId: string, itemId: string, beforeItemId: string | null): Promise<{ playlist: ApiUserPlaylist; items: ApiUserPlaylistItem[] }> {
    const owner = ownerId();
    return queueMutation(owner, playlistId, async () => {
      const record = await requireRecord(owner, playlistId);
      const items = [...record.items];
      const from = items.findIndex((item) => item.id === itemId);
      if (from < 0) throw new Error("Playlist track not found.");
      const [moving] = items.splice(from, 1);
      const to = beforeItemId === null ? items.length : items.findIndex((item) => item.id === beforeItemId);
      if (to < 0) throw new Error("Playlist position not found.");
      items.splice(to, 0, moving);
      const updated = updateRecord(record, items);
      await wavoDb.putUserPlaylistRecord(updated);
      return { playlist: updated.playlist, items: updated.items };
    });
  },
};
