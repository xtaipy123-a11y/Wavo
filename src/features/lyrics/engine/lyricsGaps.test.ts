import { describe, expect, it } from "vitest";
import type { Lyric } from "@braccato/parsers";
import {
  buildTimedDisplayLines,
  getLyricsGaps,
  injectLyricsDots,
} from "./lyricsGaps";
import type { SyncedLine } from "./lyricsParser";

const line = (
  timeMs: number,
  text: string,
  durationMs = 0,
): SyncedLine => ({ timeMs, text, durationMs });

describe("getLyricsGaps", () => {
  it("reports an intro when the first line starts late", () => {
    const gaps = getLyricsGaps([line(8000, "First")], 180_000);
    expect(gaps.intro).toEqual({ startMs: 0, endMs: 8000 });
  });

  it("does not report an intro for an early first line", () => {
    const gaps = getLyricsGaps([line(2000, "First")], 180_000);
    expect(gaps.intro).toBeNull();
  });

  it("reports an outro after the last word when the song keeps playing", () => {
    const gaps = getLyricsGaps(
      [
        line(10_000, "First"),
        {
          timeMs: 170_000,
          text: "Last",
          durationMs: 5000,
          words: [{ timeMs: 170_000, endMs: 174_000, text: "Last" }],
        },
      ],
      180_000,
    );
    expect(gaps.outro).toEqual({ startMs: 174_000, endMs: 180_000 });
  });

  it("does not report an outro when the last line has no text", () => {
    const gaps = getLyricsGaps([line(10_000, "First"), line(170_000, "")], 180_000);
    expect(gaps.outro).toBeNull();
  });
});

describe("injectLyricsDots", () => {
  const synced: SyncedLine[] = [
    line(8000, "First"),
    line(30_000, "", 6000),
    {
      timeMs: 170_000,
      text: "Last",
      words: [{ timeMs: 170_000, endMs: 174_000, text: "Last" }],
    },
  ];

  const lyrics: Lyric[] = [
    { startTimeMs: 8000, durationMs: 4000, words: "First" },
    { startTimeMs: 30_000, durationMs: 6000, words: "" },
    { startTimeMs: 170_000, durationMs: 4000, words: "Last" },
  ];

  it("replaces blank lines and adds intro/outro dot lines", () => {
    const result = injectLyricsDots(lyrics, synced, 180_000);

    expect(result.map((entry) => entry.words)).toEqual([
      "•••",
      "First",
      "•••",
      "Last",
      "•••",
    ]);
    expect(result[0].startTimeMs).toBe(0);
    expect(result[2].startTimeMs).toBe(30_000);
    expect(result[4].startTimeMs).toBe(174_000);
  });

  it("uses one part per dot line so the fill runs across all dots", () => {
    const result = injectLyricsDots(lyrics, synced, 180_000);

    for (const dotLine of [result[0], result[2], result[4]]) {
      expect(dotLine.parts).toHaveLength(1);
      expect(dotLine.parts?.[0].words).toBe("•••");
      expect(dotLine.parts?.[0].startTimeMs).toBe(dotLine.startTimeMs);
      expect(dotLine.parts?.[0].durationMs).toBe(dotLine.durationMs);
    }

    expect(result[2].parts?.[0].durationMs).toBe(6000);
  });
});

describe("buildTimedDisplayLines", () => {
  it("injects dot lines for gaps and blank interludes", () => {
    const synced: SyncedLine[] = [
      line(8000, "First"),
      line(30_000, "", 6000),
      line(170_000, "Last", 4000),
    ];

    const { lines, originalIndexOffset } = buildTimedDisplayLines(
      synced,
      180_000,
    );

    expect(originalIndexOffset).toBe(1);
    expect(lines.map((entry) => entry.text)).toEqual([
      "•••",
      "First",
      "•••",
      "Last",
    ]);
    expect(lines[0].isInterludeDots).toBe(true);
    expect(lines[0].timeMs).toBe(0);
    expect(lines[0].durationMs).toBe(8000);
    expect(lines[0].words).toBeUndefined();
    expect(lines[2].isInterludeDots).toBe(true);
    expect(lines[2].durationMs).toBe(6000);
  });

  it("does not offset when there is no intro gap", () => {
    const synced: SyncedLine[] = [line(2000, "First"), line(170_000, "Last")];

    const { lines, originalIndexOffset } = buildTimedDisplayLines(
      synced,
      180_000,
    );

    expect(originalIndexOffset).toBe(0);
    expect(lines[0]).toBe(synced[0]);
    expect(lines[1]).toBe(synced[1]);
  });
});
