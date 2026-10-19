import { useCallback, useEffect, useMemo, useState } from "react";
import type { SyncedLine } from "@/features/lyrics/engine/lyricsParser";
import { parseRawLyrics } from "@/features/lyrics/engine/lyricsParser";
import { buildManualRichsync, isCompleteManualWordLine, tokenizeLyricLine } from "@/features/lyrics/engine/manualWordTiming";
import { lyricsCache, useLyricsStore } from "@/features/lyrics";
import { wavoDb } from "@/shared/storage";
import type { LyricsCandidate } from "@/shared/contracts/lyrics";
import { useTranslation } from "@/languages";
import { playerEngine } from "../engine/playerEngine";
import { usePlayerState } from "../hooks/usePlayerState";

interface WordTimingEditorProps {
  trackId: string;
  lines: SyncedLine[];
  onClose: () => void;
}

function audioPositionMs(): number {
  const audio = document.getElementById("wavo-audio") as HTMLAudioElement | null;
  return audio?.readyState ? Math.round(audio.currentTime * 1000) : playerEngine.getSnapshot().positionMs;
}

export function WordTimingEditor({ trackId, lines, onClose }: WordTimingEditorProps) {
  const { t } = useTranslation();
  const player = usePlayerState();
  const tokens = useMemo(() => lines.map((line) => tokenizeLyricLine(line.text)), [lines]);
  const [lineIndex, setLineIndex] = useState(() => Math.min(lines.length - 1, Math.max(0, useLyricsStore.getState().activeLineIndex ?? 0)));
  const [stamps, setStamps] = useState<(number | null)[][]>(() => lines.map((line, index) => {
    const words = line.words || [];
    const parts = tokenizeLyricLine(line.text);
    return words.length === parts.length && parts.length > 1 &&
      words.every((word, i) => word.text.trim() === parts[i].trim())
      ? words.map((word) => word.timeMs)
      : parts.map(() => null);
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const currentTokens = tokens[lineIndex] || [];
  const currentStamps = stamps[lineIndex] || [];
  const nextWordIndex = currentStamps.findIndex((time) => time === null);
  const completedLines = stamps.filter((times, index) =>
    isCompleteManualWordLine(tokens[index], times),
  ).length;

  const tap = useCallback(() => {
    if (playerEngine.getSnapshot().status !== "playing") return;
    const index = (stamps[lineIndex] || []).findIndex((time) => time === null);
    if (index < 0) return;
    const time = Math.max(lines[lineIndex].timeMs, audioPositionMs());
    setStamps((current) => current.map((lineTimes, currentLine) =>
      currentLine === lineIndex
        ? lineTimes.map((value, wordIndex) => wordIndex === index ? time : value)
        : lineTimes,
    ));
    if (index === currentTokens.length - 1 && lineIndex + 1 < lines.length) {
      setLineIndex(lineIndex + 1);
    }
  }, [stamps, lineIndex, lines, currentTokens.length]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!event.repeat) tap();
      } else if (event.code === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [tap, onClose]);

  const startLine = () => {
    const line = lines[lineIndex];
    if (!line) return;
    setStamps((current) => current.map((times, index) =>
      index === lineIndex ? times.map(() => null) : times,
    ));
    playerEngine.seek(Math.max(0, line.timeMs - 450), true);
  };

  const save = async () => {
    const result = buildManualRichsync(lines, stamps);
    if (result.completedLines === 0) return;
    setSaving(true);
    setError("");
    try {
      playerEngine.cancelLyricsFetchForManualTiming(trackId);
      const parsed = parseRawLyrics(result.content, "richsync");
      const current = useLyricsStore.getState();
      const candidate: LyricsCandidate = {
        provider: "wavo-manual",
        lyrics: { format: "richsync", content: result.content },
        contentKind: "word_synced",
        syncHint: "word_synced",
        syncLevel: "word_level",
        topPriority: true,
        quality: {
          total: 110,
          match: 30,
          content: 30,
          sync: 40,
          source: 10,
          reasons: ["Locally timed word lyrics"],
        },
      };
      const options = [
        ...current.availableProviders.filter((option) => option.provider !== "wavo-manual"),
        { provider: "wavo-manual", syncLevel: "word_level" as const, quality: 110, candidate },
      ];
      lyricsCache.set(trackId, candidate, options);
      await wavoDb.putLyrics({
        trackId,
        syncLevel: "word_level",
        quality: 110,
        activeProvider: "wavo-manual",
        availableProviders: options,
        rawLyrics: result.content,
        rawFormat: "richsync",
        candidate,
        lastCheckedAt: Date.now(),
        updatedAt: Date.now(),
        userLocked: true,
      });
      current.setOffset(0);
      useLyricsStore.getState().setLyricsState({
        rawLyrics: result.content,
        rawFormat: "richsync",
        braccatoLyrics: parsed.braccatoLyrics,
        syncedLines: parsed.syncedLines,
        plainLyrics: parsed.plainLyrics,
        activeProvider: "wavo-manual",
        availableProviders: options,
        lyricsQuality: 110,
        currentLyricsTrackId: trackId,
      });
      onClose();
    } catch {
      setError(t("player.word_timing_save_failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-5 backdrop-blur-xl" data-no-window-drag>
      <div className="flex max-h-[90vh] w-full max-w-[720px] flex-col gap-5 overflow-y-auto rounded-2xl border border-white/15 bg-[#18151d]/95 p-6 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="m-0 text-xl font-semibold">{t("player.word_timing_title")}</h2>
            <p className="mb-0 mt-2 text-sm text-white/60">{t("player.word_timing_help")}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-white/70 hover:bg-white/10 hover:text-white">✕</button>
        </div>

        <div className="flex items-center justify-between gap-3 text-sm text-white/65">
          <button type="button" disabled={lineIndex === 0} onClick={() => setLineIndex(lineIndex - 1)} className="rounded-lg bg-white/10 px-3 py-2 text-white disabled:opacity-30">←</button>
          <span>{t("player.word_timing_line")} {lineIndex + 1} / {lines.length} · {completedLines} {t("player.word_timing_done")}</span>
          <button type="button" disabled={lineIndex >= lines.length - 1} onClick={() => setLineIndex(lineIndex + 1)} className="rounded-lg bg-white/10 px-3 py-2 text-white disabled:opacity-30">→</button>
        </div>

        <div className="min-h-[150px] rounded-xl bg-white/5 p-5 text-[clamp(1.3rem,2.4vw,2rem)] font-semibold leading-relaxed">
          {currentTokens.map((word, index) => (
            <span key={index} style={{ color: Number.isFinite(currentStamps[index]) ? "#fff" : "rgba(255,255,255,0.35)" }}>
              {word}
            </span>
          ))}
          {currentTokens.length === 0 && <span className="text-white/40">♪</span>}
        </div>

        <div className="text-center text-sm text-white/60">
          {nextWordIndex >= 0 ? `${t("player.word_timing_next")}: ${currentTokens[nextWordIndex]?.trim()}` : t("player.word_timing_line_complete")}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={startLine} className="rounded-lg bg-white/10 px-4 py-3 text-sm font-medium hover:bg-white/20">
            {t("player.word_timing_restart")}
          </button>
          <button type="button" onClick={tap} disabled={player.status !== "playing" || nextWordIndex < 0} className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-black hover:bg-white/85 disabled:opacity-40">
            {t("player.word_timing_tap")}
          </button>
        </div>

        {error && <p className="m-0 text-center text-sm text-red-300">{error}</p>}
        <div className="flex justify-end gap-3 border-t border-white/10 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-white/70 hover:bg-white/10">{t("common.cancel")}</button>
          <button type="button" onClick={() => void save()} disabled={saving || completedLines === 0} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-40">{t("player.save")}</button>
        </div>
      </div>
    </div>
  );
}
