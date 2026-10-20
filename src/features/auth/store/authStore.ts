import { AuthError } from "@supabase/supabase-js";
import { create } from "zustand";
import { ApiError, getAuthSession, setAuthSession, clearAuthSession, toAuthTokens, type AuthUser, type PublicUser, type UpdateProfileInput } from "@/shared/api";
import { getSupabaseClient } from "@/shared/supabase/client";
import { usePlayerStore, playerRuntime } from "@/features/player";

export type AuthStatus = "initializing" | "authenticated" | "anonymous";
export type AuthState = {
  status: AuthStatus;
  user: AuthUser | null;
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username: string, displayName: string) => Promise<boolean>;
  updateProfile: (patch: UpdateProfileInput) => Promise<PublicUser>;
  logout: () => Promise<void>;
};

let listening = false;
let signingOut = false;

function syncSession(value: Parameters<typeof toAuthTokens>[0] | null) {
  if (!value && !signingOut && typeof navigator !== "undefined" && navigator.onLine === false) {
    const cached = getAuthSession();
    if (cached) {
      useAuthStore.setState({ status: "authenticated", user: cached.user });
      return;
    }
  }
  const next = value ? toAuthTokens(value) : null;
  setAuthSession(next);
  useAuthStore.setState({
    status: next ? "authenticated" : "anonymous",
    user: next?.user ?? null,
  });
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "initializing",
  user: null,
  initialize: async () => {
    try {
      const supabase = getSupabaseClient();
      if (!listening) {
        supabase.auth.onAuthStateChange((_event, next) => syncSession(next));
        listening = true;
      }
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      syncSession(data.session);
    } catch {
      const cached = getAuthSession();
      const expiry = cached?.expiresAt ? cached.expiresAt * 1000 : 0;
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      const canUseLocalSession = Boolean(cached && (expiry > Date.now() || offline));
      set({
        status: canUseLocalSession ? "authenticated" : "anonymous",
        user: canUseLocalSession ? cached?.user ?? null : null,
      });
    }
  },
  login: async (email, password) => {
    const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.session) throw new Error("No session was returned by Supabase.");
    syncSession(data.session);
    window.dispatchEvent(new Event("library:changed"));
  },
  register: async (email, password, username, displayName) => {
    const { data, error } = await getSupabaseClient().auth.signUp({
      email,
      password,
      options: { data: { username, display_name: displayName } },
    });
    if (error) throw error;
    if (!data.session) return false;
    syncSession(data.session);
    window.dispatchEvent(new Event("library:changed"));
    return true;
  },
  updateProfile: async (patch) => {
    const { data, error } = await getSupabaseClient().auth.updateUser({
      data: {
        ...patch,
        ...(patch.displayName !== undefined ? { display_name: patch.displayName } : {}),
        ...(patch.avatarUrl !== undefined ? { avatar_url: patch.avatarUrl } : {}),
      },
    });
    if (error) throw error;
    const current = getAuthSession();
    const updated: PublicUser = {
      ...(current?.user ?? { id: data.user.id }),
      ...patch,
    };
    if (current) setAuthSession({ ...current, user: updated });
    set({ user: updated });
    return updated;
  },
  logout: async () => {
    try {
      usePlayerStore.getState().dispatch({ type: "PAUSE_REQUESTED" });
      playerRuntime?.pause();
      usePlayerStore.getState().setFullscreen(false);
      window.wavoElectron?.closeOverlay?.();
      window.wavoElectron?.sendOverlayAction?.({ type: "closeOverlay" });
    } catch {}
    if (window.location.hash.includes("/player")) window.location.hash = "#/";
    signingOut = true;
    try {
      await clearAuthSession();
    } finally {
      set({ status: "anonymous", user: null });
      signingOut = false;
    }
    window.dispatchEvent(new Event("library:changed"));
  },
}));

export function getAuthErrorCode(error: unknown): string {
  if (error instanceof AuthError) {
    if (error.status && error.status >= 500) return "server_error";
    if (error.code === "invalid_credentials" || error.code === "email_not_confirmed") return "invalid_credentials";
    if (error.code === "email_exists" || error.code === "user_already_exists") return "email_already_used";
    if (error.code === "validation_failed") return "invalid_input";
    return "unknown_error";
  }
  if (!(error instanceof ApiError)) return "server_unavailable";
  if (error.status === 0) return "server_unavailable";
  if (error.status >= 500) return "server_error";
  if (error.code === "INVALID_CREDENTIALS") return "invalid_credentials";
  if (error.code === "EMAIL_ALREADY_USED") return "email_already_used";
  if (error.code === "USERNAME_TAKEN") return "username_taken";
  if (error.code === "INVALID_USERNAME") return "invalid_username";
  if (error.code === "INVALID_INPUT") return "invalid_input";
  return "unknown_error";
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof AuthError) return error.message;
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : "Unable to reach the server.";
  if (error.code === "INVALID_CREDENTIALS") return "Email or password is incorrect.";
  if (error.code === "EMAIL_ALREADY_USED") return "This email is already in use.";
  if (error.code === "USERNAME_TAKEN") return "This username is already taken. Please choose another.";
  if (error.code === "INVALID_USERNAME") return "Username must be 3-30 lowercase characters (a-z, 0-9, _).";
  return "Something went wrong. Please try again.";
}
