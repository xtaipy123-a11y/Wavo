export const DEFAULT_PRIMARY_API = "https://api.tryliner.fun";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isSecureBaseUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" || (protocol === "http:" && LOOPBACK_HOSTS.has(hostname));
  } catch {
    return false;
  }
}

export function resolveApiBaseUrl(envUrl: string | undefined): string {
  const clean = envUrl?.trim().replace(/\/+$/, "");
  return clean && isSecureBaseUrl(clean) ? clean : DEFAULT_PRIMARY_API;
}

const baseUrl = resolveApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined);

export function getApiBaseUrl(): string {
  return baseUrl;
}

// The legacy music service must never receive a Supabase refresh or access token
// unless a Wavo-owned API has explicitly been configured to validate that JWT.
export function musicApiAcceptsSupabaseJwt(): boolean {
  const hostname = new URL(baseUrl).hostname;
  return Boolean(import.meta.env.VITE_API_URL) &&
    !hostname.endsWith("tryliner.fun") &&
    import.meta.env.VITE_MUSIC_API_ACCEPTS_SUPABASE_JWT === "true";
}
