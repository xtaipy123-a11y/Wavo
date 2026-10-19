import { memo, useEffect, useRef, useState } from "react";
import type { SyncedLine, WordData } from "@/features/lyrics/engine/lyricsParser";
import { getTimedLyricsPosition, type TimedLyricsPosition } from "@/features/lyrics/engine/wordTiming";
import { useLyricsStore } from "@/features/lyrics";
import { playerEngine } from "../engine/playerEngine";

interface TimedWordLyricsViewProps {
  lines: SyncedLine[];
}

function currentAudioPositionMs(): number {
  const snapshot = playerEngine.getSnapshot();
  const audio = document.getElementById("wavo-audio") as HTMLAudioElement | null;
  if ((snapshot.status === "playing" || snapshot.status === "paused") && audio?.readyState) {
    return audio.currentTime * 1000;
  }
  return snapshot.positionMs;
}

export const TimedWordLyricsView = memo(function TimedWordLyricsView({ lines }: TimedWordLyricsViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const userScrollUntilRef = useRef(0);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState<TimedLyricsPosition>(() =>
    getTimedLyricsPosition(lines, currentAudioPositionMs()),
  );

  useEffect(() => {
    let rafId: number;
    let lastLineIndex = -1;
    const tick = () => {
      const next = getTimedLyricsPosition(lines, currentAudioPositionMs());
      setPosition((current) =>
        current.lineIndex === next.lineIndex && current.wordIndex === next.wordIndex ? current : next,
      );
      if (next.lineIndex !== lastLineIndex) {
        lastLineIndex = next.lineIndex;
        useLyricsStore.getState().setActiveLineIndex(next.lineIndex >= 0 ? next.lineIndex : null);
        if (Date.now() >= userScrollUntilRef.current && next.lineIndex >= 0) {
          const container = scrollRef.current;
          const line = lineRefs.current[next.lineIndex];
          if (container && line) {
            container.scrollTo({
              top: Math.max(0, line.offsetTop - container.clientHeight / 2 + line.clientHeight / 2),
              behavior: "smooth",
            });
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      useLyricsStore.getState().setActiveLineIndex(null);
    };
  }, [lines]);

  const noteUserScroll = () => {
    userScrollUntilRef.current = Date.now() + 6000;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      userScrollUntilRef.current = 0;
      const container = scrollRef.current;
      const line = lineRefs.current[getTimedLyricsPosition(lines, currentAudioPositionMs()).lineIndex];
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
      style={{
        color: lineIndex === position.lineIndex
          ? index <= position.wordIndex ? "#fff" : "rgba(255,255,255,0.38)"
          : "inherit",
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
        {lines.map((line, lineIndex) => {
          const active = lineIndex === position.lineIndex;
          return (
            <div
              key={`${line.timeMs}-${lineIndex}`}
              ref={(node) => { lineRefs.current[lineIndex] = node; }}
              className="cursor-pointer whitespace-pre-wrap text-[clamp(1.5rem,2.35vw,3rem)] font-semibold leading-[1.4] transition-opacity duration-200"
              style={{ opacity: active ? 1 : 0.38 }}
              onClick={() => playerEngine.seek(line.timeMs, true)}
            >
              {line.words?.length
                ? line.words.map((word, index) => renderWord(word, index, lineIndex))
                : line.text}
            </div>
          );
        })}
      </div>
    </div>
  );
});
