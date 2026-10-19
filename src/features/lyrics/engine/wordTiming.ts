import type { SyncedLine } from "./lyricsParser";

export interface TimedLyricsPosition {
  lineIndex: number;
  wordIndex: number;
}

export function isWordSpoken(positionMs: number, wordStartMs: number): boolean {
  return positionMs >= wordStartMs;
}

export function hasWordTimedLyrics(lines: SyncedLine[]): boolean {
  return lines.some((line) => {
    const timed = line.words?.filter((word) =>
    Number.isFinite(word.timeMs) && word.text.trim().length > 0,
    ) || [];
    return timed.length > 1 && timed.some((word) => word.timeMs !== timed[0].timeMs);
  });
}

export function getTimedLyricsPosition(
  lines: SyncedLine[],
  positionMs: number,
): TimedLyricsPosition {
  let lineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].timeMs > positionMs) break;
    lineIndex = i;
  }

  let wordIndex = -1;
  const words = lineIndex >= 0 ? lines[lineIndex].words : undefined;
  if (words) {
    for (let i = 0; i < words.length; i++) {
      if (isWordSpoken(positionMs, words[i].timeMs)) wordIndex = i;
    }
  }
  return { lineIndex, wordIndex };
}
