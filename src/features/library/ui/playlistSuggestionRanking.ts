import type { RadioTrack } from "@/shared/contracts/catalog";
import type { Track } from "@/shared/types";

const MAX_SUGGESTIONS = 8;

export function rankSuggestions(
  radioLists: RadioTrack[][],
  playlistTracks: Track[],
): RadioTrack[] {
  const existingIds = new Set(playlistTracks.map((track) => track.id));
  const artistNames = new Set(
    playlistTracks.flatMap((track) =>
      (track.artistList?.length ? track.artistList.map((artist) => artist.name) : track.artists.split(","))
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  const candidates = new Map<string, { track: RadioTrack; score: number; order: number }>();
  let order = 0;
  for (const list of radioLists) {
    for (let index = 0; index < list.length; index += 1) {
      const track = list[index];
      if (!track?.id || !track.title || existingIds.has(track.id)) continue;
      const matchingArtists = track.artists.filter((artist) => artistNames.has(artist.name.trim().toLowerCase())).length;
      const score = 20 - Math.min(index, 19) + matchingArtists * 8;
      const prior = candidates.get(track.id);
      if (prior) prior.score += score + 12;
      else candidates.set(track.id, { track, score, order: order++ });
    }
  }
  return [...candidates.values()]
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, MAX_SUGGESTIONS)
    .map(({ track }) => track);
}
