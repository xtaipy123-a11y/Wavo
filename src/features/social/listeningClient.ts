import { getAuthSession } from "@/shared/api";
import { getLocalUserId, isDevGuestMode } from "@/shared/api/devIdentity";
import { getSupabaseClient } from "@/shared/supabase/client";
import { createDevListeningClient } from "./listeningDevClient";

export type ListeningRepeatMode = "off" | "all" | "one";

export interface ListeningPlaylistTrack {
  id: string;
  title: string;
  artists: string;
  coverUrl: string;
  durationMs: number;
}

export interface ListeningPlaylistSnapshot {
  id: string;
  title: string;
  coverUrl: string;
  trackCount: number;
  durationMs: number;
  tracks: ListeningPlaylistTrack[];
}

export interface ListeningRoom {
  id: string;
  host_id: string;
  active: boolean;
  track_id: string | null;
  track_title: string | null;
  position_ms: number;
  is_playing: boolean;
  allow_guest_add: boolean;
  allow_guest_skip: boolean;
  allow_guest_reorder: boolean;
  queue_snapshot: ListeningQueueItem[];
  playlist_id: string | null;
  playlist_title: string | null;
  playlist_cover_url: string | null;
  playlist_track_count: number;
  playlist_duration_ms: number;
  playlist_tracks: ListeningPlaylistTrack[];
  repeat_mode: ListeningRepeatMode;
  shuffle: boolean;
  created_at: string;
  updated_at: string;
}

export interface ListeningQueueItem { index: number; id: string; title: string; artists: string }
export interface ListeningCommand {
  id: string;
  room_id: string;
  actor_id: string;
  kind: "add" | "skip" | "move";
  track_id: string | null;
  from_index: number | null;
  to_index: number | null;
}

export interface ListeningMember {
  room_id: string;
  user_id: string;
  invited_by: string;
  status: "invited" | "active";
  created_at: string;
  joined_at: string | null;
  can_add: boolean | null;
  can_skip: boolean | null;
  can_reorder: boolean | null;
}

export interface ListeningInvitation {
  room: ListeningRoom;
  member: ListeningMember;
}
export interface ListeningVote { room_id: string; track_id: string; voter_id: string }

function myId(): string {
  const id = getAuthSession()?.user?.id;
  if (!id) throw new Error("Bitte melde dich erneut an.");
  return id;
}

/**
 * User id that owns the local listening session. In dev guest mode this is the
 * stable dev identity so the feature works without a Supabase session.
 */
export function currentListeningUserId(): string | null {
  return getLocalUserId(getAuthSession()?.user?.id);
}

function validId(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Ungültige ID.");
  }
  return id;
}

const roomColumns = "id,host_id,active,track_id,track_title,position_ms,is_playing,allow_guest_add,allow_guest_skip,allow_guest_reorder,queue_snapshot,playlist_id,playlist_title,playlist_cover_url,playlist_track_count,playlist_duration_ms,playlist_tracks,repeat_mode,shuffle,created_at,updated_at";
const memberColumns = "room_id,user_id,invited_by,status,created_at,joined_at,can_add,can_skip,can_reorder";

function playlistColumns(playlist: ListeningPlaylistSnapshot | null) {
  return playlist ? {
    playlist_id: playlist.id,
    playlist_title: playlist.title.slice(0, 500),
    playlist_cover_url: playlist.coverUrl ? playlist.coverUrl.slice(0, 2000) : null,
    playlist_track_count: playlist.trackCount,
    playlist_duration_ms: playlist.durationMs,
    playlist_tracks: playlist.tracks,
  } : {};
}

