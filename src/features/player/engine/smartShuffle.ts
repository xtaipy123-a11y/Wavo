import type { Track } from "@/shared/types";

export interface SmartShuffleOptions {
  likedTrackIds?: ReadonlySet<string>;
  likedArtistKeys?: ReadonlySet<string>;
  dislikedTrackIds?: ReadonlySet<string>;
  /** Injectable for deterministic tests. */
  random?: () => number;
}

export function trackArtistKey(track: Track): string {
  const name = track.artistList?.[0]?.name || track.artists.split(",")[0] || "";
  return name.trim().toLowerCase();
}

export function filterDislikedTracks<T extends { id: string }>(
  tracks: T[],
  dislikedTrackIds: ReadonlySet<string>,
  keepTrackId?: string | null,
): T[] {
  if (dislikedTrackIds.size === 0) return [...tracks];
  return tracks.filter(
    (track) => !dislikedTrackIds.has(track.id) || track.id === keepTrackId,
  );
}

/**
 * Shuffles with a taste bias: liked tracks and tracks from liked artists are
 * more likely to come up early, while the same artist is kept apart when there
 * is a choice. Disliked tracks are always removed.
 */
export function smartShuffleTracks(
  tracks: Track[],
  options: SmartShuffleOptions = {},
): Track[] {
  const {
    likedTrackIds = new Set<string>(),
    likedArtistKeys = new Set<string>(),
    dislikedTrackIds = new Set<string>(),
    random = Math.random,
  } = options;

  const remaining = filterDislikedTracks(tracks, dislikedTrackIds);
  const result: Track[] = [];
  let previousArtist = "";

  while (remaining.length > 0) {
    const artistSafe = remaining.filter(
      (track) => trackArtistKey(track) !== previousArtist,
    );
    const candidates = artistSafe.length > 0 ? artistSafe : remaining;

    let bestIndex = 0;
    let bestScore = -1;
    for (let index = 0; index < candidates.length; index++) {
      const track = candidates[index];
      const weight =
        (likedTrackIds.has(track.id) ? 3.2 : 1) *
        (likedArtistKeys.has(trackArtistKey(track)) ? 1.7 : 1);
      const score = Math.pow(Math.max(0, Math.min(1, random())), 1 / weight);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    const [nextTrack] = candidates.splice(bestIndex, 1);
    const originalIndex = remaining.findIndex(
      (track) => track.id === nextTrack.id && track === nextTrack,
    );
    if (originalIndex >= 0) remaining.splice(originalIndex, 1);
    else {
      const fallbackIndex = remaining.findIndex(
        (track) => track.id === nextTrack.id,
      );
      if (fallbackIndex >= 0) remaining.splice(fallbackIndex, 1);
    }

    result.push(nextTrack);
    previousArtist = trackArtistKey(nextTrack);
  }

  return result;
}
