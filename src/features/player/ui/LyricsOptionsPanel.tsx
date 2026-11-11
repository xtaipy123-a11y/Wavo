import { useEffect, useRef, useState } from "react";
import {
  LuCheck,
  LuMessageSquareQuote,
  LuMinimize,
  LuPlus,
  LuRotateCcw,
  LuTimer,
} from "react-icons/lu";
import { useTranslation } from "@/languages";
import { hasSyncedLyricsSources, useLyricsStore } from "@/features/lyrics";
import { hasWordTimedLyrics } from "@/features/lyrics/engine/wordTiming";
import { MenuSection } from "./MenuSection";

const OFFSET_PRESETS = [-1000, -500, -200, -100, 100, 200, 500, 1000];

interface LyricsOptionsPanelProps {
  trackId?: string | null;
  onEditWordTiming?: () => void;
  collapsible?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}

export function LyricsOptionsPanel({
  trackId,
  onEditWordTiming,
  collapsible = false,
  expanded = false,
  onToggle,
}: LyricsOptionsPanelProps) {
  const { t } = useTranslation();
  const {
    braccatoLyrics,
    syncedLines,
    activeProvider,
    availableProviders,
    currentLyricsTrackId,
    lyricsLoading,
    rawFormat,
    selectProvider,
    offsetMs,
    setOffset,
    adjustOffset,
    resetOffset,
  } = useLyricsStore();

  const [unit, setUnit] = useState<"ms" | "s">("ms");
  const [inputValue, setInputValue] = useState(String(offsetMs));
  const isInputFocusedRef = useRef(false);

  useEffect(() => {
    if (isInputFocusedRef.current) return;
    setInputValue(String(unit === "ms" ? offsetMs : offsetMs / 1000));
  }, [offsetMs, unit]);

  const isMatchingTrack = Boolean(
    trackId && currentLyricsTrackId === trackId,
  );
  const hasLyrics = isMatchingTrack && braccatoLyrics.length > 0;
  if (!hasLyrics) return null;

  const hasWordTiming = hasWordTimedLyrics(syncedLines);
  const canEditWordTiming =
    !lyricsLoading && (!hasWordTiming || activeProvider === "wavo-manual");

  const hasSyncedSources = hasSyncedLyricsSources(
    availableProviders,
    braccatoLyrics,
    rawFormat,
  );
  const isCurrentPlain =
    rawFormat === "plain" ||
    (braccatoLyrics.length > 0 &&
      braccatoLyrics.every(
        (line) => (line.startTimeMs ?? 0) === 0 && (line.durationMs ?? 0) === 0,
      ));
  const showOffset = hasSyncedSources && !isCurrentPlain;

  const handleOffsetInput = (value: string) => {
    setInputValue(value);
    const parsed = Number.parseFloat(value);
    if (Number.isNaN(parsed)) return;
    const targetMs =
      unit === "ms" ? Math.round(parsed) : Math.round(parsed * 1000);
    if (targetMs >= -60000 && targetMs <= 60000) {
      setOffset(targetMs);
    }
  };

  const statusSummary = (
    <span className="flex items-center gap-[5px]">
      <span
        aria-hidden="true"
        className={`h-[6px] w-[6px] rounded-full ${
          hasWordTiming ? "bg-emerald-400" : "bg-white/30"
        }`}
      />
      {t(
        hasWordTiming
          ? "player.word_timing_available"
          : "player.line_timing_only",
      )}
    </span>
  );

  const content = (
    <>
      {canEditWordTiming && onEditWordTiming && (
        <button
          type="button"
          onClick={onEditWordTiming}
          className="mb-1.5 w-full cursor-pointer rounded-lg border-0 bg-white/10 px-2 py-1 text-left text-[12px] font-medium text-white transition-colors hover:bg-white/15"
        >
          {t("player.word_timing_edit")}
        </button>
      )}

      {availableProviders.length > 0 && (
        <>
          <div className="mb-1 px-2 text-[11px] font-medium text-text-secondary">
            {t("player.lyrics_source")}
          </div>
          <div
            role="group"
            aria-label={t("player.lyrics_source")}
            className="grid grid-cols-2 gap-[3px]"
          >
            {availableProviders.map((option) => {
              const isActive = option.provider === activeProvider;
              return (
                <button
                  key={option.provider}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => selectProvider(option.provider)}
                  className={`flex w-full cursor-pointer items-center justify-between gap-1 rounded-md border-0 px-2 py-1 text-left text-[11px] transition-colors ${
                    isActive
                      ? "bg-white/15 font-medium text-white"
                      : "bg-white/[0.04] text-text-secondary hover:bg-white/10 hover:text-text-primary"
                  }`}
                >
                  <span className="truncate">{option.provider}</span>
                  {isActive && (
                    <LuCheck
                      size={12}
                      className="shrink-0 text-white"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {showOffset && (
        <div className="mt-1.5 border-t border-white/[0.08] pt-1.5">
          <div className="mb-1 flex items-center justify-between px-2 text-[11px] font-medium text-text-secondary">
            <span className="flex items-center gap-[5px]">
              <LuTimer size={12} aria-hidden="true" />
              {t("player.lyrics_offset")}
            </span>
            {offsetMs !== 0 && (
              <button
                type="button"
                onClick={resetOffset}
                className="flex cursor-pointer items-center gap-[4px] rounded-md border-0 bg-transparent px-1 py-0.5 text-[10px] text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary"
              >
                <LuRotateCcw size={10} aria-hidden="true" />
                {t("player.reset")}
              </button>
            )}
          </div>
          <div className="flex items-center gap-[4px] rounded-lg bg-white/[0.06] p-[3px]">
            <button
              type="button"
              onClick={() => adjustOffset(unit === "ms" ? -50 : -100)}
              aria-label={t("player.earlier")}
              className="flex h-[24px] w-[24px] shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-text-secondary transition-all hover:bg-white/10 hover:text-text-primary active:scale-95"
            >
              <LuMinimize size={12} aria-hidden="true" />
            </button>
            <input
              type="text"
              inputMode="decimal"
              value={inputValue}
              onFocus={() => {
                isInputFocusedRef.current = true;
              }}
              onBlur={() => {
                isInputFocusedRef.current = false;
                setInputValue(
                  String(unit === "ms" ? offsetMs : offsetMs / 1000),
                );
              }}
              onChange={(event) => handleOffsetInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  adjustOffset(unit === "ms" ? 50 : 100);
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  adjustOffset(unit === "ms" ? -50 : -100);
                } else if (event.key === "Enter") {
                  (event.target as HTMLInputElement).blur();
                }
              }}
              aria-label={t("player.lyrics_offset")}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-center font-mono text-[12px] font-semibold text-text-primary outline-none"
            />
            <button
              type="button"
              onClick={() => adjustOffset(unit === "ms" ? 50 : 100)}
              aria-label={t("player.later")}
              className="flex h-[24px] w-[24px] shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-text-secondary transition-all hover:bg-white/10 hover:text-text-primary active:scale-95"
            >
              <LuPlus size={12} aria-hidden="true" />
            </button>
            <div className="flex shrink-0 items-center rounded-md bg-white/10 p-[2px]">
              {(["ms", "s"] as const).map((optionUnit) => (
                <button
                  key={optionUnit}
                  type="button"
                  onClick={() => setUnit(optionUnit)}
                  className={`cursor-pointer rounded-[4px] border-0 px-[5px] py-[2px] font-mono text-[10px] transition-all ${
                    unit === optionUnit
                      ? "bg-white/20 font-semibold text-text-primary"
                      : "bg-transparent text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {optionUnit}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-1 grid grid-cols-4 gap-[3px]">
            {OFFSET_PRESETS.map((delta) => (
              <button
                key={delta}
                type="button"
                onClick={() => adjustOffset(delta)}
                className="cursor-pointer rounded-md border-0 bg-white/[0.06] py-[2px] text-center font-mono text-[10px] text-text-secondary transition-all hover:bg-white/15 hover:text-text-primary active:scale-95"
              >
                {delta > 0 ? `+${delta / 1000}s` : `${delta / 1000}s`}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );

  if (collapsible) {
    return (
      <MenuSection
        icon={
          <LuMessageSquareQuote
            size={14}
            className="text-text-secondary"
            aria-hidden="true"
          />
        }
        label={t("player.lyrics")}
        summary={statusSummary}
        expanded={expanded}
        onToggle={onToggle ?? (() => {})}
      >
        {content}
      </MenuSection>
    );
  }

  return (
    <div className="mb-3 border-b border-white/10 pb-3">
      <div className="mb-2 flex items-center justify-between gap-3 text-[12px] font-medium">
        <span className="flex items-center gap-[6px]">
          <LuMessageSquareQuote
            size={14}
            className="text-text-secondary"
            aria-hidden="true"
          />
          {t("player.lyrics")}
        </span>
        <span className="flex items-center gap-[5px] text-[11px] font-normal text-text-secondary">
          {statusSummary}
        </span>
      </div>
      {content}
    </div>
  );
}

