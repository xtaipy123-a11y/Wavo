import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { wavoDb } from "./wavoDb";
import { audioCache } from "./audioCache";
import { setAuthSession } from "@/shared/api/auth-session";

describe("wavoDb storage layer", () => {
  beforeEach(async () => {
    await wavoDb.clearAll();
  });

  it("stores and retrieves track metadata", async () => {
    await wavoDb.putTrack({
      id: "track_test_1",
      title: "Test Song",
      artists: "Test Artist",
      durationMs: 180000,
      coverUrl: "",
      playCount: 0,
    });

    const record = await wavoDb.getTrack("track_test_1");
    expect(record).not.toBeNull();
    expect(record?.title).toBe("Test Song");
    expect(record?.artists).toBe("Test Artist");
    expect(record?.durationMs).toBe(180000);
  });

  it("stores, checks, and calculates total bytes for audio blobs", async () => {
    const dummyBlob = new Blob(["dummy audio data content"], { type: "audio/ogg" });
    await audioCache.saveAudioBlob("track_audio_1", dummyBlob, "audio/ogg");

    const hasAudio = await audioCache.hasAudio("track_audio_1");
    expect(hasAudio).toBe(true);

    const totalBytes = await wavoDb.getTotalAudioBytes();
    expect(totalBytes).toBe(dummyBlob.size);

    await audioCache.deleteAudio("track_audio_1");
    const hasAudioAfter = await audioCache.hasAudio("track_audio_1");
    expect(hasAudioAfter).toBe(false);
  });

  it("keeps private upload audio separate when accounts change on one device", async () => {
    const login = (id: string) => setAuthSession({ accessToken: "", refreshToken: "", accessTokenExpiresAt: "",
      expiresAt: 0, user: { id, email: "", username: null, displayName: null, avatarUrl: null, bio: null } });
    const uploadId = "upload:11111111-1111-4111-8111-111111111111";
    const firstUser = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    try {
      login(firstUser);
      await wavoDb.putAudio(uploadId, new Blob(["private"], { type: "audio/mpeg" }), "audio/mpeg");
      expect(await wavoDb.hasAudio(uploadId)).toBe(true);
      login("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
      expect(await wavoDb.getAudio(uploadId)).toBeNull();
      expect(await wavoDb.getAudio(`private-audio:${firstUser}:${uploadId}`)).toBeNull();
      login(firstUser);
      expect((await wavoDb.getAudio(uploadId))?.byteSize).toBe(7);
    } finally { setAuthSession(null); }
  });

  it("stores lyrics and updates weekly checked timestamp", async () => {
    const initialTime = Date.now() - 10000;
    await wavoDb.putLyrics({
      trackId: "track_lyric_1",
      syncLevel: "word_level",
      quality: 95,
      activeProvider: "kugou",
      availableProviders: [],
      rawLyrics: "[00:01.00] Hello world",
      rawFormat: "lrc",
      candidate: {
        provider: "kugou",
        contentKind: "word_synced",
        syncLevel: "word_level",
        quality: {
          total: 95,
          match: 30,
          content: 30,
          sync: 35,
          source: 0,
          reasons: [],
        },
        lyrics: {
          format: "lrc",
          content: "[00:01.00] Hello world",
        },
      },
      lastCheckedAt: initialTime,
      updatedAt: initialTime,
    });

    const record = await wavoDb.getLyrics("track_lyric_1");
    expect(record).not.toBeNull();
    expect(record?.syncLevel).toBe("word_level");
    expect(record?.quality).toBe(95);
    expect(record?.lastCheckedAt).toBe(initialTime);

    await wavoDb.updateLyricsChecked("track_lyric_1");
    const updated = await wavoDb.getLyrics("track_lyric_1");
    expect(updated?.lastCheckedAt).toBeGreaterThan(initialTime);

    await wavoDb.putLyrics({
      trackId: "track_line_only",
      syncLevel: "line_level",
      quality: 60,
      activeProvider: "lrclib",
      availableProviders: [],
      rawLyrics: "[00:01.00] Line only",
      rawFormat: "lrc",
      candidate: {
        provider: "lrclib",
        contentKind: "line_synced",
        syncLevel: "line_level",
        quality: {
          total: 60,
          match: 20,
          content: 20,
          sync: 20,
          source: 0,
          reasons: [],
        },
        lyrics: {
          format: "lrc",
          content: "[00:01.00] Line only",
        },
      },
      lastCheckedAt: initialTime,
      updatedAt: initialTime,
    });
    const lineRecord = await wavoDb.getLyrics("track_line_only");
    expect(lineRecord).not.toBeNull();
    expect(lineRecord?.activeProvider).toBe("lrclib");
    expect(lineRecord?.syncLevel).toBe("line_level");

    // cadence / polaris with line_level should not be cached
    await wavoDb.putLyrics({
      trackId: "track_cadence_line",
      syncLevel: "line_level",
      quality: 70,
      activeProvider: "cadence",
      availableProviders: [],
      rawLyrics: "[00:01.00] Cadence line",
      rawFormat: "lrc",
      candidate: {
        provider: "cadence",
        contentKind: "line_synced",
        syncLevel: "line_level",
        quality: {
          total: 70,
          match: 20,
          content: 20,
          sync: 30,
          source: 0,
          reasons: [],
        },
        lyrics: {
          format: "lrc",
          content: "[00:01.00] Cadence line",
        },
      },
      lastCheckedAt: initialTime,
      updatedAt: initialTime,
    });
    const cadenceRecord = await wavoDb.getLyrics("track_cadence_line");
    expect(cadenceRecord).toBeNull();
  });

  it("stores artist data and calculates total artist bytes", async () => {
    const initialTime = Date.now() - 50000;
    await wavoDb.putArtist({
      id: "artist_test_1",
      data: {
        title: "Test Artist",
        description: "Bio",
        coverUrl: "https://example.com/cover.jpg",
        verified: true,
        tracks: [],
        popularSongs: [],
        albums: [],
        reposts: [],
        singles: [],
      },
      savedAt: initialTime,
      lastCheckedAt: initialTime,
    });

    const record = await wavoDb.getArtist("artist_test_1");
    expect(record).not.toBeNull();
    expect(record?.data.title).toBe("Test Artist");
    expect(record?.lastCheckedAt).toBe(initialTime);

    const totalBytes = await wavoDb.getTotalArtistBytes();
    expect(totalBytes).toBeGreaterThan(0);

    await wavoDb.updateArtistChecked("artist_test_1");
    const updated = await wavoDb.getArtist("artist_test_1");
    expect(updated?.lastCheckedAt).toBeGreaterThan(initialTime);
  });

  it("keeps only the most recent audio blobs in memory instead of every played track", async () => {
    for (let i = 1; i <= 6; i++) {
      await wavoDb.putAudio(`track_mem_${i}`, new Blob([`audio ${i}`], { type: "audio/ogg" }), "audio/ogg");
    }
    const inMemory = [...(wavoDb as unknown as { memAudio: Map<string, unknown> }).memAudio.keys()];
    expect(inMemory).toEqual(["track_mem_4", "track_mem_5", "track_mem_6"]);

    await wavoDb.getAudio("track_mem_5");
    const afterRead = [...(wavoDb as unknown as { memAudio: Map<string, unknown> }).memAudio.keys()];
    expect(afterRead).toEqual(["track_mem_4", "track_mem_6", "track_mem_5"]);
  });

  it("tracks lastPlayedAt on putAudio and touchAudio", async () => {
    const blob1 = new Blob(["audio content 1"], { type: "audio/ogg" });
    const earlyTime = 100000;
    await wavoDb.putAudio("track_lru_1", blob1, "audio/ogg", earlyTime);

    const initial = await wavoDb.getAudio("track_lru_1");
    expect(initial?.lastPlayedAt).toBe(earlyTime);

    await wavoDb.touchAudio("track_lru_1");
    const touched = await wavoDb.getAudio("track_lru_1");
    expect(touched?.lastPlayedAt).toBeGreaterThan(earlyTime);
  });

  it("enforces cache limit and evicts oldest played tracks first", async () => {
    const chunk1 = new Blob(["1234567890".repeat(10)], { type: "audio/ogg" });
    const chunk2 = new Blob(["1234567890".repeat(10)], { type: "audio/ogg" });
    const chunk3 = new Blob(["1234567890".repeat(10)], { type: "audio/ogg" });

    await wavoDb.putAudio("track_oldest", chunk1, "audio/ogg", 1000);
    await wavoDb.putAudio("track_middle", chunk2, "audio/ogg", 2000);
    await wavoDb.putAudio("track_newest", chunk3, "audio/ogg", 3000);

    const initialTotal = await wavoDb.getTotalAudioBytes();
    expect(initialTotal).toBe(300);

    const limit = 200;
    const evicted = await audioCache.enforceCacheLimit(limit);
    expect(evicted).toBeGreaterThan(0);

    const hasOldest = await audioCache.hasAudio("track_oldest");
    const hasNewest = await audioCache.hasAudio("track_newest");

    expect(hasOldest).toBe(false);
    expect(hasNewest).toBe(true);
  });

  it("keeps offline downloads through cache eviction and ordinary cache clearing", async () => {
    const track = { id: "offline_song", title: "Saved song", artists: "Artist", coverUrl: "", durationMs: 1000, playCount: 0 };
    const blob = new Blob(["1234567890".repeat(10)], { type: "audio/ogg" });
    await wavoDb.pinAudio(track, blob);
    await wavoDb.putAudio("offline_song", blob, "audio/ogg");
    await wavoDb.putAudio("temporary_song", blob, "audio/ogg");

    await audioCache.enforceCacheLimit(100);
    expect((await wavoDb.getAudio("offline_song"))?.pinned).toBe(true);
    expect(await wavoDb.hasAudio("temporary_song")).toBe(false);

    await wavoDb.putAudio("temporary_song", blob, "audio/ogg");
    await wavoDb.clearUnpinnedAudio();
    await wavoDb.close();
    expect((await wavoDb.getPinnedAudioRecords()).map((item) => item.downloadTrack?.title)).toEqual(["Saved song"]);
    expect(await wavoDb.hasAudio("temporary_song")).toBe(false);
  });

  it("handles getLimitBytes and setLimitBytes with defaults and clamping", async () => {
    const memStorage = new Map<string, string>();
    const mockStorage = {
      getItem: (key: string) => memStorage.get(key) ?? null,
      setItem: (key: string, val: string) => memStorage.set(key, val),
      removeItem: (key: string) => memStorage.delete(key),
      clear: () => memStorage.clear(),
      length: 0,
      key: () => null,
    };
    Object.defineProperty(window, "localStorage", {
      value: mockStorage,
      writable: true,
      configurable: true,
    });

    expect(audioCache.getLimitBytes()).toBe(3 * 1024 * 1024 * 1024);

    await audioCache.setLimitBytes(100);
    expect(audioCache.getLimitBytes()).toBe(250 * 1024 * 1024);

    await audioCache.setLimitBytes(0);
    expect(audioCache.getLimitBytes()).toBe(0);

    await audioCache.setLimitBytes(5 * 1024 * 1024 * 1024);
    expect(audioCache.getLimitBytes()).toBe(5 * 1024 * 1024 * 1024);
  });
});
