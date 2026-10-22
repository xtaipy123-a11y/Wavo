import type { Track } from "@/shared/types";
import { getAuthSession } from "@/shared/api/auth-session";
import type { LyricsCandidate, LyricsSyncLevel } from "@/shared/contracts/lyrics";
import type { LyricsProviderOption } from "@/features/lyrics/store/lyricsStore";
import type { UserPlaylist, UserPlaylistItem } from "@/shared/contracts/playlists";
import {
  shouldCacheLyricsCandidate,
  compareLyricsCandidates,
} from "@/features/lyrics";

export interface CachedTrackRecord {
  id: string;
  title: string;
  artists: string;
  albumTitle?: string;
  albumId?: string;
  coverUrl?: string;
  durationMs: number;
  savedAt: number;
}

export interface CachedAudioRecord {
  trackId: string;
  blob: Blob;
  mimeType: string;
  byteSize: number;
  savedAt: number;
  lastPlayedAt?: number;
  pinned?: boolean;
  pinnedAt?: number;
  downloadTrack?: Track;
}

const PRIVATE_AUDIO_PREFIX = "private-audio:";
function audioStorageKey(trackId: string): string | null {
  // Internal keys must never be accepted as playable track IDs.
  if (trackId.startsWith(PRIVATE_AUDIO_PREFIX)) return null;
  if (!trackId.startsWith("upload:")) return trackId;
  const userId = getAuthSession()?.user?.id;
  return userId ? `${PRIVATE_AUDIO_PREFIX}${userId}:${trackId}` : null;
}

export interface CachedLyricsRecord {
  trackId: string;
  syncLevel: LyricsSyncLevel;
  quality: number;
  activeProvider: string;
  availableProviders: LyricsProviderOption[];
  rawLyrics: string;
  rawFormat: string;
  candidate: LyricsCandidate;
  providers?: Record<string, LyricsCandidate>;
  lastCheckedAt: number;
  updatedAt: number;
  userLocked?: boolean;
}

export interface CachedArtistRecord {
  id: string;
  data: any;
  savedAt: number;
  lastCheckedAt: number;
}

export interface StoredUserPlaylistRecord {
  storageId: string;
  ownerId: string;
  playlist: UserPlaylist;
  items: UserPlaylistItem[];
}

const DB_NAME = "wavo_db_v1";
const DB_VERSION = 6;

const MEM_AUDIO_LIMIT = 3;

class WavoDb {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private isSupported = typeof indexedDB !== "undefined";

  private memTracks = new Map<string, CachedTrackRecord>();
  private memAudio = new Map<string, CachedAudioRecord>();
  private memLyrics = new Map<string, CachedLyricsRecord>();
  private memArtists = new Map<string, CachedArtistRecord>();

  private handleDbError(err: unknown) {
    this.dbPromise = null;
  }

