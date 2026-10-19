import { describe, expect, it } from "vitest";
import type { SyncedLine } from "./hooks/useLyricsAnimator";
import { getTimedLyricsPosition, isWordSpoken, hasWordTimedLyrics } from "./engine/wordTiming";

describe("Lyrics Animator Clock Synchronization logic", () => {
  const sampleLines: SyncedLine[] = [
    {
      timeMs: 2000,
      text: "Line at 2s",
      words: [
        { timeMs: 2000, endMs: 3000, text: "Line " },
        { timeMs: 3000, endMs: 4000, text: "at " },
        { timeMs: 4000, endMs: 5000, text: "2s" },
      ],
    },
    {
      timeMs: 6000,
      text: "Line at 6s",
      words: [
        { timeMs: 6000, endMs: 8000, text: "Line at 6s" },
      ],
    },
  ];

  it("does not extrapolate time while isPlaying is false (loading/paused state)", () => {
    let isPlaying = false;
    let positionMs = 0;
    let anchorPos = positionMs;
    let anchorTime = 1000;
    const now = 3500; // 2.5 seconds elapsed while loading!

    const estimated = isPlaying
      ? Math.max(0, anchorPos + (now - anchorTime))
      : anchorPos;

    // Must be strictly 0ms, not 2500ms
    expect(estimated).toBe(0);

    // Active line index must not advance prematurely
    let activeLine = -1;
    for (let i = 0; i < sampleLines.length; i++) {
      if (estimated >= sampleLines[i].timeMs) {
        activeLine = i;
      }
    }
    expect(activeLine).toBe(-1);
  });

  it("resets anchor when isPlaying transitions to true so clock begins at 0", () => {
    let positionMs = 0;
    let anchorPos = positionMs;
    let anchorTime = 3500; // Reset anchor to the exact moment audio begins
    let isPlaying = true;

    // 100ms later during actual playback
    const now = 3600;
    const estimated = isPlaying
      ? Math.max(0, anchorPos + (now - anchorTime))
      : anchorPos;

    expect(estimated).toBe(100);
  });

  it("activates each word exactly at its own timestamp", () => {
    expect(hasWordTimedLyrics(sampleLines)).toBe(true);
    expect(getTimedLyricsPosition(sampleLines, 1999)).toEqual({ lineIndex: -1, wordIndex: -1 });
    expect(getTimedLyricsPosition(sampleLines, 2000)).toEqual({ lineIndex: 0, wordIndex: 0 });
    expect(getTimedLyricsPosition(sampleLines, 2999)).toEqual({ lineIndex: 0, wordIndex: 0 });
    expect(getTimedLyricsPosition(sampleLines, 3000)).toEqual({ lineIndex: 0, wordIndex: 1 });
    expect(getTimedLyricsPosition(sampleLines, 4000)).toEqual({ lineIndex: 0, wordIndex: 2 });
    expect(getTimedLyricsPosition(sampleLines, 6000)).toEqual({ lineIndex: 1, wordIndex: 0 });
  });

  it("does not highlight a word before its start, even if it has zero duration", () => {
    expect(isWordSpoken(2499, 2500)).toBe(false);
    expect(isWordSpoken(2500, 2500)).toBe(true);
    expect(isWordSpoken(3000, 2500)).toBe(true);
    expect(hasWordTimedLyrics([{ timeMs: 1000, text: "Only a line" }])).toBe(false);
  });
});
