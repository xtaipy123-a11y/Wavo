import {
  getAccessToken,
  getAuthSession,
  getSessionExpiryMs,
  getValidAccessToken,
  refreshAuthSession,
} from "./auth-session";
import { signApiRequest, syncServerTime } from "./requestSigner";
import { clientCatalog } from "./clientCatalog";
import { innertubeCatalog } from "@/shared/media/innertube";
import { localMusic } from "./localMusic";
import { localPlaylists } from "./localPlaylists";
import { streamPublicLyrics } from "./publicLyrics";
import { getLocalImportHandler } from "./localImports";
import type { Track } from "@/shared/contracts";
import { telemetry } from "@/shared/telemetry";
import type {
  UserProfile,
  LeaderboardResponse,
  DailyMixesResponse,
} from "@/shared/contracts";

import { usePlayerStore } from "@/features/player/store/playerStore";
import { showToast } from "@/shared/ui/Toast";
import { createTranslatorSync, getStoredLocale } from "@/languages";
import {
  isConnectivityFailure,
  isPlaybackPath,
  recordConnectivityFailure,
  statusOf,
  stripQuery,
} from "@/features/connectivity";

function translate(key: string, vars?: Record<string, string | number>) {
  try {
    return createTranslatorSync(getStoredLocale())(key, vars);
  } catch {
    return key;
  }
}

import { getApiBaseUrl, musicApiAcceptsSupabaseJwt } from "./baseUrl";

const CLIENT_VERSION =
  (import.meta.env.VITE_CLIENT_VERSION as string | undefined) || "1.0.4-desktop";