const supabaseListeningClient = {
  async votes(roomId: string): Promise<ListeningVote[]> {
    const { data, error } = await getSupabaseClient().from("wavo_listening_votes")
      .select("room_id,track_id,voter_id").eq("room_id", validId(roomId)).limit(1000);
    if (error) throw error;
    return (data ?? []) as ListeningVote[];
  },

  async toggleVote(roomId: string, trackId: string, hasVoted: boolean): Promise<void> {
    const client = getSupabaseClient();
    const query = hasVoted
      ? client.from("wavo_listening_votes").delete().eq("room_id", validId(roomId)).eq("track_id", trackId).eq("voter_id", myId())
      : client.from("wavo_listening_votes").insert({ room_id: validId(roomId), track_id: trackId, voter_id: myId() });
    const { error } = await query;
    if (error) throw error;
  },
  async snapshot(): Promise<{ room: ListeningRoom | null; members: ListeningMember[]; invitations: ListeningInvitation[] }> {
    const client = getSupabaseClient();
    const id = myId();
    const { data: mine, error } = await client.from("wavo_listening_members")
      .select(memberColumns).eq("user_id", id).order("created_at", { ascending: false });
    if (error) throw error;
    const ownRows = (mine ?? []) as ListeningMember[];
    if (!ownRows.length) return { room: null, members: [], invitations: [] };
    const { data: rooms, error: roomError } = await client.from("wavo_listening_rooms")
      .select(roomColumns).in("id", ownRows.map((row) => row.room_id)).eq("active", true)
      .order("created_at", { ascending: false });
    if (roomError) throw roomError;
    const activeRooms = (rooms ?? []) as ListeningRoom[];
    const room = activeRooms.find((entry) => ownRows.some((row) => row.room_id === entry.id && row.status === "active")) ?? null;
    const invitations = ownRows.filter((row) => row.status === "invited")
      .map((member) => ({ member, room: activeRooms.find((entry) => entry.id === member.room_id) }))
      .filter((entry): entry is ListeningInvitation => Boolean(entry.room));
    if (!room) return { room: null, members: [], invitations };
    const { data: roomMembers, error: memberError } = await client.from("wavo_listening_members")
      .select(memberColumns).eq("room_id", room.id).order("created_at", { ascending: true });
    if (memberError) throw memberError;
    return { room, members: (roomMembers ?? []) as ListeningMember[], invitations };
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
    const { data, error } = await getSupabaseClient().from("wavo_listening_rooms")
      .insert({ host_id: myId(), track_id: trackId, track_title: trackTitle,
        position_ms: Math.max(0, Math.round(positionMs)), is_playing: isPlaying, queue_snapshot: queue,
        ...playlistColumns(playlist), repeat_mode: repeatMode, shuffle })
      .select(roomColumns).single();
    if (error) throw error;
    return data as ListeningRoom;
  },

  async invite(roomId: string, friendId: string): Promise<void> {
    const { error } = await getSupabaseClient().from("wavo_listening_members")
      .insert({ room_id: validId(roomId), user_id: validId(friendId), invited_by: myId(), status: "invited" });
    if (error) throw error;
  },

  async accept(roomId: string): Promise<void> {
    const { data, error } = await getSupabaseClient().from("wavo_listening_members")
      .update({ status: "active" }).eq("room_id", validId(roomId)).eq("user_id", myId()).eq("status", "invited")
      .select("room_id");
    if (error) throw error;
    if (!data?.length) throw new Error("Diese Einladung ist nicht mehr gültig.");
  },

  async leave(roomId: string): Promise<void> {
    const { error } = await getSupabaseClient().from("wavo_listening_members")
      .delete().eq("room_id", validId(roomId)).eq("user_id", myId());
    if (error) throw error;
  },

  async end(roomId: string): Promise<void> {
    const { error } = await getSupabaseClient().from("wavo_listening_rooms")
      .update({ active: false, is_playing: false }).eq("id", validId(roomId)).eq("host_id", myId());
    if (error) throw error;
  },

  async publish(roomId: string, trackId: string | null, trackTitle: string | null, positionMs: number, isPlaying: boolean, queue: ListeningQueueItem[]): Promise<void> {
    const { error } = await getSupabaseClient().from("wavo_listening_rooms")
      .update({ track_id: trackId, track_title: trackTitle,
        position_ms: Math.max(0, Math.round(positionMs)), is_playing: isPlaying, queue_snapshot: queue })
      .eq("id", validId(roomId)).eq("host_id", myId()).eq("active", true);
    if (error) throw error;
  },

  async setPermissions(roomId: string, permissions: Pick<ListeningRoom, "allow_guest_add" | "allow_guest_skip" | "allow_guest_reorder">): Promise<void> {
    const { error } = await getSupabaseClient().from("wavo_listening_rooms")
      .update(permissions).eq("id", validId(roomId)).eq("host_id", myId()).eq("active", true);
    if (error) throw error;
  },

  async setPlaylist(roomId: string, playlist: ListeningPlaylistSnapshot): Promise<void> {
    const { error } = await getSupabaseClient().from("wavo_listening_rooms")
      .update(playlistColumns(playlist)).eq("id", validId(roomId)).eq("host_id", myId()).eq("active", true);
    if (error) throw error;
  },

  async setPlaybackSettings(roomId: string, settings: { repeat_mode?: ListeningRepeatMode; shuffle?: boolean }): Promise<void> {
    const { error } = await getSupabaseClient().from("wavo_listening_rooms")
      .update(settings).eq("id", validId(roomId)).eq("host_id", myId()).eq("active", true);
    if (error) throw error;
  },

  async setMemberPermission(roomId: string, userId: string, key: "can_add" | "can_skip" | "can_reorder", value: boolean | null): Promise<void> {
    const { error } = await getSupabaseClient().from("wavo_listening_members")
      .update({ [key]: value }).eq("room_id", validId(roomId)).eq("user_id", validId(userId)).eq("status", "active");
    if (error) throw error;
  },

  async request(roomId: string, kind: ListeningCommand["kind"], options: { trackId?: string; fromIndex?: number; toIndex?: number } = {}): Promise<void> {
    const { error } = await getSupabaseClient().from("wavo_listening_commands").insert({
      room_id: validId(roomId), actor_id: myId(), kind,
      track_id: options.trackId ?? null, from_index: options.fromIndex ?? null, to_index: options.toIndex ?? null,
    });
    if (error) throw error;
  },

  async pendingCommands(roomId: string): Promise<ListeningCommand[]> {
    const { data, error } = await getSupabaseClient().from("wavo_listening_commands")
      .select("id,room_id,actor_id,kind,track_id,from_index,to_index")
      .eq("room_id", validId(roomId)).is("processed_at", null)
      .order("created_at", { ascending: true }).limit(30);
    if (error) throw error;
    return (data ?? []) as ListeningCommand[];
  },

  async claimCommand(commandId: string): Promise<boolean> {
    const { data, error } = await getSupabaseClient().from("wavo_listening_commands")
      .update({ processed_at: new Date().toISOString() }).eq("id", validId(commandId))
      .is("processed_at", null).select("id");
    if (error) throw error;
    return Boolean(data?.length);
  },
};

