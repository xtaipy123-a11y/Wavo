/**
 * Development-only identity used when the app runs with the dev login skip.
 * It keeps locally stored data (playlists, listening rooms, …) stable and
 * separate from every real account without requiring a Supabase session.
 */
export const DEV_GUEST_ID = "dev-guest";

export function isDevGuestMode(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_DEV_SKIP_LOGIN !== "false";
}

/** Stable local user id for dev guest mode, or null outside of it. */
export function getDevGuestId(): string | null {
  return isDevGuestMode() ? DEV_GUEST_ID : null;
}

/** User id for local data: the real session id when signed in, else the dev guest. */
export function getLocalUserId(sessionUserId?: string | null): string | null {
  return sessionUserId ?? getDevGuestId();
}
