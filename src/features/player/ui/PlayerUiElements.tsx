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
import { HeartFill, HeartLine } from "@mingcute/react";
import { LuMessageSquareQuote, LuSparkles } from "react-icons/lu";
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
import { VolumePicker } from "./VolumePicker";
import { TimelineSlider } from "./TimelineSlider";
import { PlayerOptionsMenu } from "./PlayerOptionsMenu";

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
  lyricsVisible?: boolean;
  onToggleLyrics?: () => void;
  onEditWordTiming?: () => void;
}

export function PlayerUiElements({
  onDuration: _onDuration,
  onClose,
  artworkSize = 280,
  preferredArtworkSize,
  onArtworkSizeChange,
  lyricsVisible = true,
  onToggleLyrics,
  onEditWordTiming,
}: PlayerUiElementsProps) {
  const player = usePlayerState();

  const track = player.currentTrack;
  const coverUrl = track?.coverUrl || "";
  const trackTitle = track?.title || "";
  const trackArtists = track?.artists || "";

  const isLiked = useIsTrackLiked(track?.id);
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
  const favoriteLabel = t(isLiked ? "common.remove_from_favorites" : "common.add_to_favorites");

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
      </div>

      {/* Track info */}
      <div className="flex items-start justify-center min-w-0" style={{ width: artworkSize, maxWidth: "100%" }}>
        <div className="flex w-full flex-col gap-[2px] min-w-0 text-center">
          <div
            className="relative m-0 flex min-h-[28px] min-w-0 max-w-[calc(100%-68px)] self-center items-center justify-center font-[600] text-white"
            style={{ letterSpacing: "-0.03em", fontSize: artworkSize >= 420 ? 18 : 16 }}
          >
            <span className="min-w-0 truncate">{trackTitle}</span>
            <Tooltip content={favoriteLabel} side="top" wrapperClassName="!absolute left-full top-1/2 ml-[6px] -translate-y-1/2">
              <button
                type="button"
                aria-label={favoriteLabel}
                aria-pressed={isLiked}
                disabled={!track}
                data-no-window-drag
                className={`inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full border-none bg-transparent cursor-pointer transition-all duration-150 hover:bg-white/10 active:scale-[0.92] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-default disabled:opacity-40 ${
                  isLiked ? "text-white" : "text-white/60 hover:text-white"
                }`}
                onClick={handleLikeToggle}
              >
                {isLiked ? <HeartFill size={20} aria-hidden="true" /> : <HeartLine size={20} aria-hidden="true" />}
              </button>
            </Tooltip>
          </div>
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
      <div className="relative flex items-center gap-[14px]">
        <PlayerOptionsMenu
          className={`${iconButtonClass} absolute right-full mr-[14px] rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white`}
          trackId={track?.id}
          artworkSize={artworkSize}
          preferredArtworkSize={preferredArtworkSize}
          onArtworkSizeChange={onArtworkSizeChange}
          onEditWordTiming={onEditWordTiming}
        />
        <button
          type="button"
          aria-label="Shuffle"
          aria-pressed={player.shuffle}
          title={
            player.shuffle && player.smartShuffle
              ? t("player.shuffle_smart_on")
              : player.shuffle
                ? t("player.shuffle_on")
                : t("player.shuffle_off")
          }
          onClick={() => playerEngine.cycleShuffle()}
          className={`${iconButtonClass} relative ${
            player.shuffle ? "!text-white !opacity-100" : "!text-white/40"
          }`}
        >
          <Shuffle size={18} weight={player.shuffle ? "Bold" : "Outline"} />
          {player.shuffle && player.smartShuffle && (
            <LuSparkles className="absolute -right-[1px] -top-[1px]" size={9} aria-hidden="true" />
          )}
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
          aria-pressed={player.repeat !== "off"}
          title={player.repeat === "off" ? (locale === "de" ? "Wiederholung aus" : "Repeat off") : player.repeat === "all" ? (locale === "de" ? "Playlist wiederholen" : "Repeat playlist") : (locale === "de" ? "Song wiederholen" : "Repeat song")}
          onClick={() =>
            playerEngine.setRepeat(
              player.repeat === "off"
                ? "all"
                : player.repeat === "all"
                  ? "one"
                  : "off",
            )
          }
          className={`${iconButtonClass} relative ${
            player.repeat !== "off" ? "!text-white !opacity-100" : "!text-white/40"
          }`}
        >
          {player.repeat === "one" ? (
            <RepeatOne size={18} weight="Bold" />
          ) : (
            <Repeat size={18} weight={player.repeat === "all" ? "Bold" : "Outline"} />
          )}
          {player.repeat !== "off" && (
            <span aria-hidden="true" className="absolute bottom-[2px] h-[3px] w-[3px] rounded-full bg-current" />
          )}
        </button>
        {onToggleLyrics && (
          <button
            type="button"
            aria-label={t("player.lyrics")}
            aria-pressed={lyricsVisible}
            aria-controls="fullscreen-player-lyrics"
            title={t(lyricsVisible ? "player.hide_lyrics" : "player.show_lyrics")}
            onClick={onToggleLyrics}
            data-no-window-drag
            className={`${iconButtonClass} absolute left-full ml-[14px] rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
              lyricsVisible ? "!bg-white/15 !text-white !opacity-100" : "!text-white/40"
            }`}
          >
            <LuMessageSquareQuote size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Volume (Compact smooth slider, size sm) */}
      <VolumePicker className="w-[180px]" size="sm" />
    </>
  );
}

export default PlayerUiElements;
