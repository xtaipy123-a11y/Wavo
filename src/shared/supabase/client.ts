import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;
const AUTH_STORAGE_KEY = "wavo-supabase-auth";

export const supabaseAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    if (key !== AUTH_STORAGE_KEY) return sessionStorage.getItem(key);
    const secured = await window.wavoElectron?.authStorageRead();
    if (secured) return secured;
    const old = localStorage.getItem(key);
    if (old) {
      await supabaseAuthStorage.setItem(key, old);
      localStorage.removeItem(key);
      return old;
    }
    return sessionStorage.getItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (key === AUTH_STORAGE_KEY && await window.wavoElectron?.authStorageWrite(value)) {
      sessionStorage.removeItem(key);
    } else {
      if (key === AUTH_STORAGE_KEY) await window.wavoElectron?.authStorageRemove();
      sessionStorage.setItem(key, value);
    }
    localStorage.removeItem(key);
  },
  async removeItem(key: string): Promise<void> {
    if (key === AUTH_STORAGE_KEY) await window.wavoElectron?.authStorageRemove();
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  },
};

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!url || !key) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
  }

  client = createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storageKey: AUTH_STORAGE_KEY,
      storage: supabaseAuthStorage,
    },
  });
  return client;
}
