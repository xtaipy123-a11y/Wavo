import { describe, expect, it } from "vitest";
import { parseRawLyrics } from "./lyricsParser";

// Mirrors the AMLL / Apple Music TTML shape: timed word spans plus inline
// translation, romanization and background-vocal spans that have no own timing.
const AMLL_TTML = `<?xml version="1.0" encoding="utf-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><body dur="00:10.000"><div begin="00:01.000" end="00:10.000"><p begin="00:01.000" end="00:04.000"><span begin="00:01.000" end="00:02.000">Had</span> <span begin="00:02.000" end="00:03.000">to</span> <span begin="00:03.000" end="00:04.000">have</span><span ttm:role="x-bg" begin="00:01.000" end="00:02.000"><span begin="00:01.000" end="00:02.000">(High,</span><span ttm:role="x-translation" xml:lang="zh-CN">背景翻译</span></span><span ttm:role="x-translation" xml:lang="zh-CN">我必须对生活抱有超高的期望</span><span ttm:role="x-roman" xml:lang="zh-Latn">wo bi xu dui sheng huo</span></p></div></body></tt>`;

describe("AMLL TTML parsing", () => {
  it("drops inline translation and romanization spans", () => {
    const parsed = parseRawLyrics(AMLL_TTML, "ttml");
    const line = parsed.syncedLines.find((candidate) => candidate.words?.length);
    expect(line).toBeDefined();
    if (!line) return;

    expect(line.text).not.toContain("我必须对生活抱有超高的期望");
    expect(line.text).not.toContain("背景翻译");
    expect(line.text).not.toContain("wo bi xu dui sheng huo");
    expect(line.text).toContain("(High,");

    for (const word of line.words ?? []) {
      expect(word.text).not.toContain("我必须");
      expect(word.text).not.toContain("背景翻译");
    }
  });

  it("keeps real word and background timings intact", () => {
    const parsed = parseRawLyrics(AMLL_TTML, "ttml");
    const line = parsed.syncedLines.find((candidate) => candidate.words?.length);
    const timed = (line?.words ?? [])
      .filter((word) => word.text.trim().length > 0)
      .map((word) => ({ text: word.text.trim(), timeMs: word.timeMs }));

    expect(timed).toEqual([
      { text: "Had", timeMs: 1000 },
      { text: "to", timeMs: 2000 },
      { text: "have", timeMs: 3000 },
      { text: "(High,", timeMs: 1000 },
    ]);
    // No zero-timed leftovers that would make every word look already spoken.
    expect(timed.every((word) => word.timeMs > 0)).toBe(true);
  });
});
