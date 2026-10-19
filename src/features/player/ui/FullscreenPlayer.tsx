import {
  useCallback,
  useEffect,
  createElement,
  useRef,
  useState,
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { usePlayerState } from "../hooks/usePlayerState";
import { playerEngine } from "../engine/playerEngine";
import {
  useLyricsStore,
  LyricsProviderIsland,
  braccatoThemeCss,
  hasSyncedLyricsSources,
} from "@/features/lyrics";
import { AnimatePresence, motion } from "framer-motion";
import { PlayerUiElements } from "./PlayerUiElements";
import { TimedWordLyricsView } from "./TimedWordLyricsView";
import { WordTimingEditor } from "./WordTimingEditor";
import { hasWordTimedLyrics } from "@/features/lyrics/engine/wordTiming";
import { DownLine } from "@mingcute/react";
import { preloadCoverArt, useCoverSrc } from "@/features/covers";
import "@braccato/core/element";
import "@braccato/core/styles/variables.css";
import "@braccato/core/styles/lyrics.css";
import "@braccato/core/styles/instrumental.css";
import KawarpWrapper from "./KawarpWrapper";
import { useTranslation } from "@/languages";
import {
  clampLeftPanePercent,
  DEFAULT_ARTWORK_SIZE,
  DEFAULT_LEFT_PANE_PERCENT,
  FULLSCREEN_ARTWORK_STORAGE_KEY,
  FULLSCREEN_PANE_STORAGE_KEY,
  getFullscreenArtworkSize,
  getLeftPaneLimits,
} from "./fullscreenLayout";

const BRACCATO_TAG = "braccato-lyrics";

interface BraccatoLyricsViewProps {
  lyrics: any[];
}

const BraccatoLyricsView = memo(function BraccatoLyricsView({ lyrics }: BraccatoLyricsViewProps) {
  const player = usePlayerState();
  const elementRef = useRef<any>(null);
  const latestLyricsRef = useRef(lyrics);
  const freeScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWheelTimeRef = useRef(0);
  const isInFreeSearchRef = useRef(false);
  const waitingForAudioAfterClickRef = useRef(false);

  const scrollToActiveLine = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const el = elementRef.current;
      if (!el) return false;

      const activeEls = (el as HTMLElement).querySelectorAll<HTMLElement>(
        ".blyrics--active",
      );
      if (activeEls.length === 0) return false;
      const activeEl = activeEls[activeEls.length - 1];

      const containerRect = el.getBoundingClientRect();
      const elRect = activeEl.getBoundingClientRect();
      if (containerRect.height === 0 || elRect.height === 0) return false;

      const offset = elRect.top - containerRect.top + el.scrollTop;
      const targetScrollTop =
        offset - containerRect.height / 2 + elRect.height / 2;

      if (behavior === "auto") {
        el.scrollTop = Math.max(0, targetScrollTop);
      } else {
        el.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior,
        });
      }
      return true;
    },
    [],
  );

  const returnToFollowingMode = useCallback(() => {
    if (freeScrollTimerRef.current) {
      clearTimeout(freeScrollTimerRef.current);
      freeScrollTimerRef.current = null;
    }
    isInFreeSearchRef.current = false;
    lastWheelTimeRef.current = 0;

    const el = elementRef.current;
    if (!el) return;

    if (el.renderer) {
      el.renderer.resumeAutoscroll?.();
      const engine = (el.renderer as any)?.engine;
      if (engine) {
        engine.scrollResumeTime = 0;
        engine.nextScrollAllowedTime = 0;
        engine.queuedScroll = true;
      }
    }

    scrollToActiveLine("smooth");
  }, [scrollToActiveLine]);

  const returnToFollowingModeRef = useRef(returnToFollowingMode);
  returnToFollowingModeRef.current = returnToFollowingMode;

  const handleUserInteraction = useCallback(() => {
    lastWheelTimeRef.current = Date.now();
    isInFreeSearchRef.current = true;

    const el = elementRef.current;
    if (el?.renderer) {
      el.renderer.noteUserScroll?.();
      el.renderer.noteUserScroll?.();
      el.renderer.noteUserScroll?.();
    }

    if (freeScrollTimerRef.current) {
      clearTimeout(freeScrollTimerRef.current);
      freeScrollTimerRef.current = null;
    }

    freeScrollTimerRef.current = setTimeout(() => {
      const elapsed = Date.now() - lastWheelTimeRef.current;
      if (elapsed < 5900) return;

      returnToFollowingMode();
    }, 6000);
  }, [returnToFollowingMode]);

  const handleUserInteractionRef = useRef(handleUserInteraction);
  handleUserInteractionRef.current = handleUserInteraction;

  const setElement = useCallback((el: any) => {
    elementRef.current = el;
    if (!el) return;
    el.theme = braccatoThemeCss;
    el.lyrics = latestLyricsRef.current;
    el.source = "#wavo-audio";

    const handleBraccatoLineClick = (e: Event) => {
      const isAudioLoading = playerEngine.getSnapshot().status === "loading";
      if (isAudioLoading) {
        waitingForAudioAfterClickRef.current = true;
        isInFreeSearchRef.current = true;
        if (freeScrollTimerRef.current) {
          clearTimeout(freeScrollTimerRef.current);
          freeScrollTimerRef.current = null;
        }
        if (el.renderer) {
          el.renderer.noteUserScroll?.();
          el.renderer.noteUserScroll?.();
          el.renderer.noteUserScroll?.();
        }
      } else {
        returnToFollowingModeRef.current();
      }

      const detail = (e as CustomEvent).detail as
        | { timeS?: number; time?: number }
        | undefined;
      const timeMs =
        detail?.timeS !== undefined
          ? Math.round(detail.timeS * 1000)
          : detail?.time !== undefined
            ? detail.time > 1000
              ? Math.round(detail.time)
              : Math.round(detail.time * 1000)
            : null;
      if (timeMs !== null) {
        playerEngine.seek(timeMs, true);
      }
    };

    const onUserScroll = () => {
      handleUserInteractionRef.current();
    };

    const onLyricsLoaded = () => {
      if (waitingForAudioAfterClickRef.current) return;
      requestAnimationFrame(() => {
        if (!waitingForAudioAfterClickRef.current) {
          scrollToActiveLine("auto");
        }
      });
    };

    let syncRafId: number;
    let lastReportedIndex = -1;

    const checkActiveLine = () => {
      const audioEl = document.getElementById("wavo-audio") as HTMLAudioElement | null;
      if (audioEl && !Number.isNaN(audioEl.currentTime)) {
        const currentMs = audioEl.currentTime * 1000;
        const lines = useLyricsStore.getState().syncedLines;
        let idx = -1;
        for (let i = 0; i < lines.length; i++) {
          const prevEnd =
            i > 0 && lines[i - 1].words && lines[i - 1].words!.length > 0
              ? lines[i - 1].words![lines[i - 1].words!.length - 1].endMs
              : i > 0
                ? lines[i - 1].timeMs
                : 0;
          const targetEarlyMs = Math.max(prevEnd, lines[i].timeMs - 600);
          if (targetEarlyMs <= currentMs) {
            idx = i;
          } else {
            break;
          }
        }
        if (idx !== lastReportedIndex) {
          lastReportedIndex = idx;
          useLyricsStore.getState().setActiveLineIndex(idx >= 0 ? idx : null);
        }
      }
      syncRafId = requestAnimationFrame(checkActiveLine);
    };

    syncRafId = requestAnimationFrame(checkActiveLine);

    el.addEventListener("braccato:lyrics-loaded", onLyricsLoaded);
    el.addEventListener("braccato:line-click", handleBraccatoLineClick);
    el.addEventListener("wheel", onUserScroll, { passive: true, capture: true });
    el.addEventListener("touchmove", onUserScroll, { passive: true, capture: true });

    return () => {
      cancelAnimationFrame(syncRafId);
      useLyricsStore.getState().setActiveLineIndex(null);
      el.removeEventListener("braccato:lyrics-loaded", onLyricsLoaded);
      el.removeEventListener("braccato:line-click", handleBraccatoLineClick);
      el.removeEventListener("wheel", onUserScroll, { capture: true });
      el.removeEventListener("touchmove", onUserScroll, { capture: true });
      if (freeScrollTimerRef.current) {
        clearTimeout(freeScrollTimerRef.current);
        freeScrollTimerRef.current = null;
      }
      elementRef.current = null;
    };
  }, [scrollToActiveLine]);

  useEffect(() => {
    latestLyricsRef.current = lyrics;
    const element = elementRef.current;
    if (element) element.lyrics = lyrics;
  }, [lyrics]);

  useEffect(() => {
    if (
      (player.status === "playing" || player.status === "paused") &&
      waitingForAudioAfterClickRef.current
    ) {
      waitingForAudioAfterClickRef.current = false;
      returnToFollowingMode();
    }
  }, [player.status, returnToFollowingMode]);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const checkAndScroll = () => {
      if (cancelled || waitingForAudioAfterClickRef.current) return;
      attempts++;
      const success = scrollToActiveLine("auto");
      if (!success && attempts < 30) {
        requestAnimationFrame(checkAndScroll);
      }
    };

    const rafId = requestAnimationFrame(checkAndScroll);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [lyrics, scrollToActiveLine]);

  return (
    <div className="relative flex flex-col flex-1 w-full h-full min-h-0">
      {createElement(BRACCATO_TAG, {
        ref: setElement,
        source: "#wavo-audio",
        className: "block flex-1 w-full h-full px-6",
        style: {
          overflowY: "auto",
          overflowX: "hidden",
          position: "relative",
          scrollbarWidth: "none",
        },
      })}
    </div>
  );
});

