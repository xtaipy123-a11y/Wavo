import { getAuthSession } from "@/shared/api";
import { getSupabaseClient } from "@/shared/supabase/client";
import { usePlayerStore } from "@/features/player/store/playerStore";

export type FriendActivity = { user_id: string; visibility: "friends" | "nobody";
  track_id: string | null; track_title: string | null; artist_name: string | null; updated_at: string };

function visibilityKey(userId: string) { return `wavo_friend_visibility_${userId}`; }
export function getFriendVisibility(userId: string): "friends" | "nobody" {
  return localStorage.getItem(visibilityKey(userId)) === "friends" ? "friends" : "nobody";
}

export function setFriendVisibility(userId: string, visibility: "friends" | "nobody") {
  localStorage.setItem(visibilityKey(userId), visibility);
  window.dispatchEvent(new Event("wavo:privacy-changed"));
  window.dispatchEvent(new CustomEvent("wavo:cloud-change", { detail: {
    kind: "privacy", id: "friend_activity", payload: { visibility }, deleted: false,
  } }));
}

export async function publishFriendActivity(userId: string) {
  if (!navigator.onLine || getAuthSession()?.user?.id !== userId) return;
  const player = usePlayerStore.getState();
  const visibility = getFriendVisibility(userId);
  const track = visibility === "friends" && player.status === "playing" &&
    !player.currentTrack?.id.startsWith("upload:") ? player.currentTrack : null;
  const { error } = await getSupabaseClient().from("wavo_friend_activity").upsert({
    user_id: userId, visibility,
    track_id: track?.id ?? null, track_title: track?.title?.slice(0, 500) ?? null,
    artist_name: track?.artists?.slice(0, 500) ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function listFriendActivity(friendIds: string[]): Promise<FriendActivity[]> {
  if (!friendIds.length) return [];
  const { data, error } = await getSupabaseClient().from("wavo_friend_activity")
    .select("user_id,visibility,track_id,track_title,artist_name,updated_at")
    .in("user_id", friendIds.slice(0, 100));
  if (error) throw error;
  return (data ?? []) as FriendActivity[];
}
