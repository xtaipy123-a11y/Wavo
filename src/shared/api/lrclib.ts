import type { LyricsCandidate, LyricsStreamEvent } from "../contracts";

export type LyricsHint = { title: string; artist: string; durationMs?: number };

type LrclibRecord = {
  trackName?: string;
  artistName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
};

function normalized(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function isMatch(record: LrclibRecord, hint: LyricsHint): boolean {
  const title = normalized(record.trackName || "");
  const artist = normalized(record.artistName || "");
  const wantedTitle = normalized(hint.title);
  const wantedArtist = normalized(hint.artist);
  if (!title || !artist || title !== wantedTitle || !artist.includes(wantedArtist)) return false;
  const duration = (hint.durationMs || 0) / 1000;
  return !duration || !record.duration || Math.abs(duration - record.duration) <= 12;
}

async function getRecord(hint: LyricsHint, signal?: AbortSignal): Promise<LrclibRecord | null> {
  const params = new URLSearchParams({ track_name: hint.title, artist_name: hint.artist });
  if (hint.durationMs && hint.durationMs > 0) {
    params.set("duration", String(Math.round(hint.durationMs / 1000)));
    const response = await fetch(`https://lrclib.net/api/get?${params}`, { signal });
    if (response.ok) {
      const record = await response.json() as LrclibRecord;
      if (isMatch(record, hint) && (record.syncedLyrics || record.plainLyrics)) return record;
    } else if (response.status !== 404) {
      throw new Error(`LRCLIB returned ${response.status}`);
    }
    params.delete("duration");
  }

  const response = await fetch(`https://lrclib.net/api/search?${params}`, { signal });
  if (!response.ok) throw new Error(`LRCLIB returned ${response.status}`);
  const records = await response.json() as LrclibRecord[];
  if (!Array.isArray(records)) return null;
  return records
    .filter((record) => isMatch(record, hint) && (record.syncedLyrics || record.plainLyrics))
    .sort((a, b) => Number(Boolean(b.syncedLyrics)) - Number(Boolean(a.syncedLyrics)))[0] || null;
}

export async function* streamLrclibLyrics(
  hint?: LyricsHint,
  signal?: AbortSignal,
): AsyncGenerator<LyricsStreamEvent> {
  if (!hint?.title.trim() || !hint.artist.trim()) {
    yield { type: "done", cached: false, status: "not_found" };
    return;
  }

  const record = await getRecord(hint, signal);
  if (!record) {
    yield { type: "provider", provider: "lrclib", status: "not_found" };
    yield { type: "done", cached: false, status: "not_found" };
    return;
  }

  const synced = Boolean(record.syncedLyrics?.trim());
  const content = (synced ? record.syncedLyrics : record.plainLyrics)?.trim() || "";
  const syncLevel = synced ? "line_level" as const : "plain" as const;
  const candidate: LyricsCandidate = {
    provider: "lrclib",
    matchedTrack: {
      title: record.trackName,
      artists: record.artistName ? [record.artistName] : [],
      durationMs: record.duration ? record.duration * 1000 : undefined,
    },
    lyrics: { format: synced ? "lrc" : "plain", content },
    contentKind: synced ? "line_synced" : "plain",
    syncHint: synced ? "line_synced" : "plain",
    syncLevel,
    quality: {
      total: synced ? 90 : 65,
      match: 30,
      content: 25,
      sync: synced ? 25 : 0,
      source: 10,
      reasons: ["LRCLIB track and artist match"],
    },
  };
  yield { type: "provider", provider: "lrclib", status: "found", syncLevel, candidate };
  yield { type: "done", cached: false, best: { provider: "lrclib", quality: candidate.quality.total, syncLevel } };
}
