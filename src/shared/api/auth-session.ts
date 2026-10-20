import type { Session } from "@supabase/supabase-js";
import type { AuthTokens, AuthUser } from "../contracts";
import { getSupabaseClient } from "../supabase/client";

export type { AuthTokens, AuthUser };

const PUBLIC_USER_KEY = "wavo_cached_user";
const OLD_STORAGE_KEY = "wavo_auth_session";
let session: AuthTokens | null = null;
let refreshPromise: Promise<AuthTokens | null> | null = null;

function load(): AuthTokens | null {
  if (typeof window === "undefined") return null;
  try {
    localStorage.removeItem("wavo_access_token");
    localStorage.removeItem("wavo_refresh_token");
    const old = localStorage.getItem(OLD_STORAGE_KEY);
    if (old) {
      try {
        const legacy = JSON.parse(old) as AuthTokens;
        if (legacy.user?.id) localStorage.setItem(PUBLIC_USER_KEY, JSON.stringify(legacy.user));
      } finally { localStorage.removeItem(OLD_STORAGE_KEY); }
    }
    const value = localStorage.getItem(PUBLIC_USER_KEY);
    if (!value) return null;
    const user = JSON.parse(value) as AuthUser;
    if (!user?.id) return null;
    // Public identity permits offline local data access; no auth token is persisted here.
    return { accessToken: "", refreshToken: "", accessTokenExpiresAt: "", expiresAt: 0, user };
  } catch {
    return null;
  }
}

export function toAuthTokens(value: Session): AuthTokens {
  const metadata = value.user.user_metadata ?? {};
  const expiresAt = value.expires_at ?? Math.floor(Date.now() / 1000) + value.expires_in;
  return {
    accessToken: value.access_token,
    refreshToken: value.refresh_token,
    accessTokenExpiresAt: new Date(expiresAt * 1000).toISOString(),
    expiresAt,
    user: {
      id: value.user.id,
      email: value.user.email,
      username: typeof metadata.username === "string" ? metadata.username : null,
      displayName: typeof metadata.display_name === "string" ? metadata.display_name : null,
      avatarUrl: typeof metadata.avatar_url === "string" ? metadata.avatar_url : null,
      bio: typeof metadata.bio === "string" ? metadata.bio : null,
    },
  };
}

export function getAuthSession(): AuthTokens | null {
  if (!session) session = load();
  return session;
}

/** Mirrors the SDK session for existing player modules. Supabase owns its refresh token. */
export function setAuthSession(next: AuthTokens | null): void {
  const previous = getAuthSession();
  session = next;
  if (typeof window !== "undefined") {
    localStorage.removeItem(OLD_STORAGE_KEY);
    localStorage.removeItem("wavo_access_token");
    localStorage.removeItem("wavo_refresh_token");
    if (next) localStorage.setItem(PUBLIC_USER_KEY, JSON.stringify(next.user));
    else localStorage.removeItem(PUBLIC_USER_KEY);
    if (previous?.accessToken !== next?.accessToken || previous?.user?.id !== next?.user?.id) {
      window.dispatchEvent(new Event("auth:changed"));
    }
  }
}

export function getAccessToken(): string | null {
  return getAuthSession()?.accessToken ?? null;
}

export function getSessionExpiryMs(value: AuthTokens | null): number | null {
  if (!value) return null;
  const expiry = value.expiresAt ?? Date.parse(value.accessTokenExpiresAt);
  if (!Number.isFinite(expiry)) return null;
  return expiry < 10_000_000_000 ? expiry * 1000 : expiry;
}

export async function getValidAccessToken(): Promise<string | null> {
  try {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error) throw error;
    const next = data.session ? toAuthTokens(data.session) : null;
    setAuthSession(next);
    return next?.accessToken ?? null;
  } catch {
    const cached = getAuthSession();
    const expiresAt = getSessionExpiryMs(cached);
    return expiresAt && expiresAt > Date.now() ? cached?.accessToken ?? null : null;
  }
}

export function refreshAuthSession(): Promise<AuthTokens | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const { data, error } = await getSupabaseClient().auth.refreshSession();
      if (error) throw error;
      const next = data.session ? toAuthTokens(data.session) : null;
      setAuthSession(next);
      return next;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function clearAuthSession(): Promise<void> {
  try {
    await getSupabaseClient().auth.signOut();
  } finally {
    setAuthSession(null);
  }
}
