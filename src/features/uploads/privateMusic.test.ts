import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/shared/supabase/client", () => ({
  getSupabaseClient: () => ({ from: mocks.from }),
}));
vi.mock("@/shared/storage/wavoDb", () => ({ wavoDb: { putAudio: vi.fn() } }));

import { getAuthSession, setAuthSession, toAuthTokens } from "@/shared/api/auth-session";
import { parseUploadTrackId, privateMusic, uploadTrackId } from "./privateMusic";

const userId = "42924c93-9914-4c5b-a102-218dc2f8233c";

describe("private music authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthSession(toAuthTokens({
      access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600,
      user: { id: userId, user_metadata: {} },
    } as Session));
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
});
