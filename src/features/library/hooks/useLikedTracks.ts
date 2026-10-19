import { useEffect, useSyncExternalStore } from "react";
import { api, getAuthSession, toClientTrack } from "@/shared/api";
import type { Track } from "@/shared/types";

type LikedData = { tracks: Track[]; total: number };
const EMPTY: LikedData = { tracks: [], total: 0 };
let cache: LikedData = EMPTY;
let loaded = false;
let request: Promise<void> | null = null;
const listeners = new Set<() => void>();
let view = { data: cache, isLoading: true };

const optimisticOverrides = new Map<string, { liked: boolean; track?: Track; pending: boolean }>();
let ownerId: string | null = null;
let generation = 0;
let refreshQueued = false;

function buildView(isLoading: boolean): { data: LikedData; isLoading: boolean } {
  if (optimisticOverrides.size === 0) return { data: cache, isLoading };

  let tracks = cache.tracks.filter(
    (t) => optimisticOverrides.get(t.id)?.liked !== false
  );
  for (const [id, override] of optimisticOverrides) {
    if (override.liked && !tracks.some((t) => t.id === id)) {
      tracks = [
        override.track ?? {
          id,
          title: "",
          artists: "",
          artistId: undefined,
          coverUrl: "",
          durationMs: 0,
          playCount: 0,
        } as Track,
        ...tracks,
      ];
    }
  }
  return { data: { tracks, total: tracks.length }, isLoading };
}

function emit(isLoading = false) {
  view = buildView(isLoading);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot() {
  return view;
}

const SERVER_SNAPSHOT = { data: EMPTY, isLoading: true };

function load(force = false): Promise<void> {
  const session = getAuthSession();
  const nextOwnerId = session?.accessToken ? session.user?.id ?? null : null;
  if (nextOwnerId !== ownerId) {
    ownerId = nextOwnerId;
    generation++;
    cache = EMPTY;
    loaded = false;
    request = null;
    refreshQueued = false;
    optimisticOverrides.clear();
    emit(Boolean(nextOwnerId));
  }
  if (!nextOwnerId) {
    emit(false);
    return Promise.resolve();
  }
  if (request) {
    if (force) refreshQueued = true;
    return request;
  }
  if (loaded && !force) return Promise.resolve();

  if (!loaded) emit(true);
  const requestGeneration = generation;

  request = (async () => {
    const tracks: Track[] = [];
    let cursor: string | undefined;
    do {
      const page = await api.listLikedTracks(100, cursor);
      if (requestGeneration !== generation) return;
      tracks.push(...page.items.map(({ track }) => toClientTrack(track)));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    if (requestGeneration !== generation) return;
    cache = { tracks, total: tracks.length };
    loaded = true;
    if (!refreshQueued) {
      for (const [id, override] of optimisticOverrides) {
        if (!override.pending) optimisticOverrides.delete(id);
      }
    }
  })()
    .catch(() => {
      if (requestGeneration !== generation) return;
      if (!loaded) cache = EMPTY;
    })
    .finally(() => {
      if (requestGeneration !== generation) return;
      request = null;
      emit(false);
      if (refreshQueued) {
        refreshQueued = false;
        void load(true);
      }
    });
  return request;
}

export function applyOptimisticLike(trackId: string, track?: Track): () => void {
  const prev = optimisticOverrides.get(trackId);
  optimisticOverrides.set(trackId, { liked: true, track, pending: true });
  emit(false);
  return () => {
    if (prev === undefined) optimisticOverrides.delete(trackId);
    else optimisticOverrides.set(trackId, prev);
    emit(false);
  };
}

export function applyOptimisticUnlike(trackId: string): () => void {
  const prev = optimisticOverrides.get(trackId);
  optimisticOverrides.set(trackId, { liked: false, pending: true });
  emit(false);
  return () => {
    if (prev === undefined) optimisticOverrides.delete(trackId);
    else optimisticOverrides.set(trackId, prev);
    emit(false);
  };
}

export function settleOptimisticLike(trackId: string): void {
  const override = optimisticOverrides.get(trackId);
  if (override) optimisticOverrides.set(trackId, { ...override, pending: false });
}

if (typeof window !== "undefined") {
  const handleRefresh = () => {
    void load(true);
  };
  window.addEventListener("library:changed", handleRefresh);
  window.addEventListener("auth:changed", handleRefresh);
}

export function useLikedTracks(_params?: { limit?: number; offset?: number }) {
  const state = useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT);
  useEffect(() => {
    void load();
  }, []);
  return state;
}

export function useLikedTrackCount() {
  const { data, isLoading } = useLikedTracks();
  return { data: data.total, isLoading };
}