const DEFAULT_TIMEOUT_MS = 15000;

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const userSignal = init?.signal;
  let didTimeout = false;

  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort(new Error(`Request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  let onUserAbort: (() => void) | null = null;
  if (userSignal) {
    if (userSignal.aborted) {
      clearTimeout(timer);
      controller.abort(userSignal.reason);
    } else {
      onUserAbort = () => {
        clearTimeout(timer);
        controller.abort(userSignal.reason);
      };
      userSignal.addEventListener("abort", onUserAbort);
    }
  }

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return res;
  } catch (err: any) {
    if (didTimeout) {
      showToast(translate("common.error_timeout_title"), "error", {
        id: "network-timeout-toast",
        description: translate("common.error_network"),
      });
      throw new ApiError(
        0,
        "Request timed out. Please check your network connection.",
        "TIMEOUT_ERROR",
      );
    }
    if (userSignal?.aborted) {
      throw err;
    }
    showToast(translate("common.error_network_title"), "error", {
      id: "network-error-toast",
      description: translate("common.error_network"),
    });
    throw new ApiError(
      0,
      "Network error. Unable to reach server.",
      "NETWORK_ERROR",
    );
  } finally {
    clearTimeout(timer);
    if (userSignal && onUserAbort) {
      userSignal.removeEventListener("abort", onUserAbort);
    }
  }
}

function getPlatform(): string {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  if (ua.includes("linux")) return "linux";
  return "desktop";
}

function getActiveSessionId(): string | undefined {
  try {
    const state = usePlayerStore.getState();
    return state.currentTrack?.id || undefined;
  } catch {
    return undefined;
  }
}

function extractSubFromToken(token: string): string | undefined {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return undefined;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const payload = JSON.parse(json);
    return typeof payload.sub === "string" && payload.sub.trim().length > 0 ? payload.sub.trim() : undefined;
  } catch {
    return undefined;
  }
}

export function mediaUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return getApiBaseUrl() + (path.startsWith("/") ? path : "/" + path);
}

// upgrades youtube/google avatar artwork to maximum native resolution (=s0)
export function toMaxQualityAvatarUrl(url: string | undefined): string {
  if (!url) return "";
  if (!/(?:[a-zA-Z0-9_-]+\.googleusercontent\.com|[a-zA-Z0-9_-]+\.ggpht\.com)/i.test(url)) {
    return url;
  }
  if (/=w\d+-h\d+/.test(url)) {
    return url.replace(/=w\d+-h\d+(?:-[a-zA-Z0-9_-]+)*/, "=s0");
  }
  if (/=s\d+/.test(url)) {
    return url.replace(/=s\d+(?:-[a-zA-Z0-9_-]+)*/, "=s0");
  }
  return `${url}=s0`;
}

const inFlightGetRequests = new Map<string, Promise<unknown>>();

async function executeRequest<T>(
  path: string,
  init?: RequestInit,
  allowRefresh = true,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const startTime = performance.now();
  const method = (init?.method ?? "GET").toUpperCase();
  const rawBody = typeof init?.body === "string" ? init.body : null;
  const signedHeaders = await signApiRequest(method, path, rawBody);
  const useSupabaseJwt = musicApiAcceptsSupabaseJwt();
  const currentSession = useSupabaseJwt ? getAuthSession() : null;
  let accessToken = allowRefresh && useSupabaseJwt ? await getValidAccessToken() : null;

  if (allowRefresh && currentSession?.accessToken && !accessToken && !path.startsWith("/v1/auth/")) {
    const expiryMs = getSessionExpiryMs(currentSession);
    if (expiryMs && expiryMs > Date.now()) {
      accessToken = currentSession.accessToken;
    } else {
      throw new ApiError(0, "Network error during token refresh.", "NETWORK_ERROR");
    }
  }

  const hasBody = init?.body != null;
  const extraHeaders = (init?.headers as Record<string, string>) ?? {};
  const { Authorization: _ignoredAuth, ...restHeaders } = extraHeaders;

  const requestId =
    extraHeaders["x-request-id"] ||
    extraHeaders["X-Request-Id"] ||
    (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
  const correlationHeaders: Record<string, string> = {
    "x-request-id": requestId,
    "x-client-version": CLIENT_VERSION,
    "x-platform": getPlatform(),
  };

  const userId = currentSession?.user?.id || (accessToken ? extractSubFromToken(accessToken) : undefined);
  if (userId) {
    correlationHeaders["x-user-id"] = userId;
  }
  if (currentSession?.user?.username) {
    correlationHeaders["x-user-name"] = currentSession.user.username;
  }

  const activeSessionId = getActiveSessionId();
  if (activeSessionId) {
    correlationHeaders["x-session-id"] = activeSessionId;
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(
      getApiBaseUrl() + path,
      {
        ...init,
        headers: {
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...correlationHeaders,
          ...signedHeaders,
          ...restHeaders,
        },
      },
      timeoutMs,
    );
  } catch (err: any) {
    if (init?.signal?.aborted || err?.name === "AbortError") {
      throw err;
    }
    const durationMs = Math.round(performance.now() - startTime);
    telemetry.trackNetwork(method, path, 0, durationMs, requestId);
    if (isConnectivityFailure(err) && !isPlaybackPath(path)) {
      recordConnectivityFailure({
        method,
        path: stripQuery(path),
        status: statusOf(err),
        latencyMs: durationMs,
      });
    }
    throw err;
  }

  // sync server time offset from response Date header
  const dateHeader = res.headers?.get?.("date");
  if (dateHeader) {
    syncServerTime(dateHeader);
  }

  if (res.status === 401 && allowRefresh && useSupabaseJwt && !path.startsWith("/v1/auth/")) {
    const currentSession = getAuthSession();
    // If the token in session store was already rotated by another parallel request,
    // retry immediately with the rotated token without firing duplicate refresh requests
    let nextToken =
      currentSession?.accessToken && currentSession.accessToken !== accessToken
        ? currentSession.accessToken
        : null;

    if (!nextToken && currentSession?.refreshToken) {
      const refreshed = await refreshAuthSession();
      nextToken = refreshed?.accessToken ?? null;
      if (!nextToken && getAuthSession()?.refreshToken) {
        throw new ApiError(
          0,
          "Failed to refresh auth session due to network issue",
          "NETWORK_ERROR",
        );
      }
    }

    if (!nextToken) {
      const durationMs = Math.round(performance.now() - startTime);
      telemetry.trackNetwork(method, path, res.status, durationMs, requestId);
      const body = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const code = typeof body?.code === "string" ? body.code : undefined;
      const message =
        typeof body?.message === "string"
          ? body.message
          : typeof body?.error === "string"
          ? body.error
          : "Unauthorized";
      throw new ApiError(res.status, message, code, requestId);
    }

    // Retry request with newly signed headers (synced server clock + fresh token if available)
    const refreshedSignedHeaders = await signApiRequest(
      method,
      path,
      rawBody,
    );
    try {
      res = await fetchWithTimeout(
        getApiBaseUrl() + path,
        {
          ...init,
          headers: {
            ...(hasBody ? { "Content-Type": "application/json" } : {}),
            ...correlationHeaders,
            ...restHeaders,
            ...refreshedSignedHeaders,
            ...(nextToken ? { Authorization: `Bearer ${nextToken}` } : {}),
          },
        },
        timeoutMs,
      );
      const retryDateHeader = res.headers?.get?.("date");
      if (retryDateHeader) {
        syncServerTime(retryDateHeader);
      }
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime);
      telemetry.trackNetwork(method, path, 0, durationMs, requestId);
      if (isConnectivityFailure(err) && !isPlaybackPath(path)) {
        recordConnectivityFailure({
          method,
          path: stripQuery(path),
          status: statusOf(err),
          latencyMs: durationMs,
        });
      }
      throw err;
    }
  }

  const durationMs = Math.round(performance.now() - startTime);
  telemetry.trackNetwork(method, path, res.status, durationMs, requestId);

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const resRequestId =
      res.headers?.get?.("x-request-id") ||
      (typeof body.reqId === "string"
        ? body.reqId
        : typeof body.requestId === "string"
        ? body.requestId
        : undefined);

    if (res.status >= 500) {
      showToast(translate("common.error_server_title"), "error", {
        id: `server-error-${res.status}`,
        description: translate("common.error_server"),
        requestId: resRequestId,
      });
    }

    const apiErr = new ApiError(
      res.status,
      typeof body.message === "string" ? body.message : res.statusText,
      typeof body.code === "string" ? body.code : undefined,
      resRequestId,
    );
    if (isConnectivityFailure(apiErr) && !isPlaybackPath(path)) {
      recordConnectivityFailure({
        method,
        path: stripQuery(path),
        status: res.status,
        ...(apiErr.code ? { code: apiErr.code } : {}),
        latencyMs: durationMs,
      });
    }
    throw apiErr;
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

async function request<T>(
  path: string,
  init?: RequestInit,
  allowRefresh = true,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method === "GET" && !init?.signal) {
    const key = `${path}::${allowRefresh}`;
    const inFlight = inFlightGetRequests.get(key);
    if (inFlight) {
      return inFlight as Promise<T>;
    }
    const promise = executeRequest<T>(path, init, allowRefresh, timeoutMs).finally(() => {
      inFlightGetRequests.delete(key);
    });
    inFlightGetRequests.set(key, promise);
    return promise;
  }
  return executeRequest<T>(path, init, allowRefresh, timeoutMs);
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get traceInfo(): string | undefined {
    return this.requestId ? `[reqId: ${this.requestId}]` : undefined;
  }
}

// maps any thrown error to a localized human-friendly message.
// never surfaces raw api bodies, statuses, or technical jargon.
export function resolveApiErrorMessage(
  err: unknown,
  t: (key: string) => string,
  fallbackKey: string,
): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return t("common.error_network");
    if (err.status === 401 || err.status === 403)
      return t("common.error_session_expired");
    if (err.status === 404) return t("common.error_not_found");
    if (err.status === 429) return t("common.error_too_many");
    if (err.status >= 500) return t("common.error_server");
    return t(fallbackKey);
  }
  return t(fallbackKey);
}

// ---- Types from @wavo/contracts --------------------------------------------

export type {
  SearchType,
  Cover,
  ApiCover,
  TrackArtist as ApiTrackArtist,
  TrackAlbum as ApiTrackAlbum,
  Track as ApiTrackBase,
  ApiTrack,
  TrackDetails as ApiTrackDetails,
  SearchArtistItem as ApiArtist,
  SearchAlbumItem as ApiAlbum,
  SearchPlaylistItem as ApiPlaylist,
  SearchResult as ApiSearchItem,
  SearchResponse,
  ArtistAlbum as ApiArtistAlbum,
  ArtistRelease as ApiArtistRelease,
  ArtistDetails as ApiArtistDetails,
  AlbumDetails as ApiAlbumDetails,
  CatalogPlaylistDetails as ApiCatalogPlaylistDetails,
  RadioTrack as ApiRadioTrack,
  RadioResponse,
  PlaylistSummary as ApiPlaylistSummary,
  PlaylistDetails as ApiPlaylistDetails,
  UserPlaylist as ApiUserPlaylist,
  UserPlaylistItem as ApiUserPlaylistItem,
  LikedTracksPage as ApiLikedTracksPage,
  LyricsFormat,
  LyricsContentKind,
  LyricsSyncLevel,
  LyricsQuality,
  RawLyricsCandidate,
  LyricsCandidate,
  LyricsStreamEvent,
  ImportReviewReason,
  ImportReview,
  ImportReviewDecision,
  ImportSource,
  ImportJobStatus,
  ImportResult,
  ImportJob,
  ImportedTrack,
  ImportedPlaylist,
  PublicUser,
  UserProfile,
  UpdateProfileInput,
  UserPrivacySettings,
  LeaderboardResponse,
  LeaderboardEntry,
  LeaderboardPeriod,
  LeaderboardType,
  AuthTokens,
  AuthResult,
  PlaybackContextType,
  PlaybackContext,
  RecordPlaybackEventRequest,
  PlaybackHistoryItem,
  PlaybackHistoryResponse,
  PopularTimeWindow,
  PopularTrackItem,
  PopularTracksResponse,
} from "../contracts";

import type {
  SearchType,
  SearchResponse,
  Track as ApiTrackBase,
  ApiTrackDetails,
  RadioResponse,
  ApiAlbumDetails,
  ApiArtistDetails,
  ApiCatalogPlaylistDetails,
  ApiLikedTracksPage,
  ApiUserPlaylist,
  ApiUserPlaylistItem,
  LyricsStreamEvent,
  ImportJob,
  ImportReview,
  ImportReviewDecision,
  RecordPlaybackEventRequest,
  PlaybackHistoryResponse,
  PopularTimeWindow,
  PopularTracksResponse,
} from "../contracts";

// ---- Endpoints --------------------------------------------------------------

export const api = {
  getUserProfile(idOrUsername: string): Promise<UserProfile> {
    return request<UserProfile>(`/v1/users/${encodeURIComponent(idOrUsername)}`);
  },

  searchUsers(query: string): Promise<UserProfile[]> {
    const params = new URLSearchParams({ q: query });
    return request<UserProfile[]>(`/v1/users/search?${params}`);
  },

  followUser(idOrUsername: string): Promise<void> {
    return request<void>(`/v1/users/${encodeURIComponent(idOrUsername)}/follow`, {
      method: "POST",
    });
  },

  unfollowUser(idOrUsername: string): Promise<void> {
    return request<void>(`/v1/users/${encodeURIComponent(idOrUsername)}/follow`, {
      method: "DELETE",
    });
  },

  getUserFollowers(idOrUsername: string): Promise<UserProfile[]> {
    return request<UserProfile[]>(`/v1/users/${encodeURIComponent(idOrUsername)}/followers`);
  },

  getUserFollowing(idOrUsername: string): Promise<UserProfile[]> {
    return request<UserProfile[]>(`/v1/users/${encodeURIComponent(idOrUsername)}/following`);
  },

  getUserPlaylists(idOrUsername: string): Promise<{ items: ApiUserPlaylist[] }> {
    return request<{ items: ApiUserPlaylist[] }>(`/v1/users/${encodeURIComponent(idOrUsername)}/playlists`);
  },

  getUserHistory(idOrUsername: string, cursor?: string, limit?: string): Promise<PlaybackHistoryResponse> {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    if (limit) params.set("limit", limit);
    return request<PlaybackHistoryResponse>(`/v1/users/${encodeURIComponent(idOrUsername)}/history?${params}`);
  },

  getArtistLeaderboard(artistId: string, period = "monthly", limit = 10): Promise<LeaderboardResponse> {
    const params = new URLSearchParams({ period, limit: String(limit) });
    return request<LeaderboardResponse>(`/v1/leaderboards/artist/${encodeURIComponent(artistId)}?${params}`);
  },

  getGlobalLeaderboard(period = "weekly", limit = 20): Promise<LeaderboardResponse> {
    const params = new URLSearchParams({ period, limit: String(limit) });
    return request<LeaderboardResponse>(`/v1/leaderboards/global?${params}`);
  },
  search(q: string, type: SearchType = "all"): Promise<SearchResponse> {
    const params = new URLSearchParams({ q, type });
    return clientCatalog.search(q, type, () => request<SearchResponse>(`/v1/search?${params}`));
  },

  getTrack(id: string): Promise<ApiTrackDetails> {
    return clientCatalog.getTrack(id, () =>
      request<ApiTrackDetails>(`/v1/tracks/${encodeURIComponent(id)}`),
    );
  },

  getRadio(
    id: string,
    options?: {
      history?: string[];
      k?: number;
      drift_rate?: number;
      temperature?: number;
      wave_id?: string;
    },
  ): Promise<RadioResponse> {
    const history = new Set(options?.history ?? []);
    return clientCatalog
      .getRadio(id, options?.k, () => api.getServerRadio(id, options))
      .then((response) => ({ items: response.items.filter((item) => !history.has(item.id)) }));
  },

  getServerRadio(
    id: string,
    options?: {
      history?: string[];
      k?: number;
      drift_rate?: number;
      temperature?: number;
      wave_id?: string;
    },
  ): Promise<RadioResponse> {
    if (options?.history && options.history.length > 0) {
      return request<RadioResponse>(
        `/v1/tracks/${encodeURIComponent(id)}/radio`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options),
        },
      );
    }
    const params = new URLSearchParams();
    if (options?.k) params.set("k", String(options.k));
    if (options?.drift_rate) params.set("drift_rate", String(options.drift_rate));
    if (options?.temperature) params.set("temperature", String(options.temperature));
    if (options?.wave_id) params.set("wave_id", options.wave_id);
    const qs = params.toString();
    return request<RadioResponse>(
      `/v1/tracks/${encodeURIComponent(id)}/radio${qs ? `?${qs}` : ""}`,
    );
  },

  getAlbum(id: string): Promise<ApiAlbumDetails> {
    return clientCatalog.getAlbum(id, () =>
      request<ApiAlbumDetails>(`/v1/albums/${encodeURIComponent(id)}`),
    );
  },

  getArtist(id: string): Promise<ApiArtistDetails> {
    return clientCatalog.getArtist(id, () =>
      request<ApiArtistDetails>(`/v1/artists/${encodeURIComponent(id)}`),
    );
  },

  getPlaylist(id: string): Promise<ApiCatalogPlaylistDetails> {
    return clientCatalog.getPlaylist(id, () =>
      request<ApiCatalogPlaylistDetails>(`/v1/playlists/${encodeURIComponent(id)}`),
    );
  },

  listLikedTracks(limit = 100, cursor?: string): Promise<ApiLikedTracksPage> {
    if (!musicApiAcceptsSupabaseJwt()) {
      return Promise.resolve(localMusic.listLikedTracks(limit, cursor));
    }
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return request<ApiLikedTracksPage>(`/v1/me/library/tracks?${params}`);
  },

  async likeTrack(id: string, hint?: { trackId?: unknown; title?: unknown; artists?: unknown; coverUrl?: unknown; durationMs?: unknown }): Promise<void> {
    if (!musicApiAcceptsSupabaseJwt()) {
      const current = usePlayerStore.getState().currentTrack;
      const playing = current?.id === id ? current : null;
      const hinted = typeof hint?.title === "string" && hint.title.trim() ? {
        id,
        title: hint.title,
        artists: typeof hint.artists === "string"
          ? hint.artists.split(",").map((name) => ({ id: "", name: name.trim() })).filter((artist) => artist.name)
          : [],
        durationMs: typeof hint.durationMs === "number" ? hint.durationMs : 0,
        ...(typeof hint.coverUrl === "string" && hint.coverUrl ? { cover: { url: hint.coverUrl, width: 512, height: 512 } } : {}),
      } : null;
      const track = playing ? {
        id,
        title: playing.title,
        artists: (playing.artistList?.length
          ? playing.artistList.map((artist) => ({ id: artist.id || "", name: artist.name }))
          : playing.artists.split(",").map((name) => ({ id: playing.artistId || "", name: name.trim() }))),
        durationMs: playing.durationMs,
        ...(playing.coverUrl ? { cover: { url: playing.coverUrl, width: 512, height: 512 } } : {}),
        ...(playing.album ? { album: playing.album } : {}),
      } : hinted || await clientCatalog.resolveSnapshot(id);
      if (!track) throw new Error("Track details could not be loaded.");
      localMusic.likeTrack(track);
      return;
    }
    const track = await clientCatalog.resolveSnapshot(id);
    return request<void>(
      `/v1/me/library/tracks/${encodeURIComponent(id)}`,
      { method: "PUT", ...(track ? { body: JSON.stringify({ track, trackSnapshot: track }) } : {}) },
    );
  },

  unlikeTrack(id: string): Promise<void> {
    if (!musicApiAcceptsSupabaseJwt()) {
      localMusic.unlikeTrack(id);
      return Promise.resolve();
    }
    return request<void>(
      `/v1/me/library/tracks/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },

  listSavedCollections(
    type: "albums" | "artists" | "playlists",
  ): Promise<{ items: unknown[] }> {
    if (!musicApiAcceptsSupabaseJwt()) {
      return Promise.resolve(localMusic.listSavedCollections(type));
    }
    return request<{ items: unknown[] }>(`/v1/me/library/${type}`);
  },

  async saveCollection(type: "albums" | "artists" | "playlists", id: string, hint?: { title?: string; coverUrl?: string; totalTracks?: number }): Promise<void> {
    if (!musicApiAcceptsSupabaseJwt()) {
      const hinted = hint?.title ? {
        id,
        ...(type === "artists" ? { name: hint.title } : { title: hint.title }),
        ...(hint.coverUrl ? { cover: { url: hint.coverUrl, width: 512, height: 512 } } : {}),
        ...(hint.totalTracks !== undefined ? { trackCount: hint.totalTracks } : {}),
      } : null;
      const value = hinted || (type === "albums"
        ? await api.getAlbum(id).then((album) => ({ id: album.id, title: album.title, cover: album.cover, year: album.year, trackCount: album.trackCount ?? album.tracks.length }))
        : type === "artists"
          ? await api.getArtist(id).then((artist) => ({ id: artist.id, name: artist.name, cover: artist.cover }))
          : await api.getPlaylist(id).then((playlist) => ({ id: playlist.id, title: playlist.title, author: playlist.author, cover: playlist.cover, trackCount: playlist.trackCount ?? playlist.tracks.length })));
      if (!value) throw new Error("Collection details could not be loaded.");
      localMusic.saveCollection(type, id, value);
      return;
    }
    return request<void>(
      `/v1/me/library/${type}/${encodeURIComponent(id)}`,
      { method: "PUT" },
    );
  },

  removeCollection(type: "albums" | "artists" | "playlists", id: string): Promise<void> {
    if (!musicApiAcceptsSupabaseJwt()) {
      localMusic.removeCollection(type, id);
      return Promise.resolve();
    }
    return request<void>(
      `/v1/me/library/${type}/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },

  listPlaylists(): Promise<{ items: ApiUserPlaylist[] }> {
    if (!musicApiAcceptsSupabaseJwt()) return localPlaylists.list();
    return request<{ items: ApiUserPlaylist[] }>("/v1/me/playlists");
  },

  getUserPlaylist(
    id: string,
  ): Promise<{ playlist: ApiUserPlaylist; items: ApiUserPlaylistItem[] }> {
    if (!musicApiAcceptsSupabaseJwt()) return localPlaylists.get(id);
    return request<{
      playlist: ApiUserPlaylist;
      items: ApiUserPlaylistItem[];
    }>(`/v1/me/playlists/${encodeURIComponent(id)}`);
  },

  createPlaylist(input: {
    title: string;
    description?: string;
    isPublic?: boolean;
  }): Promise<ApiUserPlaylist> {
    if (!musicApiAcceptsSupabaseJwt()) return localPlaylists.create(input);
    return request<ApiUserPlaylist>("/v1/me/playlists", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updatePlaylist(
    id: string,
    input: { title?: string; description?: string | null; isPublic?: boolean },
  ): Promise<ApiUserPlaylist> {
    if (!musicApiAcceptsSupabaseJwt()) return localPlaylists.update(id, input);
    return request<ApiUserPlaylist>(
      `/v1/me/playlists/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify(input) },
    );
  },

  deletePlaylist(id: string): Promise<void> {
    if (!musicApiAcceptsSupabaseJwt()) return localPlaylists.delete(id);
    return request<void>(`/v1/me/playlists/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },

  async addPlaylistTrack(
    playlistId: string,
    trackId: string,
    snapshot?: ApiTrackBase,
  ): Promise<ApiUserPlaylistItem> {
    const track = snapshot ?? (await clientCatalog.resolveSnapshot(trackId));
    if (!musicApiAcceptsSupabaseJwt()) {
      if (!track) throw new Error("Track could not be found.");
      return localPlaylists.addTrack(playlistId, track);
    }
    return request<ApiUserPlaylistItem>(
      `/v1/me/playlists/${encodeURIComponent(playlistId)}/tracks/${encodeURIComponent(trackId)}`,
      { method: "POST", ...(track ? { body: JSON.stringify({ track, trackSnapshot: track }) } : {}) },
    );
  },

  addPlaylistTrackSnapshots(
    playlistId: string,
    tracks: ApiTrackBase[],
  ): Promise<{ items: ApiUserPlaylistItem[]; added: number; rejected: number }> {
    if (!musicApiAcceptsSupabaseJwt()) return localPlaylists.addTracks(playlistId, tracks);
    return request<{ items: ApiUserPlaylistItem[]; added: number; rejected: number }>(
      `/v1/me/playlists/${encodeURIComponent(playlistId)}/tracks`,
      { method: "POST", body: JSON.stringify({ tracks }) },
      true,
      60_000,
    );
  },

  removePlaylistItem(playlistId: string, itemId: string): Promise<void> {
    if (!musicApiAcceptsSupabaseJwt()) return localPlaylists.removeItem(playlistId, itemId);
    return request<void>(
      `/v1/me/playlists/${encodeURIComponent(playlistId)}/items/${encodeURIComponent(itemId)}`,
      { method: "DELETE" },
    );
  },

  movePlaylistItem(
    playlistId: string,
    itemId: string,
    beforeItemId: string | null,
    revision: number,
  ): Promise<{ playlist: ApiUserPlaylist; items: ApiUserPlaylistItem[] }> {
    if (!musicApiAcceptsSupabaseJwt()) return localPlaylists.moveItem(playlistId, itemId, beforeItemId);
    return request<{
      playlist: ApiUserPlaylist;
      items: ApiUserPlaylistItem[];
    }>(
      `/v1/me/playlists/${encodeURIComponent(playlistId)}/items/${encodeURIComponent(itemId)}/move`,
      {
        method: "POST",
        body: JSON.stringify({ beforeItemId, revision }),
      },
    );
  },

  getPlaylistImport(
    importId: string,
  ): Promise<ImportJob> {
    const job = getLocalImportHandler().getJob(importId);
    return job ? Promise.resolve(job) : Promise.reject(new ApiError(404, "Import was not found."));
  },

  getPlaylistImportReview(
    importId: string,
  ): Promise<{ items: ImportReview[] }> {
    return Promise.resolve({ items: getLocalImportHandler().getReview(importId) });
  },

  decidePlaylistImportReview(
    importId: string,
    decisions: ImportReviewDecision[],
    tracks?: Track[],
    title?: string,
    description?: string,
  ): Promise<{ approved: string[]; denied: string[]; finalized?: boolean }> {
    return getLocalImportHandler()
      .finalize(importId, tracks ?? [], title, description)
      .then(({ finalized }) => ({
        approved: decisions.filter((d) => d.decision === "approve").map((d) => d.reviewId),
        denied: decisions.filter((d) => d.decision === "deny").map((d) => d.reviewId),
        finalized,
      }));
  },

  skipPlaylistImportReview(
    importId: string,
    tracks?: Track[],
    title?: string,
    description?: string,
  ): Promise<{ denied: "all"; finalized: boolean }> {
    return getLocalImportHandler()
      .finalize(importId, tracks ?? [], title, description)
      .then(({ finalized }) => ({ denied: "all" as const, finalized }));
  },

  async *streamLyrics(
    id: string,
    signal?: AbortSignal,
    hint?: { title: string; artist: string; durationMs?: number },
  ): AsyncGenerator<LyricsStreamEvent> {
    if (!musicApiAcceptsSupabaseJwt()) {
      yield* streamPublicLyrics(hint, signal);
      return;
    }
    const hintParams =
      hint?.title.trim() && hint.artist.trim()
        ? new URLSearchParams({
            title: hint.title.trim(),
            artist: hint.artist.trim(),
            ...(hint.durationMs && hint.durationMs > 0 ? { durationMs: String(Math.round(hint.durationMs)) } : {}),
          }).toString()
        : "";
    const path = `/v1/tracks/${encodeURIComponent(id)}/lyrics${hintParams ? `?${hintParams}` : ""}`;
    const signedHeaders = await signApiRequest("GET", path);
    const accessToken = musicApiAcceptsSupabaseJwt() ? await getValidAccessToken() : null;
    const requestId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const correlationHeaders: Record<string, string> = {
      "x-request-id": requestId,
      "x-client-version": CLIENT_VERSION,
      "x-platform": getPlatform(),
      "x-session-id": id,
    };

    let res: Response;
    try {
      res = await fetch(
        `${getApiBaseUrl()}${path}`,
        {
          signal,
          headers: {
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            ...correlationHeaders,
            ...signedHeaders,
          },
        },
      );
    } catch (fetchErr: any) {
      if (signal?.aborted || fetchErr?.name === "AbortError") {
        throw fetchErr;
      }
      throw fetchErr;
    }

    const lyricsDateHeader = res.headers?.get?.("date");
    if (lyricsDateHeader) {
      syncServerTime(lyricsDateHeader);
    }

    if (!res.ok || !res.body) {
      const respReqId = res.headers?.get?.("x-request-id") || requestId;
      throw new ApiError(res.status, res.statusText, undefined, respReqId);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const flushEvent = (): LyricsStreamEvent | null => {
      const sep = buffer.indexOf("\n\n");
      if (sep === -1) return null;
      const rawEvent = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      const dataLines: string[] = [];
      for (const line of rawEvent.split("\n")) {
        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trim());
        }
      }

      if (dataLines.length === 0) return null;
      try {
        return JSON.parse(dataLines.join("\n")) as LyricsStreamEvent;
      } catch {
        return null;
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let event = flushEvent();
        while (event) {
          yield event;
          event = flushEvent();
        }
      }

      buffer += decoder.decode();
      let event = flushEvent();
      while (event) {
        yield event;
        event = flushEvent();
      }
    } finally {
      reader.releaseLock();
    }
  },


  recordPlaybackEvent(payload: RecordPlaybackEventRequest): Promise<void> {
    if (!musicApiAcceptsSupabaseJwt()) {
      localMusic.recordPlaybackEvent(payload);
      if (typeof window !== "undefined") window.dispatchEvent(new Event("history:changed"));
      return Promise.resolve();
    }
    return request<void>("/v1/me/playback/events", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getHistory(cursor?: string, limit = 30): Promise<PlaybackHistoryResponse> {
    if (!musicApiAcceptsSupabaseJwt()) {
      return Promise.resolve(localMusic.getHistory(cursor, limit));
    }
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return request<PlaybackHistoryResponse>(`/v1/me/history?${params}`);
  },

  async getPopularTracks(
    window: PopularTimeWindow = "7d",
    limit = 50,
  ): Promise<PopularTracksResponse> {
    if (!musicApiAcceptsSupabaseJwt()) {
      const query = window === "all" ? "greatest hits music" : window === "30d" ? "new popular music" : "top hits music";
      let tracks: ApiTrackBase[] = [];
      try {
        tracks = (await innertubeCatalog.search(query, "track"))
          .filter((item): item is ApiTrackBase & { type: "track" } => item.type === "track")
          .slice(0, limit);
      } catch {
        // Home can still show saved music while discovery is offline.
      }
      if (tracks.length === 0) tracks = localMusic.listLikedTracks(limit).items.map(({ track }) => track);
      return {
        window,
        generatedAt: new Date().toISOString(),
        items: tracks.map((track, index) => ({
          rank: index + 1,
          track,
          playCount: 0,
          uniqueListeners: 0,
          score: 0,
        })),
      };
    }
    const params = new URLSearchParams({ window, limit: String(limit) });
    return request<PopularTracksResponse>(`/v1/explore/popular?${params}`);
  },

  getDailyMixes(): Promise<DailyMixesResponse> {
    if (!musicApiAcceptsSupabaseJwt()) {
      const tracks = localMusic.listLikedTracks(50).items.map(({ track }) => track);
      return Promise.resolve({
        items: tracks.length >= 3 ? [{
          id: "wavo-liked-mix",
          title: "Dein Mix",
          description: "Musik aus deinen Favoriten",
          clusterArtists: [...new Set(tracks.flatMap((track) => track.artists.map((artist) => artist.name)))].slice(0, 4),
          cover: tracks[0].cover,
          trackCount: tracks.length,
          tracks,
        }] : [],
        generatedAt: new Date().toISOString(),
      });
    }
    return request<DailyMixesResponse>("/v1/me/recommendations/daily-mixes");
  },
};