export interface FullscreenPlayerProps {
  effectsReady?: boolean;
  onClose: () => void;
}

export function FullscreenPlayer({
  effectsReady = true,
  onClose,
}: FullscreenPlayerProps) {
  const { t } = useTranslation();
  const player = usePlayerState();
  const coverUrl = player.currentTrack?.coverUrl;
  const kawarpSrc = useCoverSrc(coverUrl);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingSplitRef = useRef(false);
  const previousBodyStylesRef = useRef<{ cursor: string; userSelect: string } | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [wordTimingEditorOpen, setWordTimingEditorOpen] = useState(false);
  const [preferredLeftPercent, setPreferredLeftPercent] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(FULLSCREEN_PANE_STORAGE_KEY));
      return Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_LEFT_PANE_PERCENT;
    } catch {
      return DEFAULT_LEFT_PANE_PERCENT;
    }
  });
  const preferredLeftPercentRef = useRef(preferredLeftPercent);
  const [preferredArtworkSize, setPreferredArtworkSize] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(FULLSCREEN_ARTWORK_STORAGE_KEY));
      return Number.isFinite(saved) && saved >= 150 ? saved : DEFAULT_ARTWORK_SIZE;
    } catch {
      return DEFAULT_ARTWORK_SIZE;
    }
  });
  const leftPercent = clampLeftPanePercent(preferredLeftPercent, containerSize.width);
  const paneLimits = getLeftPaneLimits(containerSize.width);
  const artworkSize = getFullscreenArtworkSize(preferredArtworkSize, leftPercent, containerSize.width, containerSize.height);

  useEffect(() => {
    const container = splitContainerRef.current;
    if (!container) return;
    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      setContainerSize((current) =>
        current.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height },
      );
    };
    updateSize();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateSize) : null;
    observer?.observe(container);
    window.addEventListener("resize", updateSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  const updateLeftPercent = useCallback((value: number, width: number) => {
    const next = clampLeftPanePercent(value, width);
    preferredLeftPercentRef.current = next;
    setPreferredLeftPercent(next);
  }, []);

  const saveLeftPercent = useCallback(() => {
    try {
      localStorage.setItem(FULLSCREEN_PANE_STORAGE_KEY, String(preferredLeftPercentRef.current));
    } catch {}
  }, []);

  const stopDraggingSplit = useCallback(() => {
    if (!isDraggingSplitRef.current) return;
    isDraggingSplitRef.current = false;
    if (previousBodyStylesRef.current) {
      document.body.style.cursor = previousBodyStylesRef.current.cursor;
      document.body.style.userSelect = previousBodyStylesRef.current.userSelect;
      previousBodyStylesRef.current = null;
    }
    saveLeftPercent();
  }, [saveLeftPercent]);

  useEffect(() => () => stopDraggingSplit(), [stopDraggingSplit]);

  const updateSplitFromPointer = useCallback((clientX: number) => {
    const rect = splitContainerRef.current?.getBoundingClientRect();
    if (!rect?.width) return;
    updateLeftPercent(((clientX - rect.left) / rect.width) * 100, rect.width);
  }, [updateLeftPercent]);

  const handleSplitPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    isDraggingSplitRef.current = true;
    previousBodyStylesRef.current = {
      cursor: document.body.style.cursor,
      userSelect: document.body.style.userSelect,
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    updateSplitFromPointer(event.clientX);
  }, [updateSplitFromPointer]);

  const handleSplitKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 2;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = leftPercent - step;
    else if (event.key === "ArrowRight") next = leftPercent + step;
    else if (event.key === "Home") next = paneLimits.min;
    else if (event.key === "End") next = paneLimits.max;
    if (next === null) return;
    event.preventDefault();
    updateLeftPercent(next, containerSize.width);
    saveLeftPercent();
  }, [leftPercent, paneLimits.min, paneLimits.max, containerSize.width, updateLeftPercent, saveLeftPercent]);

  useEffect(() => {
    if (!player.currentTrack) {
      onClose();
    }
  }, [player.currentTrack, onClose]);

  const {
    braccatoLyrics,
    syncedLines,
    rawFormat,
    lyricsLoading,
    lyricsError,
    plainLyrics,
    activeProvider,
    availableProviders,
    currentLyricsTrackId,
  } = useLyricsStore();

  const onError = useCallback((err: Error) => {
    console.error("kawarp load error:", err);
  }, []);

  const nextCoverUrl = player.queue[player.currentIndex + 1]?.coverUrl;
  useEffect(() => {
    void preloadCoverArt(coverUrl);
    void preloadCoverArt(nextCoverUrl);
  }, [coverUrl, nextCoverUrl]);

  const currentTrackId = player.currentTrack?.id;
  const isMatchingTrack = Boolean(currentTrackId && currentLyricsTrackId === currentTrackId);
  const hasLyrics = isMatchingTrack && braccatoLyrics.length > 0;
  const hasWordTiming = hasLyrics && hasWordTimedLyrics(syncedLines);
  const canEditWordTiming = hasLyrics && !lyricsLoading &&
    (!hasWordTiming || activeProvider === "wavo-manual");
  const hasPlainLyrics = isMatchingTrack && Boolean(plainLyrics?.trim()) && plainLyrics !== "[INSTRUMENTAL]";
  const hasSyncedSources = hasSyncedLyricsSources(
    availableProviders,
    braccatoLyrics,
    rawFormat,
  );
  const showProviderIsland =
    hasLyrics && (hasSyncedSources || availableProviders.length > 1);
  const isInstrumental =
    isMatchingTrack &&
    !lyricsLoading &&
    !hasLyrics &&
    !lyricsError &&
    plainLyrics === "[INSTRUMENTAL]";

  return (
    <div
      data-theme="dark"
      className="dark relative h-full w-full overflow-hidden bg-black text-white"
    >
      <div className="absolute inset-0 overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ backgroundColor: "var(--color-bg-primary)" }}
        />
        {kawarpSrc && (
          <div
            className="absolute inset-0 bg-cover bg-center filter blur-3xl scale-110 opacity-70 pointer-events-none"
            style={{ backgroundImage: `url(${kawarpSrc})` }}
          />
        )}
        {effectsReady ? (
          <KawarpWrapper src={kawarpSrc} onError={onError} />
        ) : null}
      </div>

      <div className="absolute inset-0 z-[1] bg-black/40" />

      <div ref={splitContainerRef} className="absolute inset-0 z-10 flex">
        <div
          className="flex-none min-w-0 overflow-x-hidden overflow-y-auto px-4 flex flex-col items-center gap-5"
          style={{ width: `${leftPercent}%`, justifyContent: "safe center" }}
        >
          <PlayerUiElements
            onClose={onClose}
            artworkSize={artworkSize}
            preferredArtworkSize={preferredArtworkSize}
            onArtworkSizeChange={(size) => {
              setPreferredArtworkSize(size);
              try { localStorage.setItem(FULLSCREEN_ARTWORK_STORAGE_KEY, String(size)); } catch {}
            }}
          />
        </div>

        <div
          role="separator"
          aria-label={t("player.resize_left_panel")}
          aria-orientation="vertical"
          aria-valuemin={Math.round(paneLimits.min)}
          aria-valuemax={Math.round(paneLimits.max)}
          aria-valuenow={Math.round(leftPercent)}
          tabIndex={0}
          title={t("player.resize_left_panel")}
          data-no-window-drag
          onPointerDown={handleSplitPointerDown}
          onPointerMove={(event) => {
            if (isDraggingSplitRef.current) updateSplitFromPointer(event.clientX);
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            stopDraggingSplit();
          }}
          onPointerCancel={stopDraggingSplit}
          onLostPointerCapture={stopDraggingSplit}
          onKeyDown={handleSplitKeyDown}
          onDoubleClick={() => {
            updateLeftPercent(DEFAULT_LEFT_PANE_PERCENT, containerSize.width);
            saveLeftPercent();
          }}
          className="group relative z-20 flex w-3 shrink-0 touch-none cursor-col-resize items-center justify-center outline-none"
        >
          <span className="h-full w-px bg-white/10 transition-colors group-hover:bg-white/35 group-focus-visible:bg-white/60" />
          <span className="absolute h-14 w-1 rounded-full bg-white/35 transition-colors group-hover:bg-white/75 group-focus-visible:bg-white" />
        </div>

        <div className="min-w-0 flex-1 h-full min-h-0 pl-2 pr-6 flex flex-col relative">
          {hasLyrics && !lyricsLoading && (
            <div className="absolute right-1 top-[52px] z-30 flex items-center gap-2 rounded-lg bg-black/50 px-2 py-1.5 text-[11px] text-white/70 backdrop-blur-xl">
              <span>{t(hasWordTiming ? "player.word_timing_available" : "player.line_timing_only")}</span>
              {canEditWordTiming && (
                <button type="button" onClick={() => setWordTimingEditorOpen(true)} className="rounded-md bg-white/15 px-2 py-1 text-white hover:bg-white/25">
                  {t("player.word_timing_edit")}
                </button>
              )}
            </div>
          )}
          {showProviderIsland && (
            <div className="absolute top-[12px] left-1/2 -translate-x-1/2 z-30 pointer-events-none flex justify-center">
              <LyricsProviderIsland />
            </div>
          )}

          <div
            className="flex-1 min-h-0 relative w-full h-full"
            style={{
              display: hasLyrics ? "flex" : "none",
            }}
          >
            <AnimatePresence initial={false}>
              {hasLyrics && (
                <motion.div
                  key={`lyrics-${currentTrackId}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, pointerEvents: "none" }}
                  transition={{ duration: 0.22, ease: "easeInOut" }}
                  className="absolute inset-0 flex flex-col"
                >
                  {hasWordTiming
                    ? <TimedWordLyricsView lines={syncedLines} />
                    : <BraccatoLyricsView lyrics={braccatoLyrics} />}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence mode="wait">
            {!hasLyrics && lyricsLoading ? (
              <motion.div
                key="skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 flex flex-col items-center justify-center"
              >
                <div className="flex flex-col gap-5 w-full max-w-[500px]">
                  {[80, 65, 45, 70, 55, 85, 60, 50, 75, 40, 65, 55].map(
                    (w, i) => (
                      <div
                        key={i}
                        className="h-5 rounded animate-pulse bg-border-alpha-14"
                        style={{ width: `${w}%` }}
                      />
                    ),
                  )}
                </div>
              </motion.div>
            ) : !hasLyrics && isInstrumental ? (
              <motion.div
                key="instrumental"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 flex items-center justify-center text-text-tertiary text-lg"
              >
                <span>{t("player.instrumental")}</span>
              </motion.div>
            ) : !hasLyrics && hasPlainLyrics ? (
              <motion.div
                key={`plain-lyrics-${currentTrackId}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 overflow-y-auto px-10 py-16 text-center"
              >
                <p className="mx-auto max-w-[720px] whitespace-pre-line text-[clamp(20px,2.4vw,32px)] font-semibold leading-relaxed text-white/90">
                  {plainLyrics}
                </p>
              </motion.div>
            ) : !hasLyrics ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 flex items-center justify-center text-text-tertiary"
              >
                <div className="flex flex-col items-center justify-center gap-3 opacity-80">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="opacity-40"
                  >
                    <path d="M9 18V5l12-2v13"></path>
                    <circle cx="6" cy="18" r="3"></circle>
                    <circle cx="18" cy="16" r="3"></circle>
                    <line x1="2" y1="2" x2="22" y2="22"></line>
                  </svg>
                  <span
                    className="text-[15px] font-[400] max-w-[250px] text-center"
                    style={{ lineHeight: "1.4" }}
                  >
                    {lyricsError ? t("player.lyrics_load_failed") : t("player.no_lyrics_found")}
                  </span>
                  <button
                    type="button"
                    onClick={() => playerEngine.retryLyrics()}
                    className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-white/20"
                  >
                    {t("error_screen.try_again")}
                  </button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <button
        type="button"
        aria-label={t("player.close_fullscreen")}
        title={t("player.close_fullscreen") || "Close"}
        onClick={onClose}
        data-no-window-drag
        className="absolute top-[12px] left-[12px] z-30 inline-flex h-[32px] w-[32px] items-center justify-center rounded-lg border-none bg-black/50 backdrop-blur-xl text-white/80 hover:text-white hover:bg-white/10 active:scale-[0.94] transition-all cursor-pointer select-none pointer-events-auto"
      >
        <DownLine size={18} />
      </button>
      {wordTimingEditorOpen && currentTrackId && hasLyrics && (
        <WordTimingEditor
          key={currentTrackId}
          trackId={currentTrackId}
          lines={syncedLines}
          onClose={() => setWordTimingEditorOpen(false)}
        />
      )}
    </div>
  );
}

export default function PlayerPage() {
  const navigate = useNavigate();
  return <FullscreenPlayer onClose={() => navigate(-1)} />;
}
