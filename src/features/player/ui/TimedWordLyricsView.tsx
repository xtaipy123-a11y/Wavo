import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { SyncedLine, WordData } from "@/features/lyrics/engine/lyricsParser";
import { getTimedLyricsPosition } from "@/features/lyrics/engine/wordTiming";
import { buildTimedDisplayLines } from "@/features/lyrics/engine/lyricsGaps";
import { useLyricsStore } from "@/features/lyrics";
import { playerEngine } from "../engine/playerEngine";
import { resolveLyricsPlaybackClock } from "./lyricsPlaybackClock";

interface TimedWordLyricsViewProps {
  lines: SyncedLine[];
  durationMs?: number;
}

const WORD_SPOKEN_COLOR = "#fff";
const WORD_PENDING_COLOR = "rgba(255,255,255,0.38)";

function currentAudioPositionMs(): number {
  return resolveLyricsPlaybackClock().positionMs;
}

export const TimedWordLyricsView = memo(function TimedWordLyricsView({ lines, durationMs = 0 }: TimedWordLyricsViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const wordRefs = useRef<(HTMLSpanElement | null)[][]>([]);
  const dotFillRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const userScrollUntilRef = useRef(0);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeLineIndex, setActiveLineIndex] = useState(-1);

  // Intro/outro gaps and blank interlude lines become timed dot lines, so the
  // same word-fill loop below animates them.
  const { lines: displayLines, originalIndexOffset } = useMemo(
    () => buildTimedDisplayLines(lines, durationMs),
    [lines, durationMs],
  );

  useEffect(() => {
    let rafId: number;
    let lastLineIndex = -1;

    const clearLineColors = (lineIndex: number) => {
      const spans = wordRefs.current[lineIndex];
      if (!spans) return;
      for (const span of spans) {
        if (span) span.style.color = "";
      }
    };

    const tick = () => {
      const positionMs = currentAudioPositionMs();
      const { lineIndex } = getTimedLyricsPosition(displayLines, positionMs);

      if (lineIndex !== lastLineIndex) {
        clearLineColors(lastLineIndex);
        lastLineIndex = lineIndex;
        setActiveLineIndex(lineIndex);

        // Synthetic intro/outro lines must not leak into the store, which is
        // consumed by the touchbar and the word timing editor.
        const originalIndex = lineIndex - originalIndexOffset;
        const validOriginal =
          originalIndex >= 0 && originalIndex < lines.length;
        useLyricsStore
          .getState()
          .setActiveLineIndex(validOriginal ? originalIndex : null);

        if (Date.now() >= userScrollUntilRef.current && lineIndex >= 0) {
          const container = scrollRef.current;
          const line = lineRefs.current[lineIndex];
          if (container && line) {
            container.scrollTo({
              top: Math.max(0, line.offsetTop - container.clientHeight / 2 + line.clientHeight / 2),
              behavior: "smooth",
            });
          }
        }
      }

      const words = lineIndex >= 0 ? displayLines[lineIndex].words : undefined;
      const spans = lineIndex >= 0 ? wordRefs.current[lineIndex] : undefined;
      if (words && spans) {
        // Color each word from its own timestamp. Background parts are not
        // ordered by time, so a single "current word" index cannot drive this.
        for (let i = 0; i < words.length; i++) {
          const span = spans[i];
          if (!span) continue;
          const color = positionMs >= words[i].timeMs ? WORD_SPOKEN_COLOR : WORD_PENDING_COLOR;
          if (span.style.color !== color) span.style.color = color;
        }
      }

      // Interlude dots fill as one continuous left-to-right sweep instead of
      // switching dot by dot, so the edge tracks the remaining gap.
      for (let i = 0; i < displayLines.length; i++) {
        const displayLine = displayLines[i];
        if (!displayLine.isInterludeDots) continue;
        const fill = dotFillRefs.current[i];
        if (!fill) continue;
        const lineDuration = displayLine.durationMs ?? 0;
        const progress =
          lineDuration > 0
            ? Math.min(1, Math.max(0, (positionMs - displayLine.timeMs) / lineDuration))
            : positionMs >= displayLine.timeMs
              ? 1
              : 0;
        fill.style.clipPath = `inset(0 ${(1 - progress) * 100}% 0 0)`;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      useLyricsStore.getState().setActiveLineIndex(null);
    };
  }, [displayLines, originalIndexOffset, lines.length]);

  const noteUserScroll = () => {
    userScrollUntilRef.current = Date.now() + 6000;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      userScrollUntilRef.current = 0;
      const container = scrollRef.current;
      const line = lineRefs.current[getTimedLyricsPosition(displayLines, currentAudioPositionMs()).lineIndex];
      if (container && line) {
        container.scrollTo({
          top: Math.max(0, line.offsetTop - container.clientHeight / 2 + line.clientHeight / 2),
          behavior: "smooth",
        });
      }
    }, 6000);
  };

  const renderWord = (word: WordData, index: number, lineIndex: number) => (
    <span
      key={index}
      ref={(node) => {
        const spans = wordRefs.current[lineIndex] ?? [];
        spans[index] = node;
        wordRefs.current[lineIndex] = spans;
      }}
      onClick={(event) => {
        event.stopPropagation();
        playerEngine.seek(word.timeMs, true);
      }}
    >
      {word.text}
    </span>
  );

  return (
    <div
      ref={scrollRef}
      className="relative h-full w-full overflow-y-auto overflow-x-hidden px-6"
      style={{ scrollbarWidth: "none" }}
      onWheel={noteUserScroll}
      onTouchMove={noteUserScroll}
    >
      <div className="flex min-h-full flex-col justify-center gap-8 py-[45vh]" style={{ fontFamily: '"Satoshi", var(--font-inter), system-ui, sans-serif' }}>
        {displayLines.map((line, lineIndex) => {
          const active = lineIndex === activeLineIndex;
          const words = line.words;
          const hasBackground = Boolean(words?.some((word) => word.isBackground));
          return (
            <div
              key={`${line.timeMs}-${lineIndex}`}
              ref={(node) => { lineRefs.current[lineIndex] = node; }}
              className="cursor-pointer whitespace-pre-wrap text-[clamp(1.5rem,2.35vw,3rem)] font-semibold leading-[1.4] transition-opacity duration-200"
              style={{ opacity: active ? 1 : 0.38 }}
              onClick={() => playerEngine.seek(line.timeMs, true)}
            >
              {line.isInterludeDots ? (
                <span className="relative inline-block">
                  <span style={{ color: WORD_PENDING_COLOR }}>•••</span>
                  <span
                    ref={(node) => { dotFillRefs.current[lineIndex] = node; }}
                    aria-hidden
                    className="pointer-events-none absolute inset-0 whitespace-pre"
                    style={{
                      color: WORD_SPOKEN_COLOR,
                      clipPath: "inset(0 100% 0 0)",
                    }}
                  >
                    •••
                  </span>
                </span>
              ) : words?.length ? (
                hasBackground ? (
                  <>
                    {words.map((word, index) =>
                      word.isBackground ? null : renderWord(word, index, lineIndex),
                    )}
                    <div className="mt-1 block text-[0.6em] font-medium leading-[1.25]">
                      {words.map((word, index) =>
                        word.isBackground ? renderWord(word, index, lineIndex) : null,
                      )}
                    </div>
                  </>
                ) : (
                  words.map((word, index) => renderWord(word, index, lineIndex))
                )
              ) : (
                line.text
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
