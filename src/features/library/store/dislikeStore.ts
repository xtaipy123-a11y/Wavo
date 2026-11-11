import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getAuthSession } from "@/shared/api/auth-session";
import { getFavoritesOwnerId } from "@/shared/api/favoritesIdentity";
import { debouncedStorage } from "@/shared/utils/storage";
import type { Track } from "@/shared/types";

export interface DislikedTrack extends Track {
  dislikedAt: number;
}

type DislikesByOwner = Record<string, DislikedTrack[]>;

interface DislikeStore {
  byOwner: DislikesByOwner;
  addDislike: (ownerId: string, track: Track) => void;
  removeDislike: (ownerId: string, trackId: string) => void;
  toggleDislike: (ownerId: string, track: Track) => boolean;
  clearDislikes: (ownerId: string) => void;
}

const EMPTY_DISLIKES: DislikedTrack[] = [];
const STORAGE_KEY = "wavo_disliked_tracks_v1";

export function getDislikeOwnerId(): string {
  return getFavoritesOwnerId(getAuthSession()?.user?.id) ?? "local";
}

export const useDislikeStore = create<DislikeStore>()(
  persist(
    (set, get) => ({
      byOwner: {},
      addDislike: (ownerId, track) =>
        set((state) => {
          const existing = state.byOwner[ownerId] ?? EMPTY_DISLIKES;
          if (existing.some((item) => item.id === track.id)) return state;
          return {
            byOwner: {
              ...state.byOwner,
              [ownerId]: [
                { ...track, dislikedAt: Date.now() },
                ...existing,
              ],
            },
          };
        }),
      removeDislike: (ownerId, trackId) =>
        set((state) => {
          const existing = state.byOwner[ownerId];
          if (!existing) return state;
          return {
            byOwner: {
              ...state.byOwner,
              [ownerId]: existing.filter((item) => item.id !== trackId),
            },
          };
        }),
      toggleDislike: (ownerId, track) => {
        const existing = get().byOwner[ownerId] ?? EMPTY_DISLIKES;
        if (existing.some((item) => item.id === track.id)) {
          get().removeDislike(ownerId, track.id);
          return false;
        }
        get().addDislike(ownerId, track);
        return true;
      },
      clearDislikes: (ownerId) =>
        set((state) => ({
          byOwner: { ...state.byOwner, [ownerId]: [] },
        })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => debouncedStorage),
      partialize: (state) => ({ byOwner: state.byOwner }),
    },
  ),
);

export function getDislikedTracks(): DislikedTrack[] {
  return useDislikeStore.getState().byOwner[getDislikeOwnerId()] ?? EMPTY_DISLIKES;
}

export function getDislikedTrackIds(): Set<string> {
  return new Set(getDislikedTracks().map((track) => track.id));
}

export function isTrackDisliked(trackId: string | undefined): boolean {
  if (!trackId) return false;
  return getDislikedTrackIds().has(trackId);
}

function subscribeToAuth(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("auth:changed", listener);
  return () => window.removeEventListener("auth:changed", listener);
}

function getOwnerSnapshot(): string {
  return getDislikeOwnerId();
}

export function useDislikeOwnerId(): string {
  const [ownerId, setOwnerId] = useState(getOwnerSnapshot);

  useEffect(() => {
    const update = () => setOwnerId(getOwnerSnapshot());
    update();
    return subscribeToAuth(update);
  }, []);

  return ownerId;
}

export function useDislikedTracks(): DislikedTrack[] {
  const ownerId = useDislikeOwnerId();
  return useDislikeStore((state) => state.byOwner[ownerId] ?? EMPTY_DISLIKES);
}

export function useIsTrackDisliked(trackId: string | undefined): boolean {
  const dislikedTracks = useDislikedTracks();
  if (!trackId) return false;
  return dislikedTracks.some((track) => track.id === trackId);
}
