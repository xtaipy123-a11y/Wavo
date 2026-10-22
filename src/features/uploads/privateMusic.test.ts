import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getSession: vi.fn(),
  storageFrom: vi.fn(),
  putAudio: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/supabase/client", () => ({
  getSupabaseClient: () => ({ from: mocks.from, auth: { getSession: mocks.getSession }, storage: { from: mocks.storageFrom } }),
}));
vi.mock("@/shared/storage/wavoDb", () => ({ wavoDb: { putAudio: mocks.putAudio } }));
vi.mock("tus-js-client", () => ({
  Upload: class {
    constructor(_file: File, private options: { onSuccess: () => void; onProgress: (sent: number, total: number) => void }) {}
    async findPreviousUploads() { return []; }
    start() { this.options.onProgress(1, 1); this.options.onSuccess(); }
  },
}));

import { getAuthSession, setAuthSession, toAuthTokens } from "@/shared/api/auth-session";
import { parseUploadTrackId, privateMusic, uploadTrackId } from "./privateMusic";

const userId = "42924c93-9914-4c5b-a102-218dc2f8233c";

describe("private music authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "test-access", user: { id: userId } } }, error: null });
    setAuthSession(toAuthTokens({
      access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600,
      user: { id: userId, user_metadata: {} },
    } as Session));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("loads releases for a signed-in user with a valid Supabase UUID", async () => {
    expect(getAuthSession()?.user.id).toBe(userId);
    const rows = [{ id: "release-1", owner_id: userId }];
    const query = { order: vi.fn(), limit: vi.fn() };
    query.order.mockReturnValue(query);
    query.limit.mockResolvedValue({ data: rows, error: null });
    mocks.from.mockReturnValue({ select: vi.fn(() => query) });

    await expect(privateMusic.releases()).resolves.toEqual(rows);
    expect(mocks.from).toHaveBeenCalledWith("wavo_releases");
  });

  it("queries only the current user's uploads", async () => {
    const query = { eq: vi.fn(), order: vi.fn(), limit: vi.fn() };
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockResolvedValue({ data: [], error: null });
    mocks.from.mockReturnValue({ select: vi.fn(() => query) });

    await expect(privateMusic.myUploads()).resolves.toEqual([]);
    expect(query.eq).toHaveBeenCalledWith("owner_id", userId);
  });

  it("rejects uploads when Supabase has no signed-in session", async () => {
    setAuthSession(null);
    const file = new File(["audio"], "song.mp3", { type: "audio/mpeg" });
    await expect(privateMusic.upload(file, "Song", "Artist")).rejects.toThrow("Bitte melde dich bei Wavo an.");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("recognizes a valid uploaded song ID for playback", () => {
    expect(parseUploadTrackId(uploadTrackId(userId))).toBe(userId);
  });

  it("registers an uploaded song without INSERT RETURNING, which the private RLS read policy rejects", async () => {
    const uploadId = "4e811760-0907-46a9-9243-f7d5e6d2e663";
    const releaseId = "83cbd5bd-0cf6-46ee-8ce4-d2690cb00449";
    const insertUpload = vi.fn().mockResolvedValue({ error: null });
    const insertRelease = vi.fn().mockResolvedValue({ error: null });
    const insertTrack = vi.fn().mockResolvedValue({ error: null });
    mocks.from.mockImplementation((name: string) => ({
      insert: name === "wavo_uploads" ? insertUpload : name === "wavo_releases" ? insertRelease : insertTrack,
    }));
    mocks.storageFrom.mockReturnValue({ remove: vi.fn().mockResolvedValue({ error: null }) });
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValueOnce(uploadId).mockReturnValueOnce(releaseId) });
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL() { return "blob:test"; }
      static revokeObjectURL() {}
    });
    vi.stubGlobal("Audio", class {
      duration = 12;
      addEventListener(event: string, callback: () => void) {
        if (event === "loadedmetadata") queueMicrotask(callback);
      }
      removeAttribute() {}
    });

    const file = new File(["audio"], "song.mp3", { type: "audio/mpeg" });
    const result = await privateMusic.upload(file, "Song", "Artist");

    expect(result).toMatchObject({ id: uploadId, owner_id: userId, title: "Song", duration_ms: 12000 });
    expect(insertUpload).toHaveBeenCalledWith(expect.objectContaining({
      id: uploadId, owner_id: userId, storage_path: `${userId}/audio/${uploadId}.mp3`,
    }));
    expect(insertRelease).toHaveBeenCalledWith(expect.objectContaining({ id: releaseId, owner_id: userId }));
    expect(insertTrack).toHaveBeenCalledWith({ release_id: releaseId, upload_id: uploadId, position: 0 });
  });
});