  private open(): Promise<IDBDatabase> {
    if (!this.isSupported) {
      return Promise.reject(new Error("IndexedDB is not available"));
    }

    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (err) {
        this.dbPromise = null;
        reject(err);
        return;
      }

      request.onupgradeneeded = (event) => {
        const db = request.result;

        if (!db.objectStoreNames.contains("tracks")) {
          const trackStore = db.createObjectStore("tracks", { keyPath: "id" });
          trackStore.createIndex("savedAt", "savedAt", { unique: false });
        }

        if (!db.objectStoreNames.contains("audio")) {
          const audioStore = db.createObjectStore("audio", { keyPath: "trackId" });
          audioStore.createIndex("savedAt", "savedAt", { unique: false });
          audioStore.createIndex("byteSize", "byteSize", { unique: false });
          audioStore.createIndex("lastPlayedAt", "lastPlayedAt", { unique: false });
          audioStore.createIndex("pinnedAt", "pinnedAt", { unique: false });
        } else {
          const audioStore = request.transaction?.objectStore("audio");
          if (audioStore && !audioStore.indexNames.contains("lastPlayedAt")) {
            audioStore.createIndex("lastPlayedAt", "lastPlayedAt", { unique: false });
          }
          if (audioStore && !audioStore.indexNames.contains("pinnedAt")) {
            audioStore.createIndex("pinnedAt", "pinnedAt", { unique: false });
          }
        }

        if (!db.objectStoreNames.contains("lyrics")) {
          const lyricsStore = db.createObjectStore("lyrics", { keyPath: "trackId" });
          lyricsStore.createIndex("lastCheckedAt", "lastCheckedAt", { unique: false });
          lyricsStore.createIndex("syncLevel", "syncLevel", { unique: false });
        } else if (event.oldVersion < 4) {
          // clear legacy lyrics store on v4 migration
          try {
            request.transaction?.objectStore("lyrics").clear();
          } catch {}
        }

        if (!db.objectStoreNames.contains("artists")) {
          const artistStore = db.createObjectStore("artists", { keyPath: "id" });
          artistStore.createIndex("lastCheckedAt", "lastCheckedAt", { unique: false });
        }

        if (!db.objectStoreNames.contains("userPlaylists")) {
          db.createObjectStore("userPlaylists", { keyPath: "storageId" });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onclose = () => {
          this.dbPromise = null;
        };
        db.onversionchange = () => {
          try {
            db.close();
          } catch {}
          this.dbPromise = null;
        };
        db.onerror = () => {
          this.dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error);
      };

      request.onblocked = () => {
        this.dbPromise = null;
      };
    });

