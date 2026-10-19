// A hosted redirector can be configured later; local links open the Wavo app.
export const SHARE_BASE_URL =
  (import.meta.env.VITE_SHARE_BASE_URL as string | undefined)?.replace(/\/+$/, "") || "wavo://";

export type ShareEntityType = "artist" | "album" | "playlist" | "track";

export function buildShareUrl(type: ShareEntityType, id: string): string {
  return SHARE_BASE_URL === "wavo://"
    ? `wavo://${type}?id=${encodeURIComponent(id)}`
    : `${SHARE_BASE_URL}/${type}?id=${encodeURIComponent(id)}`;
}
