import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";

vi.mock("@/features/player", () => ({ usePlayerStore: { getState: () => ({}) }, playerRuntime: null }));
const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/shared/supabase/client", () => ({ getSupabaseClient: () => ({ auth }) }));

import { useAuthStore } from "./authStore";
import { getAuthSession, setAuthSession } from "@/shared/api";

const supabaseSession = {
  access_token: "access-1",
  refresh_token: "refresh-1",
  expires_in: 3600,
  token_type: "bearer",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: "user-1",
    email: "person@example.com",
    app_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
    user_metadata: { username: "person" },
  },
} as Session;

describe("Supabase authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthSession(null);
    useAuthStore.setState({ status: "initializing", user: null });
    auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  });

  it("restores a persisted Supabase session on launch", async () => {
    auth.getSession.mockResolvedValue({ data: { session: supabaseSession }, error: null });
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().status).toBe("authenticated");
    expect(useAuthStore.getState().user?.id).toBe("user-1");
    expect(getAuthSession()?.accessToken).toBe("access-1");
  });

  it("stays anonymous when Supabase has no session", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().status).toBe("anonymous");
  });

  it("signs in through Supabase", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session: supabaseSession }, error: null });
    await useAuthStore.getState().login("person@example.com", "password123");
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "person@example.com", password: "password123" });
    expect(useAuthStore.getState().status).toBe("authenticated");
  });

  it("waits for email confirmation when sign-up has no session", async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    const signedIn = await useAuthStore.getState().register("person@example.com", "password123", "person", "Person");
    expect(signedIn).toBe(false);
    expect(useAuthStore.getState().status).toBe("initializing");
  });
});
