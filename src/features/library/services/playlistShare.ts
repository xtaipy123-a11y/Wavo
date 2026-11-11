import { api } from "@/shared/api";
import { toClientTrack } from "@/shared/api/track";
import type { Track } from "@/shared/contracts";
import type { Track as ClientTrack } from "@/shared/types";
import { SHARE_BASE_URL } from "@/shared/utils/share";
import { getDislikeOwnerId, useDislikeStore } from "../store/dislikeStore";

// Self-contained playlist links: the whole snapshot (order + dislike state)
// travels inside the link, gzipped and base64url encoded. No share server needed.
export interface PlaylistShareTrack extends Track {
  disliked?: boolean;
}

export interface PlaylistSharePayload {
  v: 1;
  title: string;
  description?: string;
  tracks: PlaylistShareTrack[];
}

const MAX_TRACKS = 5_000;
const MAX_TOKEN_LENGTH = 500_000;
const MAX_DECODED_BYTES = 8 * 1024 * 1024;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(token: string): Uint8Array | null {
  if (!TOKEN_PATTERN.test(token) || token.length > MAX_TOKEN_LENGTH) return null;
  const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function pipeThrough(
  bytes: Uint8Array,
  transform: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const body = new Response(copy.buffer).body;
  if (!body) throw new Error("Stream body is not available.");
  const output = await new Response(body.pipeThrough(transform)).arrayBuffer();
  return new Uint8Array(output);
}

async function decompressLimited(bytes: Uint8Array, limit: number): Promise<Uint8Array | null> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const body = new Response(copy.buffer).body;
  if (!body) return null;
  const reader = body.pipeThrough(new DecompressionStream("gzip")).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function parseShareTrack(raw: unknown): PlaylistShareTrack | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string" || !raw.id || raw.id.length > 500) return null;
  if (typeof raw.title !== "string" || !raw.title || raw.title.length > 500) return null;
  if (!Array.isArray(raw.artists) || raw.artists.length === 0 || raw.artists.length > 30) return null;

  const artists: { id: string; name: string }[] = [];
  for (const rawArtist of raw.artists) {
    if (!isRecord(rawArtist) || typeof rawArtist.id !== "string" || typeof rawArtist.name !== "string") return null;
    if (rawArtist.id.length > 500 || rawArtist.name.length > 200) return null;
    artists.push({ id: rawArtist.id, name: rawArtist.name });
  }

  const durationMs =
    typeof raw.durationMs === "number" && Number.isFinite(raw.durationMs) ? Math.max(0, raw.durationMs) : 0;
  const cover =
    isRecord(raw.cover) && typeof raw.cover.url === "string" && raw.cover.url.length <= 2000
      ? {
          url: raw.cover.url,
          width: typeof raw.cover.width === "number" ? raw.cover.width : 512,
          height: typeof raw.cover.height === "number" ? raw.cover.height : 512,
        }
      : undefined;
  const album =
    isRecord(raw.album) && typeof raw.album.id === "string" && typeof raw.album.title === "string"
      ? { id: raw.album.id, title: raw.album.title }
      : undefined;

  return {
    id: raw.id,
    title: raw.title,
    artists,
    durationMs,
    ...(cover ? { cover } : {}),
    ...(album ? { album } : {}),
    ...(typeof raw.explicit === "boolean" ? { explicit: raw.explicit } : {}),
    ...(raw.disliked === true ? { disliked: true } : {}),
  };
}

export function parsePlaylistSharePayload(value: unknown): PlaylistSharePayload | null {
  if (!isRecord(value) || value.v !== 1) return null;
  if (typeof value.title !== "string" || !value.title.trim() || value.title.length > 200) return null;
  if (!Array.isArray(value.tracks) || value.tracks.length > MAX_TRACKS) return null;

  const tracks: PlaylistShareTrack[] = [];
  for (const raw of value.tracks) {
    const track = parseShareTrack(raw);
    if (!track) return null;
    tracks.push(track);
  }
  return {
    v: 1,
    title: value.title.trim(),
    ...(typeof value.description === "string" && value.description.trim()
      ? { description: value.description.trim().slice(0, 2000) }
      : {}),
    tracks,
  };
}

export async function encodePlaylistShareToken(payload: PlaylistSharePayload): Promise<string> {
  const sanitized = parsePlaylistSharePayload(payload);
  if (!sanitized) throw new Error("Invalid playlist share payload.");
  const bytes = new TextEncoder().encode(JSON.stringify(sanitized));
  const compressed = await pipeThrough(bytes, new CompressionStream("gzip"));
  return bytesToBase64Url(compressed);
}

