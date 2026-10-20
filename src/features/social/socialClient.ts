import { getAuthSession } from "@/shared/api";
import { getSupabaseClient } from "@/shared/supabase/client";
import type { ApiTrack } from "@/shared/api";

export interface SocialProfile {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted";
  created_at: string;
}

export interface SharedPlaylist {
  title: string;
  description?: string;
  tracks: ApiTrack[];
  source?: { type: "album" | "playlist"; id: string };
}

export interface SocialMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  playlist_snapshot: SharedPlaylist | null;
  created_at: string;
}

function myId(): string {
  const id = getAuthSession()?.user?.id;
  if (!id) throw new Error("Bitte melde dich erneut an.");
  return id;
}

function assertUuid(id: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Ungültige Nutzer-ID.");
  }
}

export function parseSharedPlaylist(value: unknown): SharedPlaylist | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (typeof source.title !== "string" || source.title.length > 200 || !source.title.trim() ||
      !Array.isArray(source.tracks) || source.tracks.length > 1000) return null;
  const tracks: ApiTrack[] = [];
  for (const raw of source.tracks) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const track = raw as Record<string, unknown>;
    if (typeof track.id !== "string" || !track.id || track.id.length > 500 ||
        typeof track.title !== "string" || !track.title || track.title.length > 500 ||
        !Array.isArray(track.artists) || track.artists.length > 30) return null;
    const artists: { id: string; name: string }[] = [];
    for (const rawArtist of track.artists) {
      if (!rawArtist || typeof rawArtist !== "object" || Array.isArray(rawArtist)) return null;
      const artist = rawArtist as Record<string, unknown>;
      if (typeof artist.id !== "string" || typeof artist.name !== "string" || artist.id.length > 500 || artist.name.length > 200) return null;
      artists.push({ id: artist.id, name: artist.name });
    }
    tracks.push({
      id: track.id,
      title: track.title,
      artists,
      durationMs: typeof track.durationMs === "number" && Number.isFinite(track.durationMs) ? Math.max(0, track.durationMs) : 0,
      ...(typeof track.explicit === "boolean" ? { explicit: track.explicit } : {}),
      ...(track.cover && typeof track.cover === "object" && !Array.isArray(track.cover) && typeof (track.cover as Record<string, unknown>).url === "string"
        ? { cover: { url: String((track.cover as Record<string, unknown>).url), width: 512, height: 512 } } : {}),
    });
  }
  return {
    title: source.title.trim(),
    ...(typeof source.description === "string" ? { description: source.description.slice(0, 2000) } : {}),
    ...(source.source && typeof source.source === "object" && !Array.isArray(source.source) &&
      ((source.source as Record<string, unknown>).type === "album" || (source.source as Record<string, unknown>).type === "playlist") &&
      typeof (source.source as Record<string, unknown>).id === "string" &&
      String((source.source as Record<string, unknown>).id).trim().length > 0 &&
      String((source.source as Record<string, unknown>).id).length <= 500
      ? { source: { type: (source.source as { type: "album" | "playlist" }).type, id: (source.source as { id: string }).id } } : {}),
    tracks,
  };
}

export const socialClient = {
  async searchProfiles(query: string): Promise<SocialProfile[]> {
    const term = query.trim().toLowerCase();
    if (!/^[a-z0-9_]{2,40}$/.test(term)) return [];
    const { data, error } = await getSupabaseClient()
      .from("wavo_profiles")
      .select("user_id,username,display_name,avatar_url")
      .ilike("username", `${term}%`)
      .neq("user_id", myId())
      .limit(20);
    if (error) throw error;
    return (data ?? []) as SocialProfile[];
  },

  async listFriendships(): Promise<Friendship[]> {
    const id = myId();
    const { data, error } = await getSupabaseClient()
      .from("wavo_friendships")
      .select("id,requester_id,addressee_id,status,created_at")
      .or(`requester_id.eq.${id},addressee_id.eq.${id}`)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Friendship[];
  },

  async profiles(ids: string[]): Promise<SocialProfile[]> {
    if (!ids.length) return [];
    ids.forEach(assertUuid);
    const { data, error } = await getSupabaseClient()
      .from("wavo_profiles")
      .select("user_id,username,display_name,avatar_url")
      .in("user_id", ids);
    if (error) throw error;
    return (data ?? []) as SocialProfile[];
  },

  async requestFriend(userId: string): Promise<void> {
    assertUuid(userId);
    const { error } = await getSupabaseClient().from("wavo_friendships").insert({ requester_id: myId(), addressee_id: userId });
    if (error) throw error;
  },

  async acceptFriend(friendshipId: string): Promise<void> {
    assertUuid(friendshipId);
    const { error } = await getSupabaseClient().from("wavo_friendships").update({ status: "accepted" }).eq("id", friendshipId);
    if (error) throw error;
  },

  async removeFriend(friendshipId: string): Promise<void> {
    assertUuid(friendshipId);
    const { error } = await getSupabaseClient().from("wavo_friendships").delete().eq("id", friendshipId);
    if (error) throw error;
  },

  async messages(friendId: string): Promise<SocialMessage[]> {
    assertUuid(friendId);
    const id = myId();
    const { data, error } = await getSupabaseClient()
      .from("wavo_messages")
      .select("id,sender_id,recipient_id,body,playlist_snapshot,created_at")
      .or(`and(sender_id.eq.${id},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${id})`)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return ((data ?? []) as SocialMessage[]).reverse();
  },

  async sendMessage(friendId: string, body: string, playlist?: SharedPlaylist): Promise<void> {
    assertUuid(friendId);
    const text = body.trim();
    if (text.length > 4000 || (!text && !playlist)) throw new Error("Nachricht leer oder zu lang.");
    const snapshot = playlist ? parseSharedPlaylist(playlist) : null;
    if (playlist && !snapshot) throw new Error("Die Playlist kann nicht geteilt werden.");
    const { error } = await getSupabaseClient().from("wavo_messages").insert({
      sender_id: myId(), recipient_id: friendId, body: text, playlist_snapshot: snapshot,
    });
    if (error) throw error;
  },
};
