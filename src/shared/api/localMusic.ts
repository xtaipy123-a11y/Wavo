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
    writeItems(type, [{ id, value, savedAt: new Date().toISOString() }, ...current].slice(0, 500));
  },

  removeCollection(type: CollectionType, id: string): void {
    writeItems(type, readItems<SavedCollection>(type).filter((entry) => entry.id !== id));
  },

  listLikedTracks(limit = 100, cursor?: string): ApiLikedTracksPage {
    return page(readItems<LikedEntry>("likes"), limit, cursor);
  },

  likeTrack(track: Track): void {
    const current = readItems<LikedEntry>("likes");
    if (current.some((entry) => entry.track.id === track.id)) return;
    writeItems("likes", [
      { track, likedAt: new Date().toISOString() },
      ...current,
    ].slice(0, 500));
  },

  unlikeTrack(id: string): void {
    writeItems("likes", readItems<LikedEntry>("likes").filter((entry) => entry.track.id !== id));
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
  },

  getHistory(cursor?: string, limit = 30): PlaybackHistoryResponse {
    return page(readItems<PlaybackHistoryItem>("history"), limit, cursor);
  },
};