export async function decodePlaylistShareToken(token: string): Promise<PlaylistSharePayload | null> {
  const bytes = base64UrlToBytes(token.trim());
  if (!bytes) return null;
  try {
    const decompressed = await decompressLimited(bytes, MAX_DECODED_BYTES);
    if (!decompressed) return null;
    const text = new TextDecoder("utf-8", { fatal: true }).decode(decompressed);
    return parsePlaylistSharePayload(JSON.parse(text));
  } catch {
    return null;
  }
}

function playlistShareLinkFromToken(token: string): string {
  return SHARE_BASE_URL === "wavo://" ? `wavo://playlist?d=${token}` : `${SHARE_BASE_URL}/playlist?d=${token}`;
}

export async function buildPlaylistShareLink(payload: PlaylistSharePayload): Promise<string> {
  return playlistShareLinkFromToken(await encodePlaylistShareToken(payload));
}

function hostedShareBase(): URL | null {
  if (!/^https?:\/\//i.test(SHARE_BASE_URL)) return null;
  try {
    return new URL(SHARE_BASE_URL);
  } catch {
    return null;
  }
}

export function extractPlaylistShareToken(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const local = url.protocol === "wavo:" && url.hostname.toLowerCase() === "playlist";
  const base = hostedShareBase();
  const hosted =
    base !== null &&
    url.origin === base.origin &&
    url.pathname.replace(/\/+$/, "").endsWith("/playlist");
  if (!local && !hosted) return null;

  const tokens = url.searchParams.getAll("d");
  if (tokens.length !== 1) return null;
  const token = tokens[0]!;
  return TOKEN_PATTERN.test(token) && token.length <= MAX_TOKEN_LENGTH ? token : null;
}

export function isPlaylistShareLink(raw: string): boolean {
  const text = raw.trim();
  if (/^wavo:\/\/playlist(?:[/?#]|$)/i.test(text)) return true;
  return extractPlaylistShareToken(text) !== null;
}

export async function decodePlaylistShareLink(raw: string): Promise<PlaylistSharePayload | null> {
  const token = extractPlaylistShareToken(raw);
  return token ? decodePlaylistShareToken(token) : null;
}

export function toShareTrack(track: ClientTrack, disliked = false): PlaylistShareTrack {
  const artistList =
    Array.isArray(track.artistList) && track.artistList.length > 0
      ? track.artistList.map((artist) => ({ id: artist.id ?? "", name: artist.name }))
      : track.artists
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean)
          .map((name, index) => ({ id: index === 0 ? track.artistId ?? "" : "", name }));

  return {
    id: track.id,
    title: track.title,
    artists: artistList.length > 0 ? artistList : [{ id: "", name: track.artists || "Unknown" }],
    durationMs: track.durationMs,
    ...(track.coverUrl ? { cover: { url: track.coverUrl, width: 512, height: 512 } } : {}),
    ...(track.album ? { album: { id: track.album.id, title: track.album.title } } : {}),
    ...(track.explicit !== undefined ? { explicit: track.explicit } : {}),
    ...(disliked ? { disliked: true } : {}),
  };
}

function stripDisliked(track: PlaylistShareTrack): Track {
  return {
    id: track.id,
    title: track.title,
    artists: track.artists,
    durationMs: track.durationMs,
    ...(track.cover ? { cover: track.cover } : {}),
    ...(track.album ? { album: track.album } : {}),
    ...(track.explicit !== undefined ? { explicit: track.explicit } : {}),
  };
}

export async function importSharedPlaylist(
  payload: PlaylistSharePayload,
): Promise<{ playlistId: string; added: number }> {
  const created = await api.createPlaylist({
    title: payload.title.slice(0, 200),
    ...(payload.description ? { description: payload.description.slice(0, 2000) } : {}),
  });

  const tracks = payload.tracks.map(stripDisliked);
  const added = tracks.length > 0 ? (await api.addPlaylistTrackSnapshots(created.id, tracks)).added : 0;

  const dislikedTracks = payload.tracks.filter((track) => track.disliked);
  if (dislikedTracks.length > 0) {
    const ownerId = getDislikeOwnerId();
    const store = useDislikeStore.getState();
    for (const track of dislikedTracks) store.addDislike(ownerId, toClientTrack(track));
  }

  return { playlistId: created.id, added };
}
