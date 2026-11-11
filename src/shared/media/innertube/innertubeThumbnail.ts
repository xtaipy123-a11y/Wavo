import type { Cover } from "@/shared/contracts";
import { asArray, asRecord } from "@/shared/utils/json";

export const artworkHost = /(?:[a-zA-Z0-9_-]+\.googleusercontent\.com|yt3\.ggpht\.com)/i;

interface ThumbnailEntry {
  url: string;
  width: number;
  height: number;
}

export interface CoverContext {
  isArtist?: boolean;
  size?: number;
}

function isSquareArtwork(entry: ThumbnailEntry): boolean {
  if (entry.width > 0 && entry.height > 0) {
    return entry.width === entry.height || artworkHost.test(entry.url);
  }
  return artworkHost.test(entry.url);
}

export function toSquareArtworkUrl(url: string, size = 512): string {
  if (!artworkHost.test(url)) return url;
  const suffix = size === 0 ? "=s0" : `=w${size}-h${size}-l90-rj`;
  if (/=w\d+-h\d+/.test(url)) return url.replace(/=w\d+-h\d+(?:-[a-zA-Z0-9_-]+)*/, suffix);
  if (/=s\d+/.test(url)) return url.replace(/=s\d+(?:-[a-zA-Z0-9_-]+)*/, suffix);
  return `${url}${suffix}`;
}

const videoThumbnailHost = /^https?:\/\/[^/]*ytimg\.com\//i;

/**
 * Card-sized artwork for home rows. Profile/playlist art is resized like
 * `toSquareArtworkUrl`; video thumbnails fall back to 480×360 `hqdefault`
 * instead of 1280×720 `hq720`, which is five times smaller to decode.
 */
export function toCardArtworkUrl(url: string, size = 350): string {
  if (!url) return url;
  const square = toSquareArtworkUrl(url, size);
  if (square !== url) return square;
  if (!videoThumbnailHost.test(url)) return url;
  return url.replace(/\/(?:maxresdefault|sddefault|hq720|hqdefault)\.jpg/i, "/hqdefault.jpg");
}

function readEntries(thumbnail: unknown): ThumbnailEntry[] {
  const record = asRecord(thumbnail);
  const inner = asRecord(asRecord(record?.musicThumbnailRenderer)?.thumbnail) ?? record;
  return asArray(inner?.thumbnails)
    .map(asRecord)
    .flatMap((entry) =>
      entry && typeof entry.url === "string"
        ? [{
            url: entry.url,
            width: typeof entry.width === "number" ? entry.width : 0,
            height: typeof entry.height === "number" ? entry.height : 0,
          }]
        : [],
    );
}

function largestFirst(a: ThumbnailEntry, b: ThumbnailEntry): number {
  return Math.max(b.width, b.height) - Math.max(a.width, a.height);
}

export function coverFromThumbnail(thumbnail: unknown, context: CoverContext = {}): Cover | undefined {
  const entries = readEntries(thumbnail);
  const square = entries.filter(isSquareArtwork).sort(largestFirst)[0];
  if (square) {
    const size = context.size ?? (context.isArtist ? 0 : 512);
    const dimension = size === 0 ? Math.max(square.width, 1024) : size;
    return { url: toSquareArtworkUrl(square.url, size), width: dimension, height: dimension };
  }
  const fallback = entries.sort(largestFirst)[0];
  if (!fallback) return undefined;
  const url = context.isArtist && artworkHost.test(fallback.url) ? toSquareArtworkUrl(fallback.url, 0) : fallback.url;
  return { url, width: fallback.width, height: fallback.height };
}

export function videoThumbnailCover(videoId: string): Cover {
  return { url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, width: 480, height: 360 };
}
