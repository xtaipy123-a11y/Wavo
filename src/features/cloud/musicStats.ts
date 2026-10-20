import { getAuthSession } from "@/shared/api";
import { getSupabaseClient } from "@/shared/supabase/client";
import { activeCloudSync } from "./cloudSync";
import { localMusic } from "@/shared/api/localMusic";

export type StatsWindow = "day" | "week" | "month" | "year" | "all";
type EventRow = { event_id: string; track_id: string; track_snapshot: Record<string, unknown>;
  context: { type?: unknown; id?: unknown } | null; played_duration_ms: number; listened_at: string };
export type RankedItem = { id: string; name: string; plays: number; minutes: number };
export type MusicStats = { minutes: number; plays: number; topTracks: RankedItem[]; topArtists: RankedItem[];
  topAlbums: RankedItem[]; topGenres: RankedItem[]; topPlaylists: RankedItem[]; byDay: Record<string, number> };

function since(window: StatsWindow): string | null {
  if (window === "all") return null;
  const date = new Date();
  if (window === "day") date.setDate(date.getDate() - 1);
  if (window === "week") date.setDate(date.getDate() - 7);
  if (window === "month") date.setMonth(date.getMonth() - 1);
  if (window === "year") date.setFullYear(date.getFullYear() - 1);
  return date.toISOString();
}

function add(map: Map<string, RankedItem>, id: string, name: string, ms: number) {
  const current = map.get(id) ?? { id, name, plays: 0, minutes: 0 };
  current.plays += 1;
  current.minutes += ms / 60000;
  map.set(id, current);
}

export function summarizeEvents(events: EventRow[]): MusicStats {
  const dedup = new Set<string>();
  const tracks = new Map<string, RankedItem>();
  const artists = new Map<string, RankedItem>();
  const albums = new Map<string, RankedItem>();
  const genres = new Map<string, RankedItem>();
  const playlists = new Map<string, RankedItem>();
  const byDay: Record<string, number> = {};
  let minutes = 0;
  for (const event of events) {
    if (dedup.has(event.event_id)) continue;
    dedup.add(event.event_id);
    const ms = Math.max(0, Math.min(86400000, event.played_duration_ms || 0));
    minutes += ms / 60000;
    byDay[event.listened_at.slice(0, 10)] = (byDay[event.listened_at.slice(0, 10)] ?? 0) + ms / 60000;
    const track = event.track_snapshot;
    add(tracks, event.track_id, String(track.title || event.track_id), ms);
    if (Array.isArray(track.artists)) for (const artist of track.artists) {
      if (!artist || typeof artist !== "object") continue;
      const value = artist as Record<string, unknown>;
      if (typeof value.name === "string") add(artists, String(value.id || value.name), value.name, ms);
    }
    if (track.album && typeof track.album === "object") {
      const album = track.album as Record<string, unknown>;
      if (typeof album.title === "string") add(albums, String(album.id || album.title), album.title, ms);
    }
    const genreList = Array.isArray(track.genres) ? track.genres : typeof track.genre === "string" ? [track.genre] : [];
    for (const genre of genreList) if (typeof genre === "string") add(genres, genre.toLowerCase(), genre, ms);
    if (event.context?.type === "playlist" && typeof event.context.id === "string") {
      add(playlists, event.context.id, event.context.id, ms);
    }
  }
  const rank = (map: Map<string, RankedItem>) => [...map.values()].sort((a, b) => b.minutes - a.minutes || b.plays - a.plays).slice(0, 20);
  return { minutes, plays: dedup.size, topTracks: rank(tracks), topArtists: rank(artists),
    topAlbums: rank(albums), topGenres: rank(genres), topPlaylists: rank(playlists), byDay };
}

export async function loadMusicStats(window: StatsWindow): Promise<MusicStats> {
  const userId = getAuthSession()?.user?.id;
  if (!userId) throw new Error("Sign in required.");
  const events: EventRow[] = [];
  const threshold = since(window);
  if (navigator.onLine) {
    for (let offset = 0; ; offset += 300) {
      let query = getSupabaseClient().from("wavo_play_events")
        .select("event_id,track_id,track_snapshot,context,played_duration_ms,listened_at")
        .eq("user_id", userId).order("listened_at", { ascending: false }).range(offset, offset + 299);
      if (threshold) query = query.gte("listened_at", threshold);
      const { data, error } = await query;
      if (error) throw error;
      events.push(...(data ?? []) as EventRow[]);
      if ((data ?? []).length < 300) break;
    }
  }
  // Include unsynced plays; event IDs deduplicate them against the cloud rows.
  for (let cursor: string | undefined = undefined; ;) {
    const page = localMusic.getHistory(cursor, 100);
    for (const item of page.items) if (!threshold || item.listenedAt >= threshold) events.push({
      event_id: item.id, track_id: item.track.id,
      track_snapshot: item.track as unknown as Record<string, unknown>,
      context: item.context ?? null, played_duration_ms: item.playedDurationMs,
      listened_at: item.listenedAt,
    });
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return summarizeEvents(events);
}

export async function eraseListeningHistory(): Promise<void> {
  const userId = getAuthSession()?.user?.id;
  if (!userId) throw new Error("Sign in required.");
  if (activeCloudSync?.userId === userId) activeCloudSync.dropHistory();
  else {
    localStorage.setItem(`wavo_history_clear_${userId}`, new Date().toISOString());
    localStorage.removeItem(`wavo_local_history_${userId}`);
    window.dispatchEvent(new Event("library:changed"));
  }
}
