import { describe, expect, it } from "vitest";
import { buildManualRichsync, tokenizeLyricLine } from "./engine/manualWordTiming";
import { parseRawLyrics } from "./engine/lyricsParser";

describe("manual word timing", () => {
  it("preserves spacing and stamps only complete lines", () => {
    const lines = [
      { timeMs: 1000, durationMs: 2000, text: "Hello  world" },
      { timeMs: 4000, durationMs: 2000, text: "Another line" },
    ];
    expect(tokenizeLyricLine(lines[0].text)).toEqual(["Hello  ", "world"]);
    const result = buildManualRichsync(lines, [[1100, 1800], [null, null]]);
    expect(result.completedLines).toBe(1);
    const parsed = parseRawLyrics(result.content, "richsync");
    expect(parsed.syncedLines[0].words?.map((word) => word.timeMs)).toEqual([1100, 1800]);
    expect(parsed.syncedLines[0].text).toBe("Hello  world");
    expect(parsed.syncedLines[1].text).toBe("Another line");
  });

  it("rejects timestamps that move backward", () => {
    const result = buildManualRichsync(
      [{ timeMs: 1000, text: "one two" }],
      [[1800, 1200]],
    );
    expect(result.completedLines).toBe(0);
  });
});
