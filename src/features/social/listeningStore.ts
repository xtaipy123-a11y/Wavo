import { create } from "zustand";
import { playerEngine, type RepeatMode } from "@/features/player/engine/playerEngine";
import { usePlayerStore } from "@/features/player/store/playerStore";
import type { Track } from "@/shared/types";
import {
  currentListeningUserId,
  listeningClient,
  type ListeningInvitation,
  type ListeningMember,
  type ListeningPlaylistSnapshot,
  type ListeningQueueItem,
  type ListeningRepeatMode,
  type ListeningRoom,
} from "./listeningClient";

const MAX_PLAYLIST_TRACKS = 500;
const MAX_PLAYLIST_DURATION_MS = 864_000_000;

/** Builds the compact playlist snapshot the room shares with every guest. */
export function listeningPlaylistFromTracks(
  id: string,
  title: string,
  coverUrl: string,
  tracks: Track[],
): ListeningPlaylistSnapshot {
  const snapshotTracks = tracks.slice(0, MAX_PLAYLIST_TRACKS).map((track) => ({
    id: track.id.slice(0, 100),
    title: (track.title || "Wavo").slice(0, 200),
    artists: (track.artists || "").slice(0, 200),
    coverUrl: (track.coverUrl || "").slice(0, 1000),
    durationMs: Math.max(0, Math.round(track.durationMs || 0)),
  }));
  const durationMs = snapshotTracks.reduce((total, track) => total + track.durationMs, 0);
  return {
    id: id.slice(0, 500),
    title: (title || "Playlist").slice(0, 500),
    coverUrl: (coverUrl || "").slice(0, 2000),
    trackCount: snapshotTracks.length,
    durationMs: Math.min(MAX_PLAYLIST_DURATION_MS, durationMs),
    tracks: snapshotTracks,
  };
}

export function listeningSnapshotTracks(playlist: ListeningPlaylistSnapshot): Track[] {
  return playlist.tracks.map((track) => ({
    id: track.id,
    title: track.title,
    artists: track.artists,
    coverUrl: track.coverUrl,
    durationMs: track.durationMs,
    playCount: 0,
  }));
}

async function playPlaylist(playlist: ListeningPlaylistSnapshot, context: string, repeat: RepeatMode, shuffle: boolean) {
  const tracks = listeningSnapshotTracks(playlist);
  if (!tracks.length) return;
  playerEngine.setRepeat(repeat);
  if (shuffle) {
    await playerEngine.playShuffled(tracks, context, playlist.coverUrl);
  } else {
    playerEngine.setShuffle(false);
    await playerEngine.playTrack(tracks[0], tracks, context, playlist.coverUrl);
  }
}

export function upcomingListeningQueue(player: ReturnType<typeof usePlayerStore.getState>) {
  return player.queue.slice(Math.max(0, player.currentIndex + 1), Math.max(0, player.currentIndex + 1) + 50)
    .map((track, offset) => ({ index: Math.max(0, player.currentIndex + 1) + offset,
      id: track.id, title: track.title.slice(0, 200), artists: track.artists.slice(0, 200) }));
}

export function canRequestListeningAction(
  room: ListeningRoom | null,
  member: ListeningMember | undefined,
  userId: string | undefined,
  action: "add" | "skip" | "move",
): boolean {
  if (!room || !room.active || !userId) return false;
  if (room.host_id === userId) return true;
  if (!member || member.user_id !== userId || member.status !== "active") return false;
  if (action === "add") return member.can_add ?? room.allow_guest_add;
  if (action === "skip") return member.can_skip ?? room.allow_guest_skip;
  return member.can_reorder ?? room.allow_guest_reorder;
}

interface ListeningState {
  room: ListeningRoom | null;
  members: ListeningMember[];
  invitations: ListeningInvitation[];
  error: string;
  refresh: () => Promise<void>;
  start: () => Promise<void>;
  startWithPlaylist: (
    playlist: ListeningPlaylistSnapshot,
    options?: { repeatMode?: ListeningRepeatMode; shuffle?: boolean },
  ) => Promise<void>;
  setPlaylist: (
    playlist: ListeningPlaylistSnapshot,
    options?: { repeatMode?: ListeningRepeatMode; shuffle?: boolean },
  ) => Promise<void>;
  setPlaybackSettings: (settings: { repeatMode?: ListeningRepeatMode; shuffle?: boolean }) => Promise<void>;
  invite: (friendId: string) => Promise<void>;
  join: (roomId: string) => Promise<void>;
  decline: (roomId: string) => Promise<void>;
  leave: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
  /** Mirrors the host's own player into the room row before the next poll. */
  applyHostPlayback: (playback: {
    trackId: string | null;
    trackTitle: string | null;
    positionMs: number;
    isPlaying: boolean;
    queue: ListeningQueueItem[];
  }) => void;
}

