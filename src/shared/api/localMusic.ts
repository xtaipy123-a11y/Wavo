import type {
  ApiLikedTracksPage,
  PlaybackHistoryItem,
  PlaybackHistoryResponse,
  RecordPlaybackEventRequest,
  Track,
} from "../contracts";
import { getAuthSession } from "./auth-session";

type LikedEntry = { track: Track; likedAt: string };
type CollectionType = "albums" | "artists" | "playlists";
type SavedCollection = { id: string; value: Record<string, unknown>; savedAt: string };

function changed(kind: "like" | "album" | "artist" | "catalog_playlist" | "history", id: string, payload: unknown, deleted = false): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("wavo:cloud-change", { detail: { kind, id, payload, deleted } }));
}

function storageKey(kind: "likes" | "history" | CollectionType): string | null {
  const userId = getAuthSession()?.user?.id;
  return userId ? `wavo_local_${kind}_${userId}` : null;
}

function readItems<T>(kind: "likes" | "history" | CollectionType): T[] {
  const key = storageKey(kind);
  if (!key || typeof localStorage === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}

function writeItems<T>(kind: "likes" | "history" | CollectionType, items: T[]): void {
  const key = storageKey(kind);
  if (!key || typeof localStorage === "undefined") {
    throw new Error("Sign in to save your music library.");
  }
  localStorage.setItem(key, JSON.stringify(items));
}

function page<T>(items: T[], limit: number, cursor?: string) {
  const offset = Math.max(0, Number(cursor) || 0);
  const size = Math.max(1, Math.min(100, limit));
  return {
    items: items.slice(offset, offset + size),
    nextCursor: offset + size < items.length ? String(offset + size) : null,
  };
}

export const localMusic = {
  listSavedCollections(type: CollectionType): { items: Record<string, unknown>[] } {
    const singular = type.slice(0, -1);
    return {
      items: readItems<SavedCollection>(type).map((entry) => ({
        [singular]: entry.value,
        savedAt: entry.savedAt,
      })),
    };
  },

  saveCollection(type: CollectionType, id: string, value: Record<string, unknown>): void {
    const current = readItems<SavedCollection>(type);
    if (current.some((entry) => entry.id === id)) return;
    const entry = { id, value, savedAt: new Date().toISOString() };
    writeItems(type, [entry, ...current].slice(0, 5000));
    changed(type === "playlists" ? "catalog_playlist" : type === "albums" ? "album" : "artist", id, entry);
  },

  removeCollection(type: CollectionType, id: string): void {
    writeItems(type, readItems<SavedCollection>(type).filter((entry) => entry.id !== id));
    changed(type === "playlists" ? "catalog_playlist" : type === "albums" ? "album" : "artist", id, {}, true);
  },

  listLikedTracks(limit = 100, cursor?: string): ApiLikedTracksPage {
    return page(readItems<LikedEntry>("likes"), limit, cursor);
  },

  likeTrack(track: Track): void {
    const current = readItems<LikedEntry>("likes");
    if (current.some((entry) => entry.track.id === track.id)) return;
    const entry = { track, likedAt: new Date().toISOString() };
    writeItems("likes", [entry, ...current].slice(0, 5000));
    changed("like", track.id, entry);
  },

  unlikeTrack(id: string): void {
    writeItems("likes", readItems<LikedEntry>("likes").filter((entry) => entry.track.id !== id));
    changed("like", id, {}, true);
  },

  recordPlaybackEvent(payload: RecordPlaybackEventRequest): void {
    const track = payload.trackSnapshot;
    if (!track?.id) return;
    const current = readItems<PlaybackHistoryItem>("history");
    const item: PlaybackHistoryItem = {
      id: `${payload.playbackSessionId}:${Date.now()}`,
      playbackSessionId: payload.playbackSessionId,
      listeningSessionId: payload.listeningSessionId,
      track,
      playedDurationMs: payload.playedDurationMs,
      completionRate: payload.completionRate,
      completed: Boolean(payload.completed),
      skipped: Boolean(payload.skipped),
      loopCount: payload.loopCount ?? 0,
      hasSeekBackward: Boolean(payload.hasSeekBackward),
      context: payload.context,
      listenedAt: new Date().toISOString(),
    };
    writeItems("history", [item, ...current].slice(0, 500));
    changed("history", item.id, item);
  },

  getHistory(cursor?: string, limit = 30): PlaybackHistoryResponse {
    return page(readItems<PlaybackHistoryItem>("history"), limit, cursor);
  },

  cloudSnapshot(): Array<{ kind: "like" | "album" | "artist" | "catalog_playlist" | "history"; id: string; payload: unknown }> {
    return [
      ...readItems<LikedEntry>("likes").map((entry) => ({ kind: "like" as const, id: entry.track.id, payload: entry })),
      ...(["albums", "artists", "playlists"] as const).flatMap((type) => readItems<SavedCollection>(type).map((entry) => ({
        kind: (type === "albums" ? "album" : type === "artists" ? "artist" : "catalog_playlist") as "album" | "artist" | "catalog_playlist",
        id: entry.id, payload: entry,
      }))),
      ...readItems<PlaybackHistoryItem>("history").map((entry) => ({ kind: "history" as const, id: entry.id, payload: entry })),
    ];
  },

  applyCloudItem(kind: "like" | "album" | "artist" | "catalog_playlist" | "history", id: string, payload: unknown, deleted: boolean): void {
    const type = kind === "like" ? "likes" : kind === "album" ? "albums" : kind === "artist" ? "artists" : kind === "catalog_playlist" ? "playlists" : "history";
    if (kind === "like") {
      const entries = readItems<LikedEntry>("likes").filter((entry) => entry.track.id !== id);
      if (!deleted && payload && typeof payload === "object" && "track" in payload) entries.unshift(payload as LikedEntry);
      writeItems("likes", entries.slice(0, 5000));
    } else if (kind === "history") {
      const entries = readItems<PlaybackHistoryItem>("history").filter((entry) => entry.id !== id);
      if (!deleted && payload && typeof payload === "object" && "track" in payload) entries.unshift(payload as PlaybackHistoryItem);
      writeItems("history", entries.sort((a, b) => b.listenedAt.localeCompare(a.listenedAt)).slice(0, 500));
    } else {
      const entries = readItems<SavedCollection>(type as CollectionType).filter((entry) => entry.id !== id);
      if (!deleted && payload && typeof payload === "object" && "value" in payload) entries.unshift(payload as SavedCollection);
      writeItems(type as CollectionType, entries.slice(0, 5000));
    }
    if (typeof window !== "undefined") window.dispatchEvent(new Event("library:changed"));
  },
};
