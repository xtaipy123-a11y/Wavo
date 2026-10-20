import { getAuthSession } from "@/shared/api";
import { getSupabaseClient } from "@/shared/supabase/client";

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

function myId(): string {
  const id = getAuthSession()?.user?.id;
  if (!id) throw new Error("Bitte melde dich erneut an.");
  return id;
}

function validId(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Ungültige ID.");
  }
  return id;
}

const roomColumns = "id,host_id,active,track_id,track_title,position_ms,is_playing,allow_guest_add,allow_guest_skip,allow_guest_reorder,queue_snapshot,created_at,updated_at";
const memberColumns = "room_id,user_id,invited_by,status,created_at,joined_at,can_add,can_skip,can_reorder";

export const listeningClient = {
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

  async createRoom(trackId: string | null, trackTitle: string | null, positionMs: number, isPlaying: boolean, queue: ListeningQueueItem[]): Promise<ListeningRoom> {
    const { data, error } = await getSupabaseClient().from("wavo_listening_rooms")
      .insert({ host_id: myId(), track_id: trackId, track_title: trackTitle,
        position_ms: Math.max(0, Math.round(positionMs)), is_playing: isPlaying, queue_snapshot: queue })
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
