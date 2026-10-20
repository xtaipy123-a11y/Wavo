import { getAuthSession } from "@/shared/api";
import { getSupabaseClient } from "@/shared/supabase/client";
import { wavoDb } from "@/shared/storage/wavoDb";
import type { Track } from "@/shared/contracts";

export type SharedPlaylistRow = { id: string; owner_id: string; source_playlist_id: string;
  title: string; description: string; created_at: string; updated_at: string };
export type Collaborator = { playlist_id: string; user_id: string; invited_by: string;
  role: "editor" | "viewer"; status: "invited" | "active"; joined_at: string | null };
export type SharedTrack = { playlist_id: string; item_id: string; track_id: string;
  track_snapshot: Track; position: number; added_by: string };

function myId(): string {
  const id = getAuthSession()?.user?.id;
  if (!id) throw new Error("Sign in required.");
  return id;
}

function uuid(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error("Invalid ID.");
  return id;
}

export const collaborativePlaylists = {
  async list(): Promise<{ playlists: SharedPlaylistRow[]; members: Collaborator[] }> {
    const client = getSupabaseClient();
    const { data: playlists, error } = await client.from("wavo_shared_playlists")
      .select("id,owner_id,source_playlist_id,title,description,created_at,updated_at")
      .order("updated_at", { ascending: false }).limit(100);
    if (error) throw error;
    const ids = (playlists ?? []).map((row) => row.id);
    if (!ids.length) return { playlists: [], members: [] };
    const { data: members, error: memberError } = await client.from("wavo_playlist_collaborators")
      .select("playlist_id,user_id,invited_by,role,status,joined_at").in("playlist_id", ids).limit(500);
    if (memberError) throw memberError;
    return { playlists: playlists as SharedPlaylistRow[], members: (members ?? []) as Collaborator[] };
  },

  async createFromLocal(localPlaylistId: string): Promise<SharedPlaylistRow> {
    const owner = myId();
    const record = await wavoDb.getUserPlaylistRecord(owner, localPlaylistId);
    if (!record) throw new Error("Playlist not found on this device.");
    const client = getSupabaseClient();
    const { data: existing, error: readError } = await client.from("wavo_shared_playlists")
      .select("id,owner_id,source_playlist_id,title,description,created_at,updated_at")
      .eq("owner_id", owner).eq("source_playlist_id", localPlaylistId).maybeSingle();
    if (readError) throw readError;
    let playlist = existing as SharedPlaylistRow | null;
    if (!playlist) {
      const { data, error } = await client.from("wavo_shared_playlists").insert({
      owner_id: owner, source_playlist_id: localPlaylistId, title: record.playlist.title,
      description: record.playlist.description ?? "",
      }).select("id,owner_id,source_playlist_id,title,description,created_at,updated_at").single();
      if (error) throw error;
      playlist = data as SharedPlaylistRow;
    }
    for (let offset = 0; offset < record.items.length; offset += 100) {
      const batch = record.items.slice(offset, offset + 100).map((item) => ({
        playlist_id: playlist.id, track_id: item.track.id, track_snapshot: item.track,
        position: item.position, added_by: owner,
      }));
      const { error: itemsError } = await client.from("wavo_shared_playlist_items")
        .upsert(batch, { onConflict: "playlist_id,track_id", ignoreDuplicates: true });
      if (itemsError) throw itemsError;
    }
    return playlist;
  },

  async invite(playlistId: string, friendId: string, role: "editor" | "viewer") {
    const { error } = await getSupabaseClient().from("wavo_playlist_collaborators").insert({
      playlist_id: uuid(playlistId), user_id: uuid(friendId), invited_by: myId(), role, status: "invited",
    });
    if (error) throw error;
  },

  async accept(playlistId: string) {
    const { data, error } = await getSupabaseClient().from("wavo_playlist_collaborators")
      .update({ status: "active", joined_at: new Date().toISOString() })
      .eq("playlist_id", uuid(playlistId)).eq("user_id", myId()).eq("status", "invited").select("user_id");
    if (error) throw error;
    if (!data?.length) throw new Error("Invitation expired.");
  },

  async leave(playlistId: string) {
    const { error } = await getSupabaseClient().from("wavo_playlist_collaborators")
      .delete().eq("playlist_id", uuid(playlistId)).eq("user_id", myId());
    if (error) throw error;
  },

  async stopSharing(playlistId: string) {
    const { error } = await getSupabaseClient().from("wavo_shared_playlists")
      .delete().eq("id", uuid(playlistId)).eq("owner_id", myId());
    if (error) throw error;
  },

  async items(playlistId: string): Promise<SharedTrack[]> {
    const client = getSupabaseClient();
    const items: SharedTrack[] = [];
    for (let offset = 0; ; offset += 200) {
      const { data, error } = await client.from("wavo_shared_playlist_items")
        .select("playlist_id,item_id,track_id,track_snapshot,position,added_by")
        .eq("playlist_id", uuid(playlistId)).order("position", { ascending: true }).range(offset, offset + 199);
      if (error) throw error;
      items.push(...(data ?? []) as SharedTrack[]);
      if ((data ?? []).length < 200) break;
    }
    return items;
  },

  async addTrack(playlistId: string, track: Track) {
    const current = await this.items(playlistId);
    if (current.some((item) => item.track_id === track.id)) return;
    const { error } = await getSupabaseClient().from("wavo_shared_playlist_items").insert({
      playlist_id: uuid(playlistId), track_id: track.id, track_snapshot: track,
      position: current.length ? Math.max(...current.map((item) => Number(item.position))) + 1 : 0,
      added_by: myId(),
    });
    if (error) throw error;
  },

  async removeTrack(playlistId: string, itemId: string) {
    const { error } = await getSupabaseClient().from("wavo_shared_playlist_items")
      .delete().eq("playlist_id", uuid(playlistId)).eq("item_id", uuid(itemId));
    if (error) throw error;
  },

  async moveTrack(playlistId: string, itemId: string, beforeId: string | null) {
    const items = await this.items(playlistId);
    const without = items.filter((item) => item.item_id !== itemId);
    const index = beforeId ? without.findIndex((item) => item.item_id === beforeId) : without.length;
    if (index < 0) throw new Error("Position not found.");
    const before = index === 0 ? Number(without[0]?.position ?? 1) - 1 : Number(without[index - 1].position);
    const after = index === without.length ? before + 2 : Number(without[index].position);
    const position = (before + after) / 2;
    const { error } = await getSupabaseClient().from("wavo_shared_playlist_items")
      .update({ position, updated_at: new Date().toISOString() })
      .eq("playlist_id", uuid(playlistId)).eq("item_id", uuid(itemId));
    if (error) throw error;
  },
};
