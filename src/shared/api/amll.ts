import type { LyricsCandidate, LyricsStreamEvent } from "../contracts";
import { parseRawLyrics } from "@/features/lyrics/engine/lyricsParser";
import type { LyricsHint } from "./lrclib";

interface AmllSong {
  id: number;
  musicNames?: string[];
  artistNames?: string[];
  albumNames?: string[];
  lyrics?: string;
}

interface AmllResponse<T> {
  status: number;
  data?: T;
}

interface AmllSearchData {
  items?: AmllSong[];
}

const API_BASE = "https://api.amll.dev/v1/lyrics";
const SEARCH_PAGE_SIZE = 50;
const MAX_SEARCH_REQUESTS = 4;
const MAX_LYRICS_FETCHES = 3;
const MIN_WORD_TIMED_LINES = 1;

const TRAILING_GROUP = /\s*(?:\([^()]*\)|\[[^\]]*\])\s*$/;
const TRAILING_DASH = /\s+[-–—]\s+[^-–—]+$/;
const EDITION_TAG = /\b(?:remaster(?:ed)?|live|acoustic|demo|radio\s+edit|single\s+(?:version|edit)|album\s+version|extended|deluxe|explicit|clean|bonus|instrumental|karaoke|sped\s*up|slowed|reverb|nightcore|unplugged|version|edit|soundtrack|motion\s+picture|from\s+|original\s+mix|feat\.?|ft\.?|featuring|with|w\/)\b/i;

