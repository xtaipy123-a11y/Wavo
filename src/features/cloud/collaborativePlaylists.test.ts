import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/shared/supabase/client", () => ({ getSupabaseClient: () => ({ from: mocks.from }) }));
vi.mock("@/shared/storage/wavoDb", () => ({ wavoDb: {} }));

import { setAuthSession, toAuthTokens } from "@/shared/api/auth-session";
import { collaborativePlaylists } from "./collaborativePlaylists";

describe("collaborative playlist IDs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthSession(toAuthTokens({
      access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600,
      user: { id: "42924c93-9914-4c5b-a102-218dc2f8233c", user_metadata: {} },
    } as Session));
  });

  it("accepts Supabase UUIDs when inviting a friend", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ insert });
    const playlistId = "b30d6fb6-d1da-49cd-954c-ac4328a6c87f";
    const friendId = "49c979a8-223a-4c31-babe-0d0cf32617d2";

    await collaborativePlaylists.invite(playlistId, friendId, "editor");
    expect(insert).toHaveBeenCalledWith({
      playlist_id: playlistId, user_id: friendId,
      invited_by: "42924c93-9914-4c5b-a102-218dc2f8233c", role: "editor", status: "invited",
    });
  });
});
