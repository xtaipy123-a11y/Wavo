import { useState, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import {
  SkipNext,
  SkipPrevious,
  MusicNote,
  Repeat,
  RepeatOne,
  Shuffle,
} from "@solar-icons/react";
import { AddLine, CheckFill } from "@mingcute/react";
import { LuCheck, LuDownload, LuX } from "react-icons/lu";
import {
  PlayerMorphIcon,
  ICON_PLAY,
  ICON_PAUSE,
} from "./morphPlayerIcons";
import { usePlayerState } from "../hooks/usePlayerState";
import { playerEngine } from "../engine/playerEngine";
import { useIsTrackLiked, useLikeTrack, useUnlikeTrack } from "@/features/library/hooks";
import { AnimatePresence, motion } from "framer-motion";
import { ArtistLink } from "@/features/artist";
import { useCoverReady, CoverImage } from "@/features/covers";
import ExplicitBadge from "@/shared/ui/ExplicitBadge";
import Tooltip from "@/shared/ui/Tooltip";
import { showToast } from "@/shared/ui";
import { useDownloadStore } from "@/features/downloads/downloadStore";
import { VolumePicker } from "./VolumePicker";
import { TimelineSlider } from "./TimelineSlider";

import { useTranslation } from "@/languages";

const iconButtonClass =
  "inline-flex h-[28px] w-[28px] items-center justify-center text-white opacity-70 transition-all duration-150 ease-out hover:opacity-100 active:scale-[0.94] shrink-0 border-none bg-transparent cursor-pointer";

function PlayPauseIcon({ status }: { status: string }) {
  const loading = status === "loading";
  const playing = status === "playing";
  // keep the morph icon mounted through the loading state (spinner overlays
  // it) — unmounting the icon on "loading" would remount MorphIcon when the
  // track starts, which skips the play -> pause morph animation.
  return (
    <span className="relative flex h-[22px] w-[22px] items-center justify-center">
      <span
        className={`absolute inset-0 flex items-center justify-center ${
          loading ? "opacity-0" : ""
        } transition-transform ${playing ? "" : "translate-x-[1px]"}`}
      >
        <PlayerMorphIcon
          icon={playing ? ICON_PAUSE : ICON_PLAY}
          size={22}
        />
      </span>
      {loading && (
        <span
          className="absolute h-[18px] w-[18px] animate-spin rounded-full border-[2px] border-current border-t-transparent"
          aria-label="Loading playback"
        />
      )}
    </span>
  );
}

interface PlayerUiElementsProps {
  onDuration?: (duration: number) => void;
  onClose?: () => void;
  artworkSize?: number;
  preferredArtworkSize?: number;
  onArtworkSizeChange?: (size: number) => void;
}

export function PlayerUiElements({
  onDuration: _onDuration,
  onClose,
  artworkSize = 280,
  preferredArtworkSize,
  onArtworkSizeChange,
}: PlayerUiElementsProps) {
  const player = usePlayerState();

  const track = player.currentTrack;
  const coverUrl = track?.coverUrl || "";
  const trackTitle = track?.title || "";
  const trackArtists = track?.artists || "";

  const isLiked = useIsTrackLiked(track?.id);
  const isDownloaded = useDownloadStore((state) =>
    Boolean(track && state.tracks.some((download) => download.id === track.id)),
  );
  const downloadStatus = useDownloadStore((state) =>
    track ? state.statusById[track.id] : undefined,
  );
  const likeMutation = useLikeTrack();
  const unlikeMutation = useUnlikeTrack();
  const togglingRef = useRef(false);

  const handleLikeToggle = useCallback(() => {
    if (!track || togglingRef.current) return;
    togglingRef.current = true;
    const onSettled = () => {
      togglingRef.current = false;
    };
    if (isLiked) {
      unlikeMutation.mutate(track.id, { onSettled });
    } else {
      likeMutation.mutate(track.id, { onSettled });
    }
  }, [track, isLiked, likeMutation, unlikeMutation]);

  const isCoverLoaded = useCoverReady(coverUrl);

  const { t, locale } = useTranslation();

  const handleDownload = useCallback(async () => {
    if (!track || isDownloaded) return;
    const downloads = useDownloadStore.getState();
    if (downloadStatus === "downloading") {
      downloads.cancel(track.id);
      return;
    }
    if (downloadStatus) return;
    try {
      await downloads.download(track);
      showToast(locale === "de" ? "Offline gespeichert" : "Saved for offline", "checkmark", {
        description: track.title,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      showToast(locale === "de" ? "Download fehlgeschlagen" : "Download failed", "error", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }, [track, isDownloaded, downloadStatus, locale]);

  return (
    <>
      {/* Artwork (Compact, flat, no drop shadows) */}
      <div
        className={`relative shrink-0 overflow-hidden rounded-xl bg-black/20 ${
          coverUrl && !isCoverLoaded ? "animate-pulse" : ""
        }`}
        style={{ width: artworkSize, height: artworkSize, maxWidth: "100%" }}
      >
        <AnimatePresence>
          <motion.div
            key={track?.id || coverUrl || "empty"}
            initial={{ opacity: 0, filter: "blur(8px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(8px)" }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute inset-0"
          >
            {coverUrl ? (
              <CoverImage
                key={coverUrl}
                src={coverUrl}
                alt={trackTitle}
                fill
                sizes={`${artworkSize}px`}
                priority
                unoptimized
                className="rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-white/5 text-white/40">
                <MusicNote size={64} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        {/* tooltip wrapper positioned on cover corner */}
        <Tooltip
          content={isLiked ? t("common.unlike") : t("common.like")}
          side="top"
          wrapperClassName="!absolute bottom-2.5 left-2.5 z-20"
        >
          <button
            type="button"
            aria-label={isLiked ? t("common.unlike") : t("common.like")}
            className={`relative inline-flex h-[30px] w-[30px] items-center justify-center rounded-full transition-all duration-200 ease-out active:scale-[0.92] bg-black/40 backdrop-blur-md border-none ${
              isLiked
                ? "text-white hover:bg-black/60"
                : "text-white/70 hover:text-white hover:bg-black/60"
            }`}
            onClick={handleLikeToggle}
            style={{ cursor: "pointer" }}
          >
            <motion.div
              initial={false}
              animate={{
                scale: isLiked ? 1 : 0.5,
                opacity: isLiked ? 1 : 0,
                rotate: isLiked ? 0 : -45,
              }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <CheckFill size={16} />
            </motion.div>
            <motion.div
              initial={false}
              animate={{
                scale: !isLiked ? 1 : 0.5,
                opacity: !isLiked ? 1 : 0,
                rotate: !isLiked ? 0 : 45,
              }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <AddLine size={16} />
            </motion.div>
          </button>
        </Tooltip>
      </div>

      {/* Track info */}
      <div className="flex items-start justify-center min-w-0" style={{ width: artworkSize, maxWidth: "100%" }}>
        <div className="flex flex-col gap-[2px] min-w-0 text-center">
          <p
            className="m-0 font-[600] text-white flex items-center justify-center gap-[6px] max-w-full"
            style={{ letterSpacing: "-0.03em", fontSize: artworkSize >= 420 ? 18 : 16 }}
          >
            <span className="min-w-0 truncate">{trackTitle}</span>
          </p>
          <p className="m-0 flex items-center justify-center gap-[5px] text-[13px] text-white/60 leading-snug max-w-full overflow-hidden">
            {track?.explicit && (
              <ExplicitBadge className="!bg-white/60 !text-black !pb-0 !leading-none shrink-0" />
            )}
            <ArtistLink
              name={trackArtists}
              artistId={track?.artistId}
              artistList={track?.artistList}
              onNavigate={() => {
                if (location.pathname !== "/player") {
                  onClose?.();
                }
              }}
              className="text-white/60"
            />
          </p>
        </div>
      </div>

      {track && (
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={isDownloaded || downloadStatus === "removing"}
          aria-label={downloadStatus === "downloading"
            ? (locale === "de" ? "Download abbrechen" : "Cancel download")
            : isDownloaded
              ? (locale === "de" ? "Offline gespeichert" : "Saved for offline")
              : (locale === "de" ? "Offline speichern" : "Download for offline")}
          className="inline-flex min-h-[32px] items-center justify-center gap-2 rounded-full border border-white/15 bg-black/35 px-3 text-[12px] font-medium text-white/85 backdrop-blur-md transition-colors hover:border-white/30 hover:bg-black/50 disabled:cursor-default disabled:opacity-60"
          data-no-window-drag
        >
          {downloadStatus === "downloading" ? <LuX size={14} /> : isDownloaded ? <LuCheck size={14} /> : <LuDownload size={14} />}
          <span>{downloadStatus === "downloading"
            ? (locale === "de" ? "Download abbrechen" : "Cancel download")
            : isDownloaded
              ? (locale === "de" ? "Offline gespeichert" : "Saved for offline")
              : (locale === "de" ? "Offline speichern" : "Download for offline")}</span>
        </button>
      )}

      {/* Timeline (Compact, with smooth spring pill, no thumb) */}
      <TimelineSlider
        positionMs={player.positionMs}
        durationMs={player.durationMs}
        onSeek={(pos) => playerEngine.seek(pos)}
        showTime
        size="md"
        className="w-full"
        style={{ maxWidth: Math.max(360, Math.min(520, artworkSize)) }}
      />

      {/* Primary Playback Controls */}
      <div className="flex items-center gap-[14px]">
        <button
          type="button"
          aria-label="Shuffle"
          title={player.shuffle ? t("player.shuffle_on") : t("player.shuffle_off")}
          onClick={() => playerEngine.setShuffle(!player.shuffle)}
          className={`${iconButtonClass} ${
            player.shuffle ? "!text-white !opacity-100" : "!text-white/40"
          }`}
        >
          <Shuffle size={18} weight={player.shuffle ? "Bold" : "Outline"} />
        </button>

        <button
          type="button"
          aria-label="Previous track"
          onClick={() => void playerEngine.skipPrevious()}
          className={iconButtonClass}
        >
          <SkipPrevious size={20} weight="Bold" />
        </button>

        <button
          type="button"
          aria-label={player.status === "playing" ? "Pause" : "Play"}
          onClick={() => void playerEngine.togglePlayPause()}
          className="inline-flex h-[36px] w-[36px] items-center justify-center text-white opacity-85 transition-all duration-150 ease-out hover:opacity-100 active:scale-[0.94] shrink-0 border-none bg-transparent cursor-pointer"
        >
          <PlayPauseIcon status={player.status} />
        </button>

        <button
          type="button"
          aria-label="Next track"
          onClick={() => void playerEngine.skipNext()}
          className={iconButtonClass}
        >
          <SkipNext size={20} weight="Bold" />
        </button>

        <button
          type="button"
          aria-label="Repeat"
          onClick={() =>
            playerEngine.setRepeat(
              player.repeat === "off"
                ? "all"
                : player.repeat === "all"
                  ? "one"
                  : "off",
            )
          }
          className={`${iconButtonClass} ${
            player.repeat !== "off" ? "!text-white !opacity-100" : "!text-white/40"
          }`}
        >
          {player.repeat === "one" ? (
            <RepeatOne size={18} />
          ) : (
            <Repeat size={18} />
          )}
        </button>
      </div>

      {/* Volume (Compact smooth slider, size sm) */}
      <VolumePicker className="w-[180px]" size="sm" />
      {onArtworkSizeChange && (
        <div className="flex w-full max-w-[230px] items-center gap-3 rounded-lg bg-black/30 px-3 py-2 text-white/70 backdrop-blur-md">
          <label htmlFor="wavo-artwork-size" className="shrink-0 text-[11px] font-medium">
            {t("player.artwork_size")}
          </label>
          <input
            id="wavo-artwork-size"
            type="range"
            min={180}
            max={640}
            step={10}
            value={preferredArtworkSize ?? artworkSize}
            onChange={(event) => onArtworkSizeChange(Number(event.target.value))}
            aria-label={t("player.artwork_size")}
            className="min-w-0 flex-1 accent-white"
            data-no-window-drag
          />
        </div>
      )}
    </>
  );
}

export default PlayerUiElements;