function normalize(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`´]/g, "'")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function stripFeaturing(value: string): string {
  return value
    .replace(/\s*[([]\s*(?:feat\.?|ft\.?|featuring|with|w\/)\s+[^)\]]+[)\]]/gi, " ")
    .replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.+$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isEditionTag(value: string): boolean {
  return EDITION_TAG.test(value);
}

function stripEditionTags(value: string): string {
  let output = value.trim();
  for (let i = 0; i < 6; i++) {
    const before = output;
    const group = output.match(TRAILING_GROUP);
    if (group?.index != null && isEditionTag(group[0])) {
      output = output.slice(0, group.index).trim();
    }
    const dash = output.match(TRAILING_DASH);
    if (dash?.index != null && isEditionTag(dash[0])) {
      output = output.slice(0, dash.index).trim();
    }
    if (output === before) break;
  }
  return output.replace(/\s+/g, " ").trim();
}

function canonicalTitle(value: string): string {
  return normalize(stripEditionTags(stripFeaturing(value)));
}

function titleVariants(value: string): string[] {
  const raw = value.trim();
  const withoutFeaturing = stripFeaturing(raw);
  const editionless = stripEditionTags(withoutFeaturing);
  const noBrackets = withoutFeaturing.replace(/\s*(?:\([^()]*\)|\[[^\]]*\])\s*/g, " ").trim();
  const variants: string[] = [];
  const add = (variant: string) => {
    const cleaned = variant
      .replace(/\s+/g, " ")
      .replace(/[\s\-–—:|]+$/g, "")
      .trim();
    if (cleaned.length >= 2 && !variants.includes(cleaned)) variants.push(cleaned);
  };

  add(editionless);
  add(withoutFeaturing);
  add(raw);
  for (const source of [editionless, noBrackets, withoutFeaturing]) {
    const dashIndex = source.search(/\s+[-–—]\s+/);
    if (dashIndex > 1) add(source.slice(0, dashIndex));
  }
  add(noBrackets);
  return variants;
}

function splitArtistNames(value: string): string[] {
  const withoutFeaturing = value.replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.+$/i, "");
  const parts = withoutFeaturing
    .split(/\s*(?:,|;|\/|\s+x\s+|\s+vs\.?\s+|\s+&\s+|\s+and\s+)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : [value.trim()].filter(Boolean);
}

function artistVariants(value: string): string[] {
  const full = value.trim();
  if (!full) return [];
  return [...new Set([full, ...splitArtistNames(full)])];
}

function artistKey(value: string): string {
  return normalize(value).replace(/^the /, "");
}

function searchArtistName(value: string): string | undefined {
  const trimmed = value.replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.+$/i, "").trim();
  if (!trimmed) return undefined;
  const [first] = trimmed.split(/\s*[,;]\s*/);
  return first?.trim() || undefined;
}

function tokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared++;
  }
  return (2 * shared) / (leftTokens.size + rightTokens.size);
}

function titleMatchScore(song: AmllSong, hint: LyricsHint): number {
  const wanted = new Set(titleVariants(hint.title).map(canonicalTitle).filter(Boolean));
  if (wanted.size === 0) return 0;

  const actual = new Set<string>();
  for (const name of song.musicNames || []) {
    if (!name?.trim()) continue;
    actual.add(canonicalTitle(name));
    for (const variant of titleVariants(name)) actual.add(canonicalTitle(variant));
  }
  actual.delete("");
  if (actual.size === 0) return 0;

  if ([...wanted].some((title) => actual.has(title))) return 100;

  let best = 0;
  for (const left of wanted) {
    for (const right of actual) {
      if (left.length >= 6 && right.length >= 6 && (left.includes(right) || right.includes(left))) {
        best = Math.max(best, 70);
      }
      best = Math.max(best, Math.round(tokenSimilarity(left, right) * 100));
    }
  }
  return best >= 80 ? best : 0;
}

function artistMatchScore(song: AmllSong, hint: LyricsHint): number {
  const wanted = new Set(artistVariants(hint.artist).map(artistKey).filter(Boolean));
  if (wanted.size === 0) return 0;

  const actual = new Set<string>();
  for (const name of song.artistNames || []) {
    if (!name?.trim()) continue;
    actual.add(artistKey(name));
    for (const variant of artistVariants(name)) actual.add(artistKey(variant));
  }
  actual.delete("");
  if (actual.size === 0) return 0;

  if ([...wanted].some((name) => actual.has(name))) return 100;

  let best = 0;
  for (const left of wanted) {
    for (const right of actual) {
      if (left.length >= 3 && right.length >= 3 && (left.includes(right) || right.includes(left))) {
        best = Math.max(best, 70);
      }
    }
  }
  return best;
}

function songScore(song: AmllSong, hint: LyricsHint): number {
  const title = titleMatchScore(song, hint);
  const artist = artistMatchScore(song, hint);
  if (title < 80 || artist < 70) return 0;
  return title * 2 + artist;
}

function isStrongMatch(song: AmllSong, hint: LyricsHint): boolean {
  return titleMatchScore(song, hint) >= 100 && artistMatchScore(song, hint) >= 70;
}

function parseClockMs(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parts = normalized.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + part;
  return Math.round(seconds * 1000);
}

function parseTtmlDurationMs(ttml: string): number | null {
  for (const pattern of [
    /<body\b[^>]*\bdur=["']([^"']+)["']/i,
    /<tt\b[^>]*\bdur=["']([^"']+)["']/i,
  ]) {
    const value = ttml.match(pattern)?.[1];
    const duration = value ? parseClockMs(value) : null;
    if (duration) return duration;
  }
  const ends = [...ttml.matchAll(/<(?:p|div)\b[^>]*\bend=["']([^"']+)["']/gi)];
  const lastEnd = ends.at(-1)?.[1];
  return lastEnd ? parseClockMs(lastEnd) : null;
}

function durationCompatible(ttmlDurationMs: number | null, hintDurationMs?: number): boolean {
  if (!ttmlDurationMs || !hintDurationMs || hintDurationMs <= 0) return true;
  const tolerance = Math.max(20_000, hintDurationMs * 0.1);
  return Math.abs(ttmlDurationMs - hintDurationMs) <= tolerance;
}

function countWordTimedLines(ttml: string): number {
  return parseRawLyrics(ttml, "ttml").syncedLines.filter((line) => {
    const words = line.words?.filter((word) => word.text.trim().length > 0) || [];
    return words.length > 1 && words.some((word) => word.timeMs !== words[0].timeMs);
  }).length;
}

async function fetchSearch(params: URLSearchParams, signal: AbortSignal): Promise<AmllSong[]> {
  const response = await fetch(`${API_BASE}/search?${params}`, { signal });
  if (!response.ok) throw new Error(`AMLL returned ${response.status}`);
  const payload = await response.json() as AmllResponse<AmllSearchData>;
  return payload.data?.items || [];
}

async function fetchLyrics(songId: number, signal: AbortSignal): Promise<string> {
  const response = await fetch(`${API_BASE}/get?id=${encodeURIComponent(songId)}`, { signal });
  if (!response.ok) throw new Error(`AMLL returned ${response.status}`);
  const payload = await response.json() as AmllResponse<AmllSong>;
  return payload.data?.lyrics?.trim() || "";
}

function buildSearchParams(title: string, artist?: string): URLSearchParams {
  const params = new URLSearchParams({
    musicName: title,
    pageSize: String(SEARCH_PAGE_SIZE),
  });
  if (artist) params.set("artistName", artist);
  return params;
}

async function searchSongs(hint: LyricsHint, signal: AbortSignal): Promise<AmllSong[]> {
  const songs = new Map<number, AmllSong>();
  const addSongs = (items: AmllSong[]) => {
    for (const item of items) {
      if (item && typeof item.id === "number" && !songs.has(item.id)) songs.set(item.id, item);
    }
  };
  const artists = searchArtistName(hint.artist);
  let requests = 0;

  for (const title of titleVariants(hint.title).slice(0, 3)) {
    if (artists) {
      addSongs(await fetchSearch(buildSearchParams(title, artists), signal));
      requests++;
      if ([...songs.values()].some((song) => isStrongMatch(song, hint))) break;
      if (requests >= MAX_SEARCH_REQUESTS) break;
    }

    addSongs(await fetchSearch(buildSearchParams(title), signal));
    requests++;
    if ([...songs.values()].some((song) => isStrongMatch(song, hint))) break;
    if (requests >= MAX_SEARCH_REQUESTS) break;
  }

  return [...songs.values()]
    .map((song) => ({ song, score: songScore(song, hint) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.song);
}

export async function* streamAmllLyrics(
  hint?: LyricsHint,
  signal?: AbortSignal,
): AsyncGenerator<LyricsStreamEvent> {
  if (!hint?.title.trim() || !hint.artist.trim()) return;
  const timeoutSignal = AbortSignal.timeout(8000);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  const songs = await searchSongs(hint, requestSignal);
  if (songs.length === 0) {
    yield { type: "provider", provider: "amll", status: "not_found" };
    return;
  }

  let best: { song: AmllSong; ttml: string; durationMs: number | null } | null = null;
  let fallback: { song: AmllSong; ttml: string; durationMs: number | null } | null = null;

  for (const song of songs.slice(0, MAX_LYRICS_FETCHES)) {
    let ttml = "";
    try {
      ttml = await fetchLyrics(song.id, requestSignal);
    } catch {
      continue;
    }
    if (!ttml || countWordTimedLines(ttml) < MIN_WORD_TIMED_LINES) continue;

    const durationMs = parseTtmlDurationMs(ttml);
    const found = { song, ttml, durationMs };
    if (!fallback) fallback = found;
    if (durationCompatible(durationMs, hint.durationMs)) {
      best = found;
      break;
    }
  }

  best = best ?? fallback;
  if (!best) {
    yield { type: "provider", provider: "amll", status: "not_found" };
    return;
  }

  const candidate: LyricsCandidate = {
    provider: "amll",
    matchedTrack: {
      title: best.song.musicNames?.[0] || hint.title,
      artists: best.song.artistNames || [hint.artist],
      durationMs: best.durationMs || hint.durationMs,
    },
    lyrics: { format: "ttml", content: best.ttml },
    contentKind: "word_synced",
    syncHint: "word_synced",
    syncLevel: "word_level",
    quality: {
      total: 97,
      match: 30,
      content: 27,
      sync: 30,
      source: 10,
      reasons: ["AMLL title and artist match with word timestamps"],
    },
  };
  yield { type: "provider", provider: "amll", status: "found", syncLevel: "word_level", candidate };
}