let refreshSequence = 0;
/**
 * Bumped every time the host mirrors its own player into the room row. A
 * refresh that was already in flight when that happened read the old row and
 * would otherwise flash the previous song back into the panel.
 */
let hostPlaybackEpoch = 0;

export function listeningError(cause: unknown): string {
  if (cause && typeof cause === "object") {
    const issue = cause as { code?: unknown; message?: unknown };
    if (issue.code === "PGRST205" || issue.code === "PGRST204" || issue.code === "42703") return "Das Hörsession-Update fehlt in Supabase. Führe die neueste Wavo-SQL-Migration aus.";
    if (typeof issue.message === "string" && issue.message.trim()) return issue.message;
  }
  return cause instanceof Error ? cause.message : "Die Hörsession ist gerade nicht erreichbar.";
}

export const useListeningStore = create<ListeningState>((set, get) => ({
  room: null,
  members: [],
  invitations: [],
  error: "",
  refresh: async () => {
    const sequence = ++refreshSequence;
    const epoch = hostPlaybackEpoch;
    try {
      const snapshot = await listeningClient.snapshot();
      if (sequence !== refreshSequence) return;
      const current = get().room;
      // The snapshot was requested before the host mirrored a fresh publish, so
      // its room row is older than what the panel already shows. Keep the local
      // playback state and only apply the membership changes.
      if (epoch !== hostPlaybackEpoch && current && snapshot.room?.id === current.id) {
        set({ members: snapshot.members, invitations: snapshot.invitations, error: "" });
        return;
      }
      set({ ...snapshot, error: "" });
    } catch (cause) {
      if (sequence === refreshSequence) set({ error: listeningError(cause) });
    }
  },
  start: async () => {
    const previous = get().room;
    if (previous) {
      if (previous.host_id === currentListeningUserId()) return;
      await get().leave();
    }
    const player = usePlayerStore.getState();
    await listeningClient.createRoom(
      player.currentTrack?.id ?? null, player.currentTrack?.title ?? null,
      player.positionMs, player.status === "playing" || player.status === "loading", upcomingListeningQueue(player),
      null, player.repeat, player.shuffle,
    );
    await get().refresh();
  },
  startWithPlaylist: async (playlist, options) => {
    const previous = get().room;
    if (previous) {
      if (previous.host_id === currentListeningUserId()) {
        await get().setPlaylist(playlist, options);
        return;
      }
      await get().leave();
    }
    const repeatMode = options?.repeatMode ?? "off";
    const shuffle = options?.shuffle ?? false;
    await playPlaylist(playlist, `listening:${playlist.id}`, repeatMode, shuffle);
    const player = usePlayerStore.getState();
    await listeningClient.createRoom(
      player.currentTrack?.id ?? null, player.currentTrack?.title ?? null,
      player.positionMs, player.status === "playing" || player.status === "loading",
      upcomingListeningQueue(player), playlist, repeatMode, shuffle,
    );
    await get().refresh();
  },
  setPlaylist: async (playlist, options) => {
    const room = get().room;
    if (!room) throw new Error("Starte zuerst eine Hörsession.");
    if (room.host_id !== currentListeningUserId()) throw new Error("Nur der Host kann die Playlist wechseln.");
    const repeatMode = options?.repeatMode ?? room.repeat_mode;
    const shuffle = options?.shuffle ?? room.shuffle;
    await listeningClient.setPlaylist(room.id, playlist);
    await listeningClient.setPlaybackSettings(room.id, { repeat_mode: repeatMode, shuffle });
    await playPlaylist(playlist, `listening:${room.id}`, repeatMode, shuffle);
    await get().refresh();
  },
  setPlaybackSettings: async (settings) => {
    const room = get().room;
    if (!room || room.host_id !== currentListeningUserId()) return;
    if (settings.repeatMode) playerEngine.setRepeat(settings.repeatMode);
    if (settings.shuffle !== undefined) playerEngine.setShuffle(settings.shuffle);
    await listeningClient.setPlaybackSettings(room.id, {
      ...(settings.repeatMode ? { repeat_mode: settings.repeatMode } : {}),
      ...(settings.shuffle !== undefined ? { shuffle: settings.shuffle } : {}),
    });
    await get().refresh();
  },
  invite: async (friendId) => {
    const room = get().room;
    if (!room) throw new Error("Starte zuerst eine Hörsession.");
    await listeningClient.invite(room.id, friendId);
    await get().refresh();
  },
  join: async (roomId) => {
    const previous = get().room;
    if (previous && previous.id !== roomId) await get().leave();
    await listeningClient.accept(roomId);
    // Guests follow the host's track changes, so local repeat/shuffle must not
    // keep an ended track looping on their own device.
    playerEngine.setRepeat("off");
    playerEngine.setShuffle(false);
    await get().refresh();
  },
  decline: async (roomId) => {
    await listeningClient.leave(roomId);
    await get().refresh();
  },
  leave: async () => {
    const room = get().room;
    if (!room) return;
    if (room.host_id === currentListeningUserId()) await listeningClient.end(room.id);
    else await listeningClient.leave(room.id);
    set({ room: null, members: [] });
    await get().refresh();
  },
  clearError: () => set({ error: "" }),
  reset: () => { refreshSequence += 1; set({ room: null, members: [], invitations: [], error: "" }); },
  applyHostPlayback: (playback) => {
    const room = get().room;
    if (!room) return;
    // Only a track change can be reverted by a stale refresh; plain position
    // heartbeats must not invalidate in-flight membership refreshes.
    if (room.track_id !== playback.trackId) hostPlaybackEpoch += 1;
    set({
      room: {
        ...room,
        track_id: playback.trackId,
        track_title: playback.trackTitle,
        position_ms: Math.max(0, Math.round(playback.positionMs)),
        is_playing: playback.isPlaying,
        queue_snapshot: playback.queue,
      },
    });
  },
}));

