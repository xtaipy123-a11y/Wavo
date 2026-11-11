import { useEffect, useMemo, useRef, useState } from "react";
import { api, toClientTrack } from "@/shared/api";
import { queryCache } from "@/shared/cache/queryCache";
import { innertubeCatalog, toCardArtworkUrl } from "@/shared/media/innertube";
import { getCachedLikedTracks, useLikedTracks } from "@/features/library/hooks/useLikedTracks";
import {
  usePlaylistsList,
  type LibraryPlaylistDetail,
  type LibraryPlaylistSummary,
} from "@/features/library/hooks/usePlaylists";
import type { RadioTrack } from "@/shared/contracts/catalog";
import type { Track } from "@/shared/types";
import type { PopularItem } from "./usePopularTracks";
import {
  rankRecommendationTracks,
  selectRecommendationSeeds,
  type SeedTrackLike,
} from "./recommendationEngine";
import { createRandom, randomOffset, rotateItems } from "./homeRotation";

// Home cards render at 175px; 2x keeps decoding cheap on high-density screens.
const CARD_ARTWORK_SIZE = 350;
const RECOMMENDATION_LIMIT = 20;
const SEED_COUNT = 3;
const RADIO_TRACK_LIMIT = 24;
const MAX_PLAYLISTS_TO_SCAN = 2;
const TRACKS_PER_PLAYLIST = 60;
const CACHE_TTL = 5 * 60_000;

// New seed on every renderer start so the row starts with different songs.
const launchRandom = createRandom();

const EMPTY_ITEMS: PopularItem[] = [];

let cache: { data: PopularItem[]; at: number } | undefined;

export interface UseRecommendationsOptions {
  recent?: PopularItem[];
  recentLoading?: boolean;
  /** Only used when the listener has no likes, history or playlists yet. */
  fallback?: PopularItem[];
}

function tracksOf(items: PopularItem[]): Track[] {
  return items.flatMap((entry) => (entry.type === "track" ? [entry.item] : []));
}

function toRecommendation(track: RadioTrack): PopularItem {
  const item = toClientTrack(track);
  const coverUrl = item.coverUrl
    ? toCardArtworkUrl(item.coverUrl, CARD_ARTWORK_SIZE)
    : "";
  return { type: "track", item: { ...item, coverUrl }, playCount: 0 };
}

async function loadPlaylistTracks(
  playlists: LibraryPlaylistSummary[],
  signal: AbortSignal,
): Promise<Track[]> {
  const picks = playlists
    .filter((playlist) => playlist.trackCount > 0)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, MAX_PLAYLISTS_TO_SCAN);

  const results = await Promise.allSettled(
    picks.map(async (summary) => {
      const cached = queryCache.get<LibraryPlaylistDetail>(`playlist:detail:${summary.id}`);
      if (cached) return cached.tracks.slice(0, TRACKS_PER_PLAYLIST);
      const response = await api.getUserPlaylist(summary.id);
      return response.items
        .slice(0, TRACKS_PER_PLAYLIST)
        .map((entry) => toClientTrack(entry.track));
    }),
  );

  if (signal.aborted) return [];
  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

async function loadRecommendations(
  signal: AbortSignal,
  recent: Track[],
  fallback: Track[],
  playlists: LibraryPlaylistSummary[],
): Promise<PopularItem[]> {
  const liked = getCachedLikedTracks();
  const playlistTracks = await loadPlaylistTracks(playlists, signal);
  if (signal.aborted) return [];

  const seeds = selectRecommendationSeeds(
    { liked, recent, playlist: playlistTracks, fallback },
    SEED_COUNT,
  );
  if (seeds.length === 0) return [];

  const results = await Promise.allSettled(
    seeds.map((id) => innertubeCatalog.getRadio(id, { k: RADIO_TRACK_LIMIT, signal })),
  );
  if (signal.aborted) return [];

  const radioLists = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value.items] : [],
  );
  if (radioLists.length === 0) return [];

  const known: SeedTrackLike[] = [...liked, ...recent, ...playlistTracks, ...fallback];
  const ranked = rankRecommendationTracks(radioLists, known, RECOMMENDATION_LIMIT);
  return rotateItems(ranked, randomOffset(launchRandom, ranked.length)).map(toRecommendation);
}

export function useRecommendations(options: UseRecommendationsOptions = {}) {
  const { recent = EMPTY_ITEMS, recentLoading = false, fallback = EMPTY_ITEMS } = options;
  const liked = useLikedTracks();
  const playlists = usePlaylistsList();

  const [data, setData] = useState<PopularItem[]>(() => cache?.data ?? EMPTY_ITEMS);
  const [isLoading, setIsLoading] = useState(() => !cache);
  const [revision, setRevision] = useState(0);

  const recentTracks = useMemo(() => tracksOf(recent), [recent]);
  const fallbackTracks = useMemo(() => tracksOf(fallback), [fallback]);
  const recentKey = useMemo(() => recentTracks.map((track) => track.id).join("|"), [recentTracks]);
  const fallbackKey = useMemo(
    () => fallbackTracks.map((track) => track.id).join("|"),
    [fallbackTracks],
  );
  const playlistKey = useMemo(
    () => playlists.data.playlists.map((playlist) => `${playlist.id}:${playlist.trackCount}`).join("|"),
    [playlists.data.playlists],
  );

  const sourcesRef = useRef({
    recent: recentTracks,
    fallback: fallbackTracks,
    playlists: playlists.data.playlists,
  });
  sourcesRef.current = {
    recent: recentTracks,
    fallback: fallbackTracks,
    playlists: playlists.data.playlists,
  };

  useEffect(() => {
    const reset = () => {
      cache = undefined;
      setData(EMPTY_ITEMS);
      setIsLoading(true);
      setRevision((value) => value + 1);
    };
    window.addEventListener("auth:changed", reset);
    window.addEventListener("library:changed", reset);
    return () => {
      window.removeEventListener("auth:changed", reset);
      window.removeEventListener("library:changed", reset);
    };
  }, []);

  const ready = !recentLoading && !liked.isLoading && !playlists.isLoading;
  const likedTotal = liked.data.total;

  useEffect(() => {
    if (!ready) return;
    if (revision === 0 && cache && Date.now() - cache.at < CACHE_TTL) {
      setData(cache.data);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setIsLoading(true);

    loadRecommendations(
      controller.signal,
      sourcesRef.current.recent,
      sourcesRef.current.fallback,
      sourcesRef.current.playlists,
    )
      .then((items) => {
        if (!active) return;
        if (items.length > 0) cache = { data: items, at: Date.now() };
        setData(items);
      })
      .catch(() => {
        if (active) setData(EMPTY_ITEMS);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [ready, revision, recentKey, fallbackKey, playlistKey, likedTotal]);

  return { data, isLoading };
}