    return this.dbPromise;
  }

  // executes indexeddb transaction with one auto-reconnect retry and zero unhandled rejections
  private async runTransaction<T>(
    storeName: "tracks" | "audio" | "lyrics" | "artists" | "userPlaylists",
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T | null> {
    if (!this.isSupported) return null;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const db = await this.open();
        return await new Promise<T>((resolve, reject) => {
          try {
            const tx = db.transaction(storeName, mode);
            const store = tx.objectStore(storeName);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(new Error("tx aborted"));
            operation(store).then(resolve, reject);
          } catch (err) {
            reject(err);
          }
        });
      } catch (err) {
        this.handleDbError(err);
        if (attempt === 0) {
          // retry once on fresh connection
          continue;
        }
      }
    }
    return null;
  }

  async getTrack(id: string): Promise<CachedTrackRecord | null> {
    const mem = this.memTracks.get(id);
    if (mem) return mem;

    const result = await this.runTransaction("tracks", "readonly", (store) => {
      return new Promise<CachedTrackRecord | null>((resolve) => {
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    });

    if (result) {
      this.memTracks.set(id, result);
      return result;
    }
    return this.memTracks.get(id) || null;
  }

  async putTrack(track: Track): Promise<void> {
    const record: CachedTrackRecord = {
      id: track.id,
      title: track.title,
      artists: track.artists,
      albumTitle: track.album?.title,
      albumId: track.album?.id,
      coverUrl: track.coverUrl,
      durationMs: track.durationMs,
      savedAt: Date.now(),
    };
    this.memTracks.set(track.id, record);

    await this.runTransaction("tracks", "readwrite", (store) => {
      return new Promise<void>((resolve, reject) => {
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });
  }

  async getTotalTrackBytes(): Promise<number> {
    const result = await this.runTransaction("tracks", "readonly", (store) => {
      return new Promise<number>((resolve) => {
        let total = 0;
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            const val = cursor.value as CachedTrackRecord;
            total += JSON.stringify(val || {}).length * 2;
            cursor.continue();
          } else {
            resolve(total);
          }
        };
        req.onerror = () => resolve(0);
      });
    });

    if (result !== null && result !== undefined) {
      return result;
    }

    let total = 0;
    for (const item of this.memTracks.values()) {
      total += JSON.stringify(item || {}).length * 2;
    }
    return total;
  }

  private rememberAudio(trackId: string, record: CachedAudioRecord): void {
    this.memAudio.delete(trackId);
    this.memAudio.set(trackId, record);
    while (this.memAudio.size > MEM_AUDIO_LIMIT) {
      const oldest = this.memAudio.keys().next().value;
      if (oldest === undefined) break;
      this.memAudio.delete(oldest);
    }
  }

  async getAudio(trackId: string): Promise<CachedAudioRecord | null> {
    const key = audioStorageKey(trackId);
    if (!key) return null;
    const mem = this.memAudio.get(key);
    if (mem) {
      this.rememberAudio(key, mem);
      return mem;
    }

    const result = await this.runTransaction("audio", "readonly", (store) => {
      return new Promise<CachedAudioRecord | null>((resolve) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    });

    if (result) {
      this.rememberAudio(key, result);
      return result;
    }
    return this.memAudio.get(key) || null;
  }

  async putAudio(trackId: string, blob: Blob, mimeType: string, lastPlayedAt?: number): Promise<void> {
    const key = audioStorageKey(trackId);
    if (!key) throw new Error("Private audio requires a signed-in user.");
    const now = Date.now();
    const record = await this.runTransaction("audio", "readwrite", (store) => {
      return new Promise<CachedAudioRecord>((resolve, reject) => {
        const getRequest = store.get(key);
        getRequest.onerror = () => reject(getRequest.error);
        getRequest.onsuccess = () => {
          const existing = getRequest.result as CachedAudioRecord | undefined;
          const next: CachedAudioRecord = {
            trackId: key, blob, mimeType, byteSize: blob.size,
            savedAt: existing?.savedAt ?? now,
            lastPlayedAt: lastPlayedAt ?? now,
            pinned: existing?.pinned,
            pinnedAt: existing?.pinnedAt,
            downloadTrack: existing?.downloadTrack,
          };
          const putRequest = store.put(next);
          putRequest.onsuccess = () => resolve(next);
          putRequest.onerror = () => reject(putRequest.error);
        };
      });
    });
    if (record) {
      this.rememberAudio(key, record);
    } else {
      const existing = this.memAudio.get(key);
      this.rememberAudio(key, {
        trackId: key, blob, mimeType, byteSize: blob.size,
        savedAt: existing?.savedAt ?? now,
        lastPlayedAt: lastPlayedAt ?? now,
        pinned: existing?.pinned,
        pinnedAt: existing?.pinnedAt,
        downloadTrack: existing?.downloadTrack,
      });
    }
  }

  async pinAudio(track: Track, blob?: Blob): Promise<void> {
    const key = audioStorageKey(track.id);
    if (!key) throw new Error("Private audio requires a signed-in user.");
    const now = Date.now();
    const record = await this.runTransaction("audio", "readwrite", (store) => new Promise<CachedAudioRecord>((resolve, reject) => {
      const getRequest = store.get(key);
      getRequest.onerror = () => reject(getRequest.error);
      getRequest.onsuccess = () => {
        const existing = getRequest.result as CachedAudioRecord | undefined;
        const audio = blob ?? existing?.blob;
        if (!audio?.size) { reject(new Error("No complete audio file is available for this song.")); return; }
        const next: CachedAudioRecord = {
          trackId: key,
          blob: audio,
          mimeType: audio.type || existing?.mimeType || "audio/webm",
          byteSize: audio.size,
          savedAt: existing?.savedAt ?? now,
          lastPlayedAt: existing?.lastPlayedAt ?? now,
          pinned: true,
          pinnedAt: existing?.pinnedAt ?? now,
          downloadTrack: track,
        };
        const putRequest = store.put(next);
        putRequest.onsuccess = () => resolve(next);
        putRequest.onerror = () => reject(putRequest.error);
      };
    }));
    if (!record) throw new Error("The download could not be saved on this device.");
    this.rememberAudio(key, record);
    await this.putTrack(track);
  }

  async getPinnedAudioRecords(): Promise<CachedAudioRecord[]> {
    const records = await this.runTransaction("audio", "readonly", (store) => new Promise<CachedAudioRecord[]>((resolve, reject) => {
      const request = store.index("pinnedAt").getAll();
      request.onsuccess = () => resolve(request.result as CachedAudioRecord[]);
      request.onerror = () => reject(request.error);
    }));
    const ownPrefix = `${PRIVATE_AUDIO_PREFIX}${getAuthSession()?.user?.id ?? ""}:`;
    return (records ?? [...this.memAudio.values()]).filter((record) => record.pinned && record.downloadTrack &&
      (!record.trackId.startsWith(PRIVATE_AUDIO_PREFIX) || record.trackId.startsWith(ownPrefix)));
  }

  async clearUnpinnedAudio(): Promise<void> {
    for (const record of await this.getOldestAudioRecords()) {
      if (!record.pinned) await this.deleteAudio(record.trackId);
    }
  }

  async touchAudio(trackId: string): Promise<void> {
    const record = await this.getAudio(trackId);
    if (!record) return;
    record.lastPlayedAt = Date.now();
    this.rememberAudio(record.trackId, record);

    await this.runTransaction("audio", "readwrite", (store) => {
      return new Promise<void>((resolve) => {
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
    });
  }

  async getOldestAudioRecords(): Promise<CachedAudioRecord[]> {
    const result = await this.runTransaction("audio", "readonly", (store) => {
      return new Promise<CachedAudioRecord[]>((resolve) => {
        const records: CachedAudioRecord[] = [];
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            records.push(cursor.value as CachedAudioRecord);
            cursor.continue();
          } else {
            records.sort((a, b) => (a.lastPlayedAt ?? a.savedAt) - (b.lastPlayedAt ?? b.savedAt));
            resolve(records);
          }
        };
        req.onerror = () => resolve([]);
      });
    });

    if (result && result.length > 0) {
      return result;
    }

    const memList = Array.from(this.memAudio.values());
    memList.sort((a, b) => (a.lastPlayedAt ?? a.savedAt) - (b.lastPlayedAt ?? b.savedAt));
    return memList;
  }

  async hasAudio(trackId: string): Promise<boolean> {
    const key = audioStorageKey(trackId);
    if (!key) return false;
    if (this.memAudio.has(key)) return true;

    const result = await this.runTransaction("audio", "readonly", (store) => {
      return new Promise<boolean>((resolve) => {
        const req = store.count(IDBKeyRange.only(key));
        req.onsuccess = () => resolve(req.result > 0);
        req.onerror = () => resolve(false);
      });
    });

    return result ?? this.memAudio.has(key);
  }

  async deleteAudio(trackId: string): Promise<void> {
    const key = trackId.startsWith(PRIVATE_AUDIO_PREFIX) ? trackId : audioStorageKey(trackId);
    if (!key) return;
    this.memAudio.delete(key);

    await this.runTransaction("audio", "readwrite", (store) => {
      return new Promise<void>((resolve) => {
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
    });
  }

  async getTotalAudioBytes(): Promise<number> {
    const result = await this.runTransaction("audio", "readonly", (store) => {
      return new Promise<number>((resolve) => {
        let total = 0;
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            const val = cursor.value as CachedAudioRecord;
            total += val.byteSize || val.blob?.size || 0;
            cursor.continue();
          } else {
            resolve(total);
          }
        };
        req.onerror = () => resolve(0);
      });
    });

    if (result !== null && result !== undefined) {
      return result;
    }

    let total = 0;
    for (const item of this.memAudio.values()) {
      total += item.byteSize || 0;
    }
    return total;
  }

  async getLyrics(trackId: string): Promise<CachedLyricsRecord | null> {
    const mem = this.memLyrics.get(trackId);
    if (mem) return mem;

    const result = await this.runTransaction("lyrics", "readonly", (store) => {
      return new Promise<CachedLyricsRecord | null>((resolve) => {
        const req = store.get(trackId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    });

    if (result) {
      if (!result.providers) {
        result.providers = {};
        if (result.candidate) {
          result.providers[result.candidate.provider.toLowerCase().trim()] =
            result.candidate;
        }
        if (result.availableProviders) {
          for (const opt of result.availableProviders) {
            if (opt.candidate) {
              result.providers[opt.provider.toLowerCase().trim()] =
                opt.candidate;
            }
          }
        }
      }
      this.memLyrics.set(trackId, result);
      return result;
    }
    return this.memLyrics.get(trackId) || null;
  }

  async putLyrics(record: CachedLyricsRecord): Promise<void> {
    const providers: Record<string, LyricsCandidate> = {
      ...(record.providers || {}),
    };

    if (record.candidate && shouldCacheLyricsCandidate(record.candidate)) {
      providers[record.candidate.provider.toLowerCase().trim()] =
        record.candidate;
    }

    if (record.availableProviders) {
      for (const opt of record.availableProviders) {
        if (opt.candidate && shouldCacheLyricsCandidate(opt.candidate)) {
          providers[opt.candidate.provider.toLowerCase().trim()] =
            opt.candidate;
        }
      }
    }

    const validCandidates = Object.values(providers).filter(
      shouldCacheLyricsCandidate,
    );
    if (validCandidates.length === 0) {
      return;
    }

    const validOptions: LyricsProviderOption[] = validCandidates
      .map((c) => ({
        provider: c.provider,
        syncLevel: c.syncLevel,
        quality: c.quality.total,
        candidate: c,
      }))
      .sort((a, b) => compareLyricsCandidates(a.candidate, b.candidate));

    const primaryCandidate =
      record.candidate && shouldCacheLyricsCandidate(record.candidate)
        ? record.candidate
        : validOptions[0].candidate;

    const sanitizedRecord: CachedLyricsRecord = {
      ...record,
      syncLevel: primaryCandidate.syncLevel,
      quality: primaryCandidate.quality.total,
      activeProvider: primaryCandidate.provider,
      rawLyrics: primaryCandidate.lyrics.content,
      rawFormat: primaryCandidate.lyrics.format,
      candidate: primaryCandidate,
      providers,
      availableProviders: validOptions,
    };

    this.memLyrics.set(record.trackId, sanitizedRecord);

    await this.runTransaction("lyrics", "readwrite", (store) => {
      return new Promise<void>((resolve, reject) => {
        const req = store.put(sanitizedRecord);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });
  }

  async updateLyricsChecked(trackId: string): Promise<void> {
    const existing = await this.getLyrics(trackId);
    if (!existing) return;
    existing.lastCheckedAt = Date.now();
    await this.putLyrics(existing);
  }

  async getTotalLyricsBytes(): Promise<number> {
    const result = await this.runTransaction("lyrics", "readonly", (store) => {
      return new Promise<number>((resolve) => {
        let total = 0;
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            const val = cursor.value as CachedLyricsRecord;
            let recordBytes = 0;
            if (val.providers) {
              for (const cand of Object.values(val.providers)) {
                recordBytes += (cand.lyrics?.content?.length || 0) * 2;
              }
            } else {
              recordBytes = (val.rawLyrics?.length || 0) * 2;
            }
            total += recordBytes;
            cursor.continue();
          } else {
            resolve(total);
          }
        };
        req.onerror = () => resolve(0);
      });
    });

    if (result !== null && result !== undefined) {
      return result;
    }

    let total = 0;
    for (const item of this.memLyrics.values()) {
      let recordBytes = 0;
      if (item.providers) {
        for (const cand of Object.values(item.providers)) {
          recordBytes += (cand.lyrics?.content?.length || 0) * 2;
        }
      } else {
        recordBytes = (item.rawLyrics?.length || 0) * 2;
      }
      total += recordBytes;
    }
    return total;
  }

  async getArtist(id: string): Promise<CachedArtistRecord | null> {
    const mem = this.memArtists.get(id);
    if (mem) return mem;

    const result = await this.runTransaction("artists", "readonly", (store) => {
      return new Promise<CachedArtistRecord | null>((resolve) => {
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    });

    if (result) {
      this.memArtists.set(id, result);
      return result;
    }
    return this.memArtists.get(id) || null;
  }

  async putArtist(record: CachedArtistRecord): Promise<void> {
    this.memArtists.set(record.id, record);

    await this.runTransaction("artists", "readwrite", (store) => {
      return new Promise<void>((resolve, reject) => {
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });
  }

  async updateArtistChecked(id: string): Promise<void> {
    const existing = await this.getArtist(id);
    if (!existing) return;
    existing.lastCheckedAt = Date.now();
    await this.putArtist(existing);
  }

  async getTotalArtistBytes(): Promise<number> {
    const result = await this.runTransaction("artists", "readonly", (store) => {
      return new Promise<number>((resolve) => {
        let total = 0;
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            const val = cursor.value as CachedArtistRecord;
            total += JSON.stringify(val.data || {}).length * 2;
            cursor.continue();
          } else {
            resolve(total);
          }
        };
        req.onerror = () => resolve(0);
      });
    });

    if (result !== null && result !== undefined) {
      return result;
    }

    let total = 0;
    for (const item of this.memArtists.values()) {
      total += JSON.stringify(item.data || {}).length * 2;
    }
    return total;
  }

  async listUserPlaylistRecords(ownerId: string): Promise<StoredUserPlaylistRecord[]> {
    const records = await this.runTransaction("userPlaylists", "readonly", (store) =>
      new Promise<StoredUserPlaylistRecord[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result as StoredUserPlaylistRecord[]);
        request.onerror = () => reject(request.error);
      }),
    );
    if (records === null) throw new Error("Playlist storage is unavailable.");
    return records.filter((record) => record.ownerId === ownerId);
  }

  async getUserPlaylistRecord(ownerId: string, playlistId: string): Promise<StoredUserPlaylistRecord | null> {
    return this.runTransaction("userPlaylists", "readonly", (store) =>
      new Promise<StoredUserPlaylistRecord | null>((resolve, reject) => {
        const request = store.get(`${ownerId}:${playlistId}`);
        request.onsuccess = () => resolve((request.result as StoredUserPlaylistRecord | undefined) ?? null);
        request.onerror = () => reject(request.error);
      }),
    );
  }

  async putUserPlaylistRecord(record: StoredUserPlaylistRecord, silentCloud = false): Promise<void> {
    const result = await this.runTransaction("userPlaylists", "readwrite", (store) =>
      new Promise<boolean>((resolve, reject) => {
        const request = store.put(record);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      }),
    );
    if (!result) throw new Error("Playlist could not be saved on this device.");
    if (!silentCloud && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("wavo:cloud-change", {
      detail: { kind: "playlist", id: record.playlist.id, payload: record, deleted: false },
    }));
  }

  async deleteUserPlaylistRecord(ownerId: string, playlistId: string, silentCloud = false): Promise<void> {
    const result = await this.runTransaction("userPlaylists", "readwrite", (store) =>
      new Promise<boolean>((resolve, reject) => {
        const request = store.delete(`${ownerId}:${playlistId}`);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      }),
    );
    if (!result) throw new Error("Playlist could not be deleted on this device.");
    if (!silentCloud && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("wavo:cloud-change", {
      detail: { kind: "playlist", id: playlistId, payload: {}, deleted: true },
    }));
  }

  async clearStore(storeName: "tracks" | "audio" | "lyrics" | "artists"): Promise<void> {
    if (storeName === "tracks") this.memTracks.clear();
    if (storeName === "audio") this.memAudio.clear();
    if (storeName === "lyrics") this.memLyrics.clear();
    if (storeName === "artists") this.memArtists.clear();

    await this.runTransaction(storeName, "readwrite", (store) => {
      return new Promise<void>((resolve) => {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
    });
  }

  async close(): Promise<void> {
    if (this.dbPromise) {
      try {
        const db = await this.dbPromise;
        db.close();
      } catch {}
      this.dbPromise = null;
    }
  }

  async clearAll(): Promise<void> {
    this.memTracks.clear();
    this.memAudio.clear();
    this.memLyrics.clear();
    this.memArtists.clear();
    await this.clearStore("audio");
    await this.clearStore("tracks");
    await this.clearStore("lyrics");
    await this.clearStore("artists");
  }
}

export const wavoDb = new WavoDb();
