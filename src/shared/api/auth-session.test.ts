import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("../supabase/client", () => ({ getSupabaseClient: () => ({ auth }) }));

import {
  clearAuthSession,
  getAuthSession,
  getValidAccessToken,
  refreshAuthSession,
  setAuthSession,
  toAuthTokens,
} from "./auth-session";

const supabaseSession = {
  access_token: "supabase-access",
  refresh_token: "supabase-refresh",
  expires_in: 3600,
  token_type: "bearer",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: "user-1",
    email: "person@example.com",
    app_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
    user_metadata: { username: "person", display_name: "Person" },
  },
} as Session;

describe("Supabase session bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthSession(null);
    localStorage.clear();
  });

  it("maps Supabase identity and expiry to the player session contract", () => {
    const mapped = toAuthTokens(supabaseSession);
    expect(mapped.accessToken).toBe("supabase-access");
    expect(mapped.user).toMatchObject({ id: "user-1", username: "person", displayName: "Person" });
    expect(mapped.expiresAt).toBe(supabaseSession.expires_at);
  });

  it("uses Supabase's session manager to obtain a valid token", async () => {
    auth.getSession.mockResolvedValue({ data: { session: supabaseSession }, error: null });
    expect(await getValidAccessToken()).toBe("supabase-access");
    expect(getAuthSession()?.user.id).toBe("user-1");
    expect(auth.getSession).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent explicit refreshes", async () => {
    let resolveRefresh!: (value: unknown) => void;
    auth.refreshSession.mockImplementation(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    const first = refreshAuthSession();
    const second = refreshAuthSession();
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    resolveRefresh({ data: { session: supabaseSession }, error: null });
    expect(await first).toEqual(await second);
  });

  it("clears the local bridge on sign out", async () => {
    auth.signOut.mockResolvedValue({ error: null });
    setAuthSession(toAuthTokens(supabaseSession));
    await clearAuthSession();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(getAuthSession()).toBeNull();
  });
});
