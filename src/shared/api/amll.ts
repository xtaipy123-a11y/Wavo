import type { LyricsCandidate, LyricsStreamEvent } from "../contracts";
import { parseRawLyrics } from "@/features/lyrics/engine/lyricsParser";
import type { LyricsHint } from "./lrclib";

interface AmllSong {
  id: number;
  musicNames?: string[];
  artistNames?: string[];
  lyrics?: string;
}

interface AmllResponse<T> {
  status: number;
  data?: T;
}

const API_BASE = "https://api.amll.dev/v1/lyrics";

function normalize(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function coreTitle(value: string): string {
  return normalize(value.replace(/\s*[([]\s*(?:feat\.?|ft\.?)\s+[^)\]]+[)\]]/gi, ""));
}

function matches(song: AmllSong, hint: LyricsHint): boolean {
  const wantedTitle = coreTitle(hint.title);
  const wantedArtist = normalize(hint.artist);
  return Boolean(wantedTitle && wantedArtist) &&
    Boolean(song.musicNames?.some((title) => coreTitle(title) === wantedTitle)) &&
    Boolean(song.artistNames?.some((artist) => {
      const name = normalize(artist);
      return name === wantedArtist || name.includes(wantedArtist) || wantedArtist.includes(name);
    }));
}

export async function* streamAmllLyrics(
  hint?: LyricsHint,
  signal?: AbortSignal,
): AsyncGenerator<LyricsStreamEvent> {
  if (!hint?.title.trim() || !hint.artist.trim()) return;
  const timeoutSignal = AbortSignal.timeout(6000);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  const params = new URLSearchParams({
    musicName: hint.title.replace(/\s*[([]\s*(?:feat\.?|ft\.?)\s+[^)\]]+[)\]]/gi, "").trim(),
    pageSize: "20",
  });
  const searchResponse = await fetch(`${API_BASE}/search?${params}`, { signal: requestSignal });
  if (!searchResponse.ok) throw new Error(`AMLL returned ${searchResponse.status}`);
  const search = await searchResponse.json() as AmllResponse<{ items?: AmllSong[] }>;
  const song = search.data?.items?.find((item) => matches(item, hint));
  if (!song) {
    yield { type: "provider", provider: "amll", status: "not_found" };
    return;
  }

  const lyricsResponse = await fetch(`${API_BASE}/get?id=${encodeURIComponent(song.id)}`, { signal: requestSignal });
  if (!lyricsResponse.ok) throw new Error(`AMLL returned ${lyricsResponse.status}`);
  const result = await lyricsResponse.json() as AmllResponse<AmllSong>;
  const ttml = result.data?.lyrics?.trim() || "";
  const parsed = parseRawLyrics(ttml, "ttml");
  const timedLines = parsed.syncedLines.filter((line) => (line.words?.length || 0) > 1);
  if (!ttml || timedLines.length < 2) {
    yield { type: "provider", provider: "amll", status: "not_found" };
    return;
  }

  const candidate: LyricsCandidate = {
    provider: "amll",
    matchedTrack: {
      title: song.musicNames?.[0],
      artists: song.artistNames || [],
      durationMs: hint.durationMs,
    },
    lyrics: { format: "ttml", content: ttml },
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
