import type { SyncedLine } from "./lyricsParser";

export function tokenizeLyricLine(text: string): string[] {
  return text.match(/\S+\s*/gu) || [];
}

export function isCompleteManualWordLine(tokens: string[], stamps: (number | null)[]): boolean {
  return tokens.length > 1 && stamps.length === tokens.length &&
    stamps.every((time): time is number => Number.isFinite(time)) &&
    stamps.every((time, index) => index === 0 || (time ?? 0) >= (stamps[index - 1] ?? 0));
}

export function buildManualRichsync(
  lines: SyncedLine[],
  stamps: (number | null)[][],
): { content: string; completedLines: number } {
  let completedLines = 0;
  const content = JSON.stringify(lines.map((line, lineIndex) => {
    const tokens = tokenizeLyricLine(line.text);
    const timed = stamps[lineIndex] || [];
    const complete = isCompleteManualWordLine(tokens, timed);
    if (complete) completedLines++;
    const nextStart = lines[lineIndex + 1]?.timeMs;
    const lineEnd = Math.max(
      line.timeMs + 1000,
      line.timeMs + (line.durationMs || 0),
      nextStart || 0,
      complete ? (timed[timed.length - 1] as number) + 500 : 0,
    );
    return {
      ts: line.timeMs / 1000,
      te: lineEnd / 1000,
      l: complete
        ? tokens.map((text, index) => ({ c: text, o: (timed[index] as number) / 1000 }))
        : [{ c: line.text, o: line.timeMs / 1000 }],
    };
  }));
  return { content, completedLines };
}
