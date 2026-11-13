import { getDevGuestId } from "@/shared/api/devIdentity";
import type {
  ListeningCommand,
  ListeningMember,
  ListeningPlaylistSnapshot,
  ListeningQueueItem,
  ListeningRepeatMode,
  ListeningRoom,
  ListeningVote,
} from "./listeningClient";

/**
 * Local stand-in for the Supabase listening backend.
 *
 * Dev mode skips the login and therefore has no `auth.uid()`, so every RLS
 * protected table would reject the session. This backend keeps the same shape
 * in localStorage, which lets the whole listen-together flow (start a session,
 * pick a playlist, queue controls, votes) be tested without a Supabase account.
 */
const STORAGE_KEY = "wavo:dev-listening:v1";
const MAX_ROOMS = 20;
const MAX_COMMANDS = 200;

interface DevListeningState {
  rooms: ListeningRoom[];
  members: ListeningMember[];
  commands: ListeningCommand[];
  votes: ListeningVote[];
}

function emptyState(): DevListeningState {
  return { rooms: [], members: [], commands: [], votes: [] };
}

function userId(): string {
  const id = getDevGuestId();
  if (!id) throw new Error("Bitte melde dich erneut an.");
  return id;
}

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function now(): string {
  return new Date().toISOString();
}

function read(): DevListeningState {
  if (typeof localStorage === "undefined") return emptyState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<DevListeningState>;
    return {
      rooms: Array.isArray(parsed.rooms) ? parsed.rooms : [],
      members: Array.isArray(parsed.members) ? parsed.members : [],
      commands: Array.isArray(parsed.commands) ? parsed.commands : [],
      votes: Array.isArray(parsed.votes) ? parsed.votes : [],
    };
  } catch {
    return emptyState();
  }
}

function write(state: DevListeningState): void {
  const trimmed: DevListeningState = {
    rooms: state.rooms.slice(0, MAX_ROOMS),
    members: state.members.filter((member) => state.rooms.some((room) => room.id === member.room_id)),
    commands: state.commands.slice(-MAX_COMMANDS),
    votes: state.votes.filter((vote) => state.rooms.some((room) => room.id === vote.room_id)),
  };
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // Storage can be unavailable (private mode); the in-memory caller still works.
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("wavo:dev-listening"));
  }
}

function findRoom(state: DevListeningState, roomId: string): ListeningRoom {
  const room = state.rooms.find((entry) => entry.id === roomId);
  if (!room) throw new Error("Die Hörsession wurde nicht gefunden.");
  return room;
}

function updateRoom(state: DevListeningState, roomId: string, patch: Partial<ListeningRoom>): void {
  const index = state.rooms.findIndex((entry) => entry.id === roomId);
  if (index < 0) throw new Error("Die Hörsession wurde nicht gefunden.");
  state.rooms[index] = { ...state.rooms[index], ...patch, updated_at: now() };
}

function playlistColumns(playlist: ListeningPlaylistSnapshot | null): Partial<ListeningRoom> {
  return playlist ? {
    playlist_id: playlist.id,
    playlist_title: playlist.title,
    playlist_cover_url: playlist.coverUrl || null,
    playlist_track_count: playlist.trackCount,
    playlist_duration_ms: playlist.durationMs,
    playlist_tracks: playlist.tracks,
  } : {};
}

