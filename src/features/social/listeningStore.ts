import { create } from "zustand";
import { getAuthSession } from "@/shared/api";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { listeningClient, type ListeningInvitation, type ListeningMember, type ListeningRoom } from "./listeningClient";

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
  invite: (friendId: string) => Promise<void>;
  join: (roomId: string) => Promise<void>;
  decline: (roomId: string) => Promise<void>;
  leave: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

let refreshSequence = 0;

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
    try {
      const snapshot = await listeningClient.snapshot();
      if (sequence === refreshSequence) set({ ...snapshot, error: "" });
    } catch (cause) {
      if (sequence === refreshSequence) set({ error: listeningError(cause) });
    }
  },
  start: async () => {
    const previous = get().room;
    if (previous) {
      if (previous.host_id === getAuthSession()?.user?.id) return;
      await get().leave();
    }
    const player = usePlayerStore.getState();
    await listeningClient.createRoom(
      player.currentTrack?.id ?? null, player.currentTrack?.title ?? null,
      player.positionMs, player.status === "playing" || player.status === "loading", upcomingListeningQueue(player),
    );
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
    await get().refresh();
  },
  decline: async (roomId) => {
    await listeningClient.leave(roomId);
    await get().refresh();
  },
  leave: async () => {
    const room = get().room;
    if (!room) return;
    if (room.host_id === getAuthSession()?.user?.id) await listeningClient.end(room.id);
    else await listeningClient.leave(room.id);
    set({ room: null, members: [] });
    await get().refresh();
  },
  clearError: () => set({ error: "" }),
  reset: () => { refreshSequence += 1; set({ room: null, members: [], invitations: [], error: "" }); },
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
