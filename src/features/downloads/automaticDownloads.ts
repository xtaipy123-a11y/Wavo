import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Track } from "@/shared/types";
import { OFFLINE_DOWNLOAD_REQUEST, type AutomaticDownloadReason, type OfflineDownloadRequest } from "@/shared/events/offlineDownloads";
import { useDownloadStore } from "./downloadStore";

interface PendingDownload { track: Track; reason: AutomaticDownloadReason }
interface AutomaticDownloadState {
  favorites: boolean;
  playlists: boolean;
  pending: PendingDownload[];
  setEnabled: (reason: AutomaticDownloadReason, enabled: boolean) => void;
  enqueue: (request: OfflineDownloadRequest) => void;
}

export const useAutomaticDownloadStore = create<AutomaticDownloadState>()(persist((set, get) => ({
  favorites: true,
  playlists: true,
  pending: [],
  setEnabled: (reason, enabled) => set((state) => ({
    [reason]: enabled,
    pending: enabled ? state.pending : state.pending.filter((entry) => entry.reason !== reason),
  })),
  enqueue: ({ reason, tracks }) => {
    if (!get()[reason]) return;
    set((state) => ({ pending: [...new Map([
      ...state.pending.map((entry) => [entry.track.id, entry] as const),
      ...tracks.map((track) => [track.id, { track, reason }] as const),
    ]).values()] }));
  },
}), { name: "wavo-automatic-downloads" }));

export function startAutomaticDownloads(onFailure: (count: number) => void) {
  let stopped = false;
  let processing = false;
  const process = async () => {
    if (processing || stopped || !navigator.onLine) return;
    processing = true;
    let failed = 0;
    const attempted = new Set<string>();
    try {
      while (!stopped && navigator.onLine) {
        const state = useAutomaticDownloadStore.getState();
        const entry = state.pending.find((item) => state[item.reason] && !attempted.has(item.track.id));
        if (!entry) break;
        attempted.add(entry.track.id);
        try {
          await useDownloadStore.getState().download(entry.track);
          useAutomaticDownloadStore.setState((current) => ({ pending: current.pending.filter((item) => item.track.id !== entry.track.id) }));
        } catch { failed++; }
      }
    } finally {
      processing = false;
      if (failed && !stopped) onFailure(failed);
    }
  };
  const request = (event: Event) => {
    useAutomaticDownloadStore.getState().enqueue((event as CustomEvent<OfflineDownloadRequest>).detail);
    void process();
  };
  const online = () => { void process(); };
  window.addEventListener(OFFLINE_DOWNLOAD_REQUEST, request);
  window.addEventListener("online", online);
  void process();
  return () => {
    stopped = true;
    window.removeEventListener(OFFLINE_DOWNLOAD_REQUEST, request);
    window.removeEventListener("online", online);
  };
}
