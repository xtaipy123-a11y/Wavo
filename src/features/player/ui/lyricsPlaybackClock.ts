import { playerEngine } from "../engine/playerEngine";
import {
  getListeningFollowClock,
  isListeningFollowPlaying,
  listeningFollowPositionMs,
} from "@/features/social/listeningClock";

export interface LyricsPlaybackClock {
  positionMs: number;
  playing: boolean;
  source: "audio" | "listening" | "store";
}

// A paused-looking element that never advances would freeze the lyrics even
// though it reports `paused === false` (stalled buffer, blocked autoplay).
const STALL_AFTER_MS = 1500;
let lastAudioSample = { time: 0, at: 0 };

/**
 * The lyrics need one clock even when the local media element is not running.
 * Prefer the audio element while it is actually advancing; otherwise a guest
 * falls back to the host's extrapolated position from the listening room.
 */
export function resolveLyricsPlaybackClock(): LyricsPlaybackClock {
  const snapshot = playerEngine.getSnapshot();
  const audio = typeof document === "undefined"
    ? null
    : (document.getElementById("wavo-audio") as HTMLAudioElement | null);
  const trackId = snapshot.currentTrack?.id ?? null;
  const following = Boolean(snapshot.playbackContext?.startsWith("listening:"));
  const followPosition = following && getListeningFollowClock()?.isGuest
    ? listeningFollowPositionMs(trackId)
    : null;

  const now = Date.now();
  const audioTime = audio && Number.isFinite(audio.currentTime) ? audio.currentTime : null;
  const stalled = audioTime !== null && audioTime === lastAudioSample.time &&
    lastAudioSample.at > 0 && now - lastAudioSample.at > STALL_AFTER_MS;
  if (audio && audioTime !== null && !audio.paused && audio.error === null &&
    audio.readyState >= 2 && (audio.seeking || !stalled)) {
    lastAudioSample = { time: audioTime, at: now };
    return { positionMs: audioTime * 1000, playing: true, source: "audio" };
  }

  if (followPosition !== null) {
    return {
      positionMs: followPosition,
      playing: isListeningFollowPlaying(trackId),
      source: "listening",
    };
  }

  if (audio && audioTime !== null && audio.readyState >= 1) {
    return {
      positionMs: audioTime * 1000,
      playing: snapshot.status === "playing",
      source: "audio",
    };
  }

  return {
    positionMs: snapshot.positionMs,
    playing: snapshot.status === "playing",
    source: "store",
  };
}