/**
 * Snapshot of the host playback that guests extrapolate from. `serverAt` is the
 * host's row timestamp in server time; the guest's clock offset is applied when
 * the expected position is computed so skewed device clocks do not matter.
 */
export interface ListeningPlaybackAnchor {
  trackId: string | null;
  positionMs: number;
  isPlaying: boolean;
  serverAt: number;
  signature: string;
}

function playbackSignature(room: ListeningRoom): string {
  return `${room.track_id ?? ""}|${room.is_playing ? 1 : 0}|${room.position_ms}`;
}

export function advanceListeningAnchor(
  anchor: ListeningPlaybackAnchor | null,
  room: ListeningRoom,
): ListeningPlaybackAnchor {
  const signature = playbackSignature(room);
  if (anchor?.signature === signature) return anchor;
  return {
    trackId: room.track_id,
    positionMs: Math.max(0, room.position_ms),
    isPlaying: room.is_playing,
    serverAt: Date.parse(room.updated_at),
    signature,
  };
}

/**
 * Estimates how far the server clock is ahead of this device (server - local).
 * Realtime delivery is faster than polling, so the largest sample carries the
 * least latency and is the closest estimate.
 */
export function estimateListeningClockSkew(
  room: ListeningRoom,
  receivedAt: number,
  previous: number | null,
): number {
  const serverAt = Date.parse(room.updated_at);
  if (!Number.isFinite(serverAt)) return previous ?? 0;
  const sample = serverAt - receivedAt;
  return previous === null ? sample : Math.max(previous, sample);
}

export function expectedAnchorPosition(
  anchor: ListeningPlaybackAnchor | null,
  clockSkewMs: number,
  now = Date.now(),
): number {
  if (!anchor) return 0;
  const elapsed = anchor.isPlaying && Number.isFinite(anchor.serverAt)
    ? Math.max(0, now - (anchor.serverAt - clockSkewMs))
    : 0;
  return Math.max(0, Math.round(anchor.positionMs + elapsed));
}

export function isListeningAnchorFresh(
  anchor: ListeningPlaybackAnchor | null,
  clockSkewMs: number,
  now = Date.now(),
  maxAgeMs = 12_000,
): boolean {
  if (!anchor) return false;
  if (!anchor.isPlaying) return true;
  if (!Number.isFinite(anchor.serverAt)) return false;
  return now - (anchor.serverAt - clockSkewMs) <= maxAgeMs;
}
