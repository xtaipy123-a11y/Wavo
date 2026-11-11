import type { RadioTrack } from "@/shared/contracts/catalog";

/** Minimal track shape shared by client tracks, catalog tracks and radio results. */
export interface SeedTrackLike {
  id: string;
  artists?: string | ReadonlyArray<{ name: string }>;
  artistList?: ReadonlyArray<{ name: string }>;
}

export interface RecommendationSources {
  liked?: SeedTrackLike[];
  recent?: SeedTrackLike[];
  playlist?: SeedTrackLike[];
  /** Used only when the personal sources contain no usable artist. */
  fallback?: SeedTrackLike[];
}

interface SeedCandidate {
  id: string;
  artistKeys: string[];
  weight: number;
  order: number;
}

/** Uploads and other local-only entries cannot seed a YouTube Music radio. */
function isRadioSeed(id: string): boolean {
  return Boolean(id) && !id.startsWith("upload:");
}

export function artistNamesOf(track: SeedTrackLike): string[] {
  const fromList = track.artistList?.map((artist) => artist.name);
  const fromArtists = Array.isArray(track.artists)
    ? track.artists.map((artist) => artist.name)
    : typeof track.artists === "string"
      ? track.artists.split(",")
      : [];
  const names = fromList?.length ? fromList : fromArtists;
  return names
    .map((name) => (typeof name === "string" ? name.trim() : ""))
    .filter((name) => name.length > 0 && name.toLowerCase() !== "unknown");
}

/**
 * Builds a few radio seeds from the tracks a listener already knows.
 * Artists are scored by how often they appear in likes (weight 3), recent plays
 * (weight 2) and own playlists (weight 1); each picked artist contributes one
 * seed so the radios cover different tastes instead of one artist.
 */
export function selectRecommendationSeeds(
  sources: RecommendationSources,
  maxSeeds = 3,
): string[] {
  const weightedSources: Array<{ tracks: SeedTrackLike[]; weight: number }> = [
    { tracks: sources.liked ?? [], weight: 3 },
    { tracks: sources.recent ?? [], weight: 2 },
    { tracks: sources.playlist ?? [], weight: 1 },
  ];

  const artists = new Map<string, { score: number; tracks: SeedCandidate[] }>();
  let order = 0;

  for (const { tracks, weight } of weightedSources) {
    for (const track of tracks) {
      if (!isRadioSeed(track.id)) continue;
      const artistKeys = artistNamesOf(track).map((name) => name.toLowerCase());
      if (artistKeys.length === 0) continue;
      const candidate: SeedCandidate = { id: track.id, artistKeys, weight, order: order++ };
      for (const key of artistKeys) {
        const entry = artists.get(key) ?? { score: 0, tracks: [] };
        entry.score += weight;
        entry.tracks.push(candidate);
        artists.set(key, entry);
      }
    }
  }

  const seeds: string[] = [];
  const usedTracks = new Set<string>();
  const usedArtists = new Set<string>();

  const rankedArtists = [...artists.entries()].sort((a, b) => b[1].score - a[1].score);
  for (const [artistKey, entry] of rankedArtists) {
    if (usedArtists.has(artistKey)) continue;
    const candidate = entry.tracks
      .filter((track) => !usedTracks.has(track.id))
      .sort((a, b) => b.weight - a.weight || a.order - b.order)[0];
    if (!candidate) continue;

    seeds.push(candidate.id);
    usedTracks.add(candidate.id);
    for (const key of candidate.artistKeys) usedArtists.add(key);
    if (seeds.length >= maxSeeds) break;
  }

  if (seeds.length === 0) {
    const seenArtists = new Set<string>();
    for (const track of sources.fallback ?? []) {
      if (!isRadioSeed(track.id) || usedTracks.has(track.id)) continue;
      const [artistKey] = artistNamesOf(track).map((name) => name.toLowerCase());
      if (artistKey && seenArtists.has(artistKey)) continue;
      if (artistKey) seenArtists.add(artistKey);
      seeds.push(track.id);
      if (seeds.length >= maxSeeds) break;
    }
  }

  return seeds;
}

/**
 * Merges radio results, drops everything the listener already knows and ranks
 * by radio position plus shared artists. Repeat matches across several radios
 * are lifted to the top.
 */
export function rankRecommendationTracks(
  radioLists: RadioTrack[][],
  knownTracks: SeedTrackLike[],
  limit = 20,
): RadioTrack[] {
  const existingIds = new Set(knownTracks.map((track) => track.id));
  const artistNames = new Set(
    knownTracks.flatMap((track) =>
      artistNamesOf(track).map((name) => name.toLowerCase()),
    ),
  );
  const candidates = new Map<string, { track: RadioTrack; score: number; order: number }>();
  let order = 0;

  for (const list of radioLists) {
    for (let index = 0; index < list.length; index += 1) {
      const track = list[index];
      if (!track?.id || !track.title || existingIds.has(track.id)) continue;
      const matchingArtists = track.artists.filter((artist) =>
        artistNames.has(artist.name.trim().toLowerCase()),
      ).length;
      const score = 20 - Math.min(index, 19) + matchingArtists * 8;
      const prior = candidates.get(track.id);
      if (prior) prior.score += score + 12;
      else candidates.set(track.id, { track, score, order: order++ });
    }
  }

  return [...candidates.values()]
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ track }) => track);
}