export function createDevListeningClient() {
  return {
    async votes(roomId: string): Promise<ListeningVote[]> {
      return read().votes.filter((vote) => vote.room_id === roomId);
    },

    async toggleVote(roomId: string, trackId: string, hasVoted: boolean): Promise<void> {
      const state = read();
      const me = userId();
      state.votes = hasVoted
        ? state.votes.filter((vote) => !(vote.room_id === roomId && vote.track_id === trackId && vote.voter_id === me))
        : [...state.votes.filter((vote) => !(vote.room_id === roomId && vote.track_id === trackId && vote.voter_id === me)),
          { room_id: roomId, track_id: trackId, voter_id: me }];
      write(state);
    },

    async snapshot() {
      const state = read();
      const me = userId();
      const ownRows = state.members.filter((member) => member.user_id === me);
      if (!ownRows.length) return { room: null, members: [], invitations: [] };
      const activeRooms = state.rooms.filter((room) => room.active && ownRows.some((row) => row.room_id === room.id));
      const room = activeRooms.find((entry) => ownRows.some((row) => row.room_id === entry.id && row.status === "active")) ?? null;
      const invitations = ownRows
        .filter((row) => row.status === "invited")
        .map((member) => ({ member, room: activeRooms.find((entry) => entry.id === member.room_id) }))
        .filter((entry): entry is { member: ListeningMember; room: ListeningRoom } => Boolean(entry.room));
      if (!room) return { room: null, members: [], invitations };
      return {
        room,
        members: state.members.filter((member) => member.room_id === room.id),
        invitations,
      };
    },

    async createRoom(
      trackId: string | null,
      trackTitle: string | null,
      positionMs: number,
      isPlaying: boolean,
      queue: ListeningQueueItem[],
      playlist: ListeningPlaylistSnapshot | null = null,
      repeatMode: ListeningRepeatMode = "off",
      shuffle = false,
    ): Promise<ListeningRoom> {
      const state = read();
      const me = userId();
      const timestamp = now();
      // Mirror the unique active room per host constraint from Supabase.
      state.rooms = state.rooms.map((room) => room.host_id === me && room.active
        ? { ...room, active: false, is_playing: false, updated_at: timestamp }
        : room);
      const room: ListeningRoom = {
        id: newId(),
        host_id: me,
        active: true,
        track_id: trackId,
        track_title: trackTitle,
        position_ms: Math.max(0, Math.round(positionMs)),
        is_playing: isPlaying,
        allow_guest_add: true,
        allow_guest_skip: false,
        allow_guest_reorder: false,
        queue_snapshot: queue,
        playlist_id: null,
        playlist_title: null,
        playlist_cover_url: null,
        playlist_track_count: 0,
        playlist_duration_ms: 0,
        playlist_tracks: [],
        repeat_mode: repeatMode,
        shuffle,
        created_at: timestamp,
        updated_at: timestamp,
        ...playlistColumns(playlist),
      };
      state.rooms.unshift(room);
      state.members = state.members.filter((member) => member.room_id !== room.id);
      state.members.push({
        room_id: room.id,
        user_id: me,
        invited_by: me,
        status: "active",
        created_at: timestamp,
        joined_at: timestamp,
        can_add: null,
        can_skip: null,
        can_reorder: null,
      });
      write(state);
      return room;
    },

    async invite(roomId: string, friendId: string): Promise<void> {
      const state = read();
      const me = userId();
      if (state.members.some((member) => member.room_id === roomId && member.user_id === friendId)) return;
      findRoom(state, roomId);
      state.members.push({
        room_id: roomId,
        user_id: friendId,
        invited_by: me,
        status: "invited",
        created_at: now(),
        joined_at: null,
        can_add: null,
        can_skip: null,
        can_reorder: null,
      });
      write(state);
    },

    async accept(roomId: string): Promise<void> {
      const state = read();
      const me = userId();
      const member = state.members.find((entry) => entry.room_id === roomId && entry.user_id === me && entry.status === "invited");
      if (!member) throw new Error("Diese Einladung ist nicht mehr gültig.");
      member.status = "active";
      member.joined_at = now();
      write(state);
    },

    async leave(roomId: string): Promise<void> {
      const state = read();
      const me = userId();
      state.members = state.members.filter((member) => !(member.room_id === roomId && member.user_id === me));
      write(state);
    },

    async end(roomId: string): Promise<void> {
      const state = read();
      const room = findRoom(state, roomId);
      if (room.host_id !== userId()) throw new Error("Nur der Host kann die Hörsession beenden.");
      updateRoom(state, roomId, { active: false, is_playing: false });
      write(state);
    },

    async publish(
      roomId: string,
      trackId: string | null,
      trackTitle: string | null,
      positionMs: number,
      isPlaying: boolean,
      queue: ListeningQueueItem[],
    ): Promise<void> {
      const state = read();
      updateRoom(state, roomId, {
        track_id: trackId,
        track_title: trackTitle,
        position_ms: Math.max(0, Math.round(positionMs)),
        is_playing: isPlaying,
        queue_snapshot: queue,
      });
      write(state);
    },

    async setPermissions(
      roomId: string,
      permissions: Pick<ListeningRoom, "allow_guest_add" | "allow_guest_skip" | "allow_guest_reorder">,
    ): Promise<void> {
      const state = read();
      updateRoom(state, roomId, permissions);
      write(state);
    },

    async setPlaylist(roomId: string, playlist: ListeningPlaylistSnapshot): Promise<void> {
      const state = read();
      updateRoom(state, roomId, playlistColumns(playlist));
      write(state);
    },

    async setPlaybackSettings(roomId: string, settings: { repeat_mode?: ListeningRepeatMode; shuffle?: boolean }): Promise<void> {
      const state = read();
      updateRoom(state, roomId, settings);
      write(state);
    },

    async setMemberPermission(
      roomId: string,
      memberId: string,
      key: "can_add" | "can_skip" | "can_reorder",
      value: boolean | null,
    ): Promise<void> {
      const state = read();
      const member = state.members.find((entry) => entry.room_id === roomId && entry.user_id === memberId);
      if (!member) throw new Error("Mitglied wurde nicht gefunden.");
      member[key] = value;
      write(state);
    },

    async request(
      roomId: string,
      kind: ListeningCommand["kind"],
      options: { trackId?: string; fromIndex?: number; toIndex?: number } = {},
    ): Promise<void> {
      const state = read();
      const room = findRoom(state, roomId);
      if (!room.active) throw new Error("Die Hörsession ist beendet.");
      state.commands.push({
        id: newId(),
        room_id: roomId,
        actor_id: userId(),
        kind,
        track_id: options.trackId ?? null,
        from_index: options.fromIndex ?? null,
        to_index: options.toIndex ?? null,
      });
      write(state);
    },

    async pendingCommands(roomId: string): Promise<ListeningCommand[]> {
      const state = read();
      return state.commands.filter((command) => command.room_id === roomId && !(command as { processed_at?: string }).processed_at);
    },

    async claimCommand(commandId: string): Promise<boolean> {
      const state = read();
      const command = state.commands.find((entry) => entry.id === commandId);
      if (!command || (command as { processed_at?: string }).processed_at) return false;
      (command as { processed_at?: string }).processed_at = now();
      write(state);
      return true;
    },
  };
}
