import type { Lyric } from "@braccato/parsers";
import type { SyncedLine } from "./lyricsParser";

/** Minimum gap before an intro/outro is worth showing as a lyric interlude. */
export const LYRICS_GAP_MIN_MS = 5000;

export interface LyricsGap {
  startMs: number;
  endMs: number;
}

export interface LyricsGaps {
  intro: LyricsGap | null;
  outro: LyricsGap | null;
}

/**
 * Finds the silent stretches the sidebar renders as "•••" lines: before the
 * first lyric and after the last one. Mid-song interludes are represented by
 * empty lines in the parsed lyrics and need no gap detection.
 */
export function getLyricsGaps(
  lines: SyncedLine[],
  durationMs: number,
): LyricsGaps {
  if (lines.length === 0) return { intro: null, outro: null };

  const first = lines[0];
  const intro =
    first.timeMs > LYRICS_GAP_MIN_MS && first.text.trim()
      ? { startMs: 0, endMs: first.timeMs }
      : null;

  const last = lines[lines.length - 1];
  const lastWordEndMs =
    last.words?.reduce((end, word) => Math.max(end, word.endMs), 0) ?? 0;
  const previous = lines.length > 1 ? lines[lines.length - 2] : null;
  const previousDuration = previous
    ? Math.max(0, last.timeMs - previous.timeMs)
    : LYRICS_GAP_MIN_MS;
  const outroStartMs =
    lastWordEndMs > 0 ? lastWordEndMs : last.timeMs + previousDuration;
  const outro =
    durationMs > 0 &&
    last.timeMs > 0 &&
    durationMs - last.timeMs > LYRICS_GAP_MIN_MS &&
    last.text.trim() &&
    outroStartMs < durationMs
      ? { startMs: outroStartMs, endMs: durationMs }
      : null;

  return { intro, outro };
}

export function isBlankLyricLine(line: SyncedLine): boolean {
  return !line.text.trim();
}

function endOfLine(
  lines: SyncedLine[],
  index: number,
  durationMs: number,
): number {
  const line = lines[index];
  if (line.durationMs && line.durationMs > 0) {
    return line.timeMs + line.durationMs;
  }
  const nextStartMs = lines[index + 1]?.timeMs;
  if (nextStartMs !== undefined && nextStartMs > line.timeMs) {
    return nextStartMs;
  }
  if (durationMs > line.timeMs) {
    return durationMs;
  }
  return line.timeMs + LYRICS_GAP_MIN_MS;
}

/** A parsed line that the fullscreen view renders as filling interlude dots. */
export interface DisplayLyricLine extends SyncedLine {
  isInterludeDots?: boolean;
}

function makeDotLine(startMs: number, endMs: number): DisplayLyricLine {
  return {
    timeMs: startMs,
    durationMs: Math.max(0, endMs - startMs),
    text: "•••",
    isInterludeDots: true,
  };
}

function makeDotLyric(startMs: number, endMs: number): Lyric {
  return {
    startTimeMs: startMs,
    durationMs: Math.max(0, endMs - startMs),
    words: "•••",
    // One part spanning the whole gap makes Braccato's karaoke swipe run
    // across all three dots in a single left-to-right fill instead of
    // lighting them up one by one.
    parts: [
      {
        startTimeMs: startMs,
        durationMs: Math.max(0, endMs - startMs),
        words: "•••",
      },
    ],
  };
}

export interface TimedDisplayLyrics {
  lines: DisplayLyricLine[];
  /** Number of synthetic lines prepended, so indices can map back. */
  originalIndexOffset: number;
}

/**
 * Adds the intro/outro dots lines and replaces empty interlude lines with dot
 * lines that carry word timings, so the timed lyrics view fills them exactly
 * like it fills sung words.
 */
export function buildTimedDisplayLines(
  lines: SyncedLine[],
  durationMs: number,
): TimedDisplayLyrics {
  if (lines.length === 0) {
    return { lines, originalIndexOffset: 0 };
  }

  const gaps = getLyricsGaps(lines, durationMs);
  const displayLines: DisplayLyricLine[] = [];

  if (gaps.intro) {
    displayLines.push(makeDotLine(gaps.intro.startMs, gaps.intro.endMs));
  }

  lines.forEach((line, index) => {
    if (isBlankLyricLine(line)) {
      displayLines.push(
        makeDotLine(line.timeMs, endOfLine(lines, index, durationMs)),
      );
    } else {
      displayLines.push(line);
    }
  });

  if (gaps.outro) {
    displayLines.push(makeDotLine(gaps.outro.startMs, gaps.outro.endMs));
  }

  return {
    lines: displayLines,
    originalIndexOffset: gaps.intro ? 1 : 0,
  };
}

/**
 * Braccato skips empty lyric lines, so instrumental breaks vanish in the
 * fullscreen view. Give those lines (and the intro/outro gaps) timed dot parts
 * so the renderer fills them over the length of the break.
 */
export function injectLyricsDots(
  lyrics: Lyric[],
  syncedLines: SyncedLine[],
  durationMs: number,
): Lyric[] {
  if (lyrics.length === 0) return lyrics;

  const gaps = getLyricsGaps(syncedLines, durationMs);
  const result: Lyric[] = [];

  if (gaps.intro) {
    result.push(makeDotLyric(gaps.intro.startMs, gaps.intro.endMs));
  }

  lyrics.forEach((line, index) => {
    if (line.words.trim()) {
      result.push(line);
      return;
    }
    const synced = syncedLines[index];
    const startMs = synced?.timeMs ?? line.startTimeMs;
    const endMs = synced
      ? endOfLine(syncedLines, index, durationMs)
      : startMs + (line.durationMs || LYRICS_GAP_MIN_MS);
    result.push(makeDotLyric(startMs, endMs));
  });

  if (gaps.outro) {
    result.push(makeDotLyric(gaps.outro.startMs, gaps.outro.endMs));
  }

  return result;
}
