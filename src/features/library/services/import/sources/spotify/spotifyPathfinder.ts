import { asArray, asRecord, isRecord, type JsonRecord, numberValue, recordAt, stringValue } from "@/shared/utils/json";
import type { ClientImportedTrack } from "../../importTypes";
import { delay } from "../../shared/http";
import { getSpotifyGuestSession, SPOTIFY_CLIENT_VERSION, type SpotifySession } from "./spotifyAuth";

const SPOTIFY_PATHFINDER_HASH = "86dde7b9d9356e2369414647cf6950cfed96e778e129cfdfc99aea6c1613b3b0";
const PAGE_LIMIT = 100;
const MAX_PAGES = 60;

function pathfinderUrl(playlistId: string, offset: number): string {
  const params = new URLSearchParams({
    operationName: "fetchPlaylistContents",
    variables: JSON.stringify({ uri: `spotify:playlist:${playlistId}`, offset, limit: PAGE_LIMIT }),
    extensions: JSON.stringify({ persistedQuery: { version: 1, sha256Hash: SPOTIFY_PATHFINDER_HASH } }),
  });
  return `https://api-partner.spotify.com/pathfinder/v1/query?${params.toString()}`;
}

function pathfinderHeaders(session: SpotifySession): Record<string, string> {
  return {
    authorization: `Bearer ${session.accessToken}`,
    ...(session.clientToken ? { "client-token": session.clientToken } : {}),
    accept: "application/json",
    "app-platform": "WebPlayer",
    "spotify-app-version": SPOTIFY_CLIENT_VERSION,
  };
}

function artistName(raw: unknown): string | undefined {
  const artist = asRecord(raw);
  return stringValue(recordAt(artist, "profile")?.name) ?? stringValue(artist?.name);
}

// Spotify keeps per-user hidden tracks private ("playcontextbans"), but if the
// payload ever surfaces a hidden/excluded flag we honor it during import.
const HIDDEN_FLAGS = ["hidden", "isHidden", "banned", "isBanned", "excluded", "isExcluded", "disabled", "isDisabled"] as const;

export function isHiddenPlaylistItem(item: JsonRecord): boolean {
  const containers = [
    item,
    asRecord(item.itemV2),
    recordAt(item, "itemV2", "data"),
    asRecord(item.attributes),
  ];
  return containers.some((container) =>
    container ? HIDDEN_FLAGS.some((key) => container[key] === true) : false,
  );
}

// Playlist payloads occasionally expose a separate list of per-user bans.
const BANNED_LIST_KEYS = ["bannedItems", "bannedTracks", "bans", "hiddenItems", "hiddenTracks"] as const;

function collectBannedTrackIds(root: JsonRecord | undefined, into: Set<string>): void {
  if (!root) return;
  for (const key of BANNED_LIST_KEYS) {
    for (const entry of asArray(root[key])) {
      const record = asRecord(entry);
      const uri =
        stringValue(record?.uri) ??
        stringValue(recordAt(record, "itemV2", "data")?.uri) ??
        stringValue(recordAt(record, "track")?.uri);
      const id = uri?.split(":").pop();
      if (id) into.add(id);
    }
  }
}

export function mapPathfinderItem(item: JsonRecord): ClientImportedTrack | undefined {
  const track = recordAt(item, "itemV2", "data");
  if (!track || track.__typename !== "Track") return undefined;
  const title = typeof track.name === "string" ? track.name.trim() : undefined;
  if (!title) return undefined;

  const artists = asArray(recordAt(track, "artists")?.items)
    .map(artistName)
    .filter((name): name is string => Boolean(name));
  const uri = typeof track.uri === "string" ? track.uri : "";
  const album = recordAt(track, "albumOfTrack");
  const albumName = stringValue(album?.name);
  const coverUrl = stringValue(asRecord(asArray(recordAt(album, "coverArt")?.sources)[0])?.url);
  const durationMs = numberValue(recordAt(track, "trackDuration")?.totalMilliseconds);

  return {
    sourceId: uri.split(":").pop() || String(track.id ?? ""),
    title,
    artists: artists.length > 0 ? artists : ["Spotify Artist"],
    ...(albumName ? { album: albumName } : {}),
    ...(coverUrl ? { coverUrl } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(isHiddenPlaylistItem(item) ? { disliked: true } : {}),
  };
}

export async function fetchSpotifyPlaylistTracks(playlistId: string, signal?: AbortSignal): Promise<ClientImportedTrack[]> {
  const session = await getSpotifyGuestSession(signal);
  const tracks: ClientImportedTrack[] = [];
  const bannedTrackIds = new Set<string>();
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  let pageCount = 0;

  while (offset < total && pageCount < MAX_PAGES) {
    pageCount += 1;
    const response = await fetch(pathfinderUrl(playlistId, offset), { headers: pathfinderHeaders(session), signal });
    if (response.status === 429) {
      await delay(Number(response.headers.get("retry-after") || 3) * 1000, signal);
      continue;
    }
    if (!response.ok) break;

    const data = (await response.json()) as unknown;
    const playlist = recordAt(data, "data", "playlistV2");
    const content = recordAt(playlist, "content");
    if (!content) break;
    collectBannedTrackIds(playlist, bannedTrackIds);
    collectBannedTrackIds(content, bannedTrackIds);
    const count = numberValue(content.totalCount);
    if (count !== undefined) total = count;
    const items = asArray(content.items).filter(isRecord);
    if (!items.length) break;

    for (const item of items) {
      const track = mapPathfinderItem(item);
      if (!track) continue;
      if (bannedTrackIds.has(track.sourceId)) track.disliked = true;
      tracks.push(track);
    }
    offset += PAGE_LIMIT;
    if (tracks.length >= total) break;
    await delay(50, signal);
  }
  return tracks;
}
