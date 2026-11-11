import { useEffect, useState } from "react";
import { innertubeCatalog, toSquareArtworkUrl, type HomeShelf } from "@/shared/media/innertube";
import { toClientTrack } from "@/shared/api/track";
import type { SearchResult } from "@/shared/contracts";
import type { PopularItem } from "./usePopularTracks";
import { createRandom, pickRandom, randomOffset, rotateItems } from "./homeRotation";

// Cards render at 175px; 2x for high-density screens keeps decoding cheap.
const CARD_ARTWORK_SIZE = 350;
const ARTIST_ROW_LIMIT = 40;
const CATEGORY_SHELF_LIMIT = 24;
const CACHE_TTL = 300_000;

// New seed on every renderer start: rows rotate per app launch, not per render.
const launchRandom = createRandom();

export interface HomePlaylistShelf {
  key: string;
  title: string;
  items: PopularItem[];
}

export interface HomeDiscovery {
  tracks: PopularItem[];
  albums: PopularItem[];
  artists: PopularItem[];
  categoryShelves: HomePlaylistShelf[];
  playlistShelves: HomePlaylistShelf[];
}

export const emptyHomeDiscovery: HomeDiscovery = {
  tracks: [],
  albums: [],
  artists: [],
  categoryShelves: [],
  playlistShelves: [],
};

export function toHomeItems(results: SearchResult[]): PopularItem[] {
  return results.flatMap((item): PopularItem[] => {
    if (item.type === "track") return [{ type: "track", item: toClientTrack(item), playCount: 0 }];
    if (item.type === "album") return [{ type: "album", item: {
      id: item.id, title: item.title, artist: item.artists.map(artist => artist.name).join(", "),
      coverUrl: item.cover?.url ? toSquareArtworkUrl(item.cover.url, CARD_ARTWORK_SIZE) : "",
      totalTracks: 0, albumType: "album",
    }, playCount: 0 }];
    if (item.type === "playlist") return [{ type: "playlist", item: {
      id: item.id, title: item.title, owner: item.author ?? "YouTube Music",
      coverUrl: item.cover?.url ? toSquareArtworkUrl(item.cover.url, CARD_ARTWORK_SIZE) : "", totalTracks: 0,
    }, playCount: 0 }];
    if (item.type === "artist") return [{ type: "artist", item: {
      id: item.id, name: item.name,
      imageUrl: item.cover?.url ? toSquareArtworkUrl(item.cover.url, CARD_ARTWORK_SIZE) : "",
      followers: 0, description: "", totalListens: 0, totalTracks: 0,
    }, playCount: 0 }];
    return [];
  });
}

function collect(items: PopularItem[], type: PopularItem["type"], seen = new Set<string>()): PopularItem[] {
  return items.filter((item) => {
    if (item.type !== type) return false;
    const key = `${item.type}:${item.item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Rotates so every launch starts the row with different cards. */
function varied<T>(items: T[]): T[] {
  return rotateItems(items, randomOffset(launchRandom, items.length));
}

function playlistShelvesFrom(
  shelves: HomeShelf[],
  keyPrefix: string,
  limit?: number,
): HomePlaylistShelf[] {
  const seen = new Set<string>();
  return shelves.flatMap((shelf, index) => {
    const collected = varied(collect(toHomeItems(shelf.items), "playlist", seen));
    const items = limit ? collected.slice(0, limit) : collected;
    return items.length > 0 ? [{ key: `${keyPrefix}-${index}`, title: shelf.title, items }] : [];
  });
}

/**
 * Category pages can hold a dozen or more shelves (Chill alone has 14), so a
 * launch shows exactly one of them. The shelf rotates per launch, the category
 * itself does too.
 */
export function pickCategoryShelf<T extends { items: unknown[] }>(
  shelves: T[],
  random: () => number = launchRandom,
): T | undefined {
  return pickRandom(shelves.filter((shelf) => shelf.items.length > 0), 1, random)[0];
}

/** One random mood/genre and one of its shelves, both different per app start. */
async function loadCategoryShelves(signal: AbortSignal): Promise<HomePlaylistShelf[]> {
  const categories = await innertubeCatalog.getMoodCategories(signal);
  if (categories.length === 0 || signal.aborted) return [];
  const [category] = pickRandom(categories, 1, launchRandom);
  if (!category) return [];
  const shelves = await innertubeCatalog.getCategoryShelves(category, signal).catch(() => []);
  const shelf = pickCategoryShelf(shelves);
  if (!shelf) return [];
  return playlistShelvesFrom([shelf], `category-${category.title}`, CATEGORY_SHELF_LIMIT);
}

async function loadDiscovery(signal: AbortSignal): Promise<HomeDiscovery> {
  const [home, releases, charts] = await Promise.allSettled([
    innertubeCatalog.getHomeShelves(signal),
    innertubeCatalog.getNewReleaseShelves(signal),
    innertubeCatalog.getChartShelves(signal),
  ]);
  const shelfLists = [home, releases, charts]
    .filter((result): result is PromiseFulfilledResult<HomeShelf[]> => result.status === "fulfilled")
    .map((result) => result.value);
  const shelves = shelfLists.flat();
  if (shelves.length === 0) throw new Error("No discovery content");

  const items = shelves.flatMap((shelf) => toHomeItems(shelf.items));
  return {
    tracks: varied(collect(items, "track")),
    albums: varied(collect(items, "album")),
    artists: collect(items, "artist").slice(0, ARTIST_ROW_LIMIT),
    categoryShelves: [],
    playlistShelves: playlistShelvesFrom(
      home.status === "fulfilled" ? home.value : [],
      "playlists",
    ),
  };
}

let cached: { data: HomeDiscovery; at: number } | undefined;

export function useHomeDiscovery() {
  const [data, setData] = useState<HomeDiscovery>(cached?.data ?? emptyHomeDiscovery);
  const [isLoading, setIsLoading] = useState(!cached);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const appendCategoryShelves = () => {
      loadCategoryShelves(controller.signal)
        .then(shelves => {
          if (!active || shelves.length === 0) return;
          setData(previous => {
            const next = { ...previous, categoryShelves: shelves };
            cached = { data: next, at: Date.now() };
            return next;
          });
        })
        .catch(() => { /* mood shelves are optional */ });
    };

    if (!attempt && cached && Date.now() - cached.at < CACHE_TTL) {
      setData(cached.data);
      setIsLoading(false);
      if (cached.data.categoryShelves.length === 0) appendCategoryShelves();
      return () => { active = false; controller.abort(); };
    }

    const timeout = setTimeout(() => controller.abort(), 20_000);
    setIsLoading(true);
    setError(false);
    loadDiscovery(controller.signal)
      .then(discovery => {
        if (!active) return;
        cached = { data: discovery, at: Date.now() };
        setData(discovery);
        appendCategoryShelves();
      })
      .catch(() => { if (active) setError(true); })
      .finally(() => { clearTimeout(timeout); if (active) setIsLoading(false); });

    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [attempt]);

  // Re-open after a while: fetch a fresh mix instead of showing the cached feed.
  useEffect(() => {
    const refreshIfStale = () => {
      if (document.visibilityState !== "visible") return;
      if (cached && Date.now() - cached.at >= CACHE_TTL) {
        setAttempt((value) => value + 1);
      }
    };
    document.addEventListener("visibilitychange", refreshIfStale);
    window.addEventListener("focus", refreshIfStale);
    return () => {
      document.removeEventListener("visibilitychange", refreshIfStale);
      window.removeEventListener("focus", refreshIfStale);
    };
  }, []);

  return { data, isLoading, error, retry: () => setAttempt(value => value + 1) };
}