export type ListeningClientApi = typeof supabaseListeningClient;

const devListeningClient = createDevListeningClient();

/** Dev guest mode without a session cannot reach the RLS protected tables. */
function useDevListening(): boolean {
  return isDevGuestMode() && !getAuthSession()?.user?.id;
}

export const listeningClient: ListeningClientApi = {
  votes: (roomId) => (useDevListening() ? devListeningClient.votes(roomId) : supabaseListeningClient.votes(roomId)),
  toggleVote: (roomId, trackId, hasVoted) => (useDevListening()
    ? devListeningClient.toggleVote(roomId, trackId, hasVoted)
    : supabaseListeningClient.toggleVote(roomId, trackId, hasVoted)),
  snapshot: () => (useDevListening() ? devListeningClient.snapshot() : supabaseListeningClient.snapshot()),
  createRoom: (...args) => (useDevListening()
    ? devListeningClient.createRoom(...args)
    : supabaseListeningClient.createRoom(...args)),
  invite: (roomId, friendId) => (useDevListening()
    ? devListeningClient.invite(roomId, friendId)
    : supabaseListeningClient.invite(roomId, friendId)),
  accept: (roomId) => (useDevListening() ? devListeningClient.accept(roomId) : supabaseListeningClient.accept(roomId)),
  leave: (roomId) => (useDevListening() ? devListeningClient.leave(roomId) : supabaseListeningClient.leave(roomId)),
  end: (roomId) => (useDevListening() ? devListeningClient.end(roomId) : supabaseListeningClient.end(roomId)),
  publish: (...args) => (useDevListening()
    ? devListeningClient.publish(...args)
    : supabaseListeningClient.publish(...args)),
  setPermissions: (roomId, permissions) => (useDevListening()
    ? devListeningClient.setPermissions(roomId, permissions)
    : supabaseListeningClient.setPermissions(roomId, permissions)),
  setPlaylist: (roomId, playlist) => (useDevListening()
    ? devListeningClient.setPlaylist(roomId, playlist)
    : supabaseListeningClient.setPlaylist(roomId, playlist)),
  setPlaybackSettings: (roomId, settings) => (useDevListening()
    ? devListeningClient.setPlaybackSettings(roomId, settings)
    : supabaseListeningClient.setPlaybackSettings(roomId, settings)),
  setMemberPermission: (roomId, userId, key, value) => (useDevListening()
    ? devListeningClient.setMemberPermission(roomId, userId, key, value)
    : supabaseListeningClient.setMemberPermission(roomId, userId, key, value)),
  request: (roomId, kind, options) => (useDevListening()
    ? devListeningClient.request(roomId, kind, options)
    : supabaseListeningClient.request(roomId, kind, options)),
  pendingCommands: (roomId) => (useDevListening()
    ? devListeningClient.pendingCommands(roomId)
    : supabaseListeningClient.pendingCommands(roomId)),
  claimCommand: (commandId) => (useDevListening()
    ? devListeningClient.claimCommand(commandId)
    : supabaseListeningClient.claimCommand(commandId)),
};
