import { create } from "zustand";
import { resolvePlaybackStream } from "@/features/player/engine/streamResolver";
import { downloadAudioBytes } from "@/shared/media/innertube";
import { audioCache, wavoDb } from "@/shared/storage";
import { isStandaloneAudioFile } from "@/shared/storage/audioFormat";
import type { Track } from "@/shared/types";

const MAX_DOWNLOAD_BYTES = 150 * 1024 * 1024;
const activeDownloads = new Map<string, AbortController>();

type DownloadStatus = "downloading" | "removing";

interface DownloadState {
  tracks: Track[];
  hydrated: boolean;
  statusById: Record<string, DownloadStatus>;
  hydrate: () => Promise<void>;
  download: (track: Track) => Promise<void>;
  remove: (trackId: string) => Promise<void>;
  cancel: (trackId: string) => void;
}

async function completeAudioBlob(track: Track, signal: AbortSignal): Promise<Blob> {
  const cached = await wavoDb.getAudio(track.id);
  if (cached?.blob.size && isStandaloneAudioFile(new Uint8Array(await cached.blob.slice(0, 16).arrayBuffer()))) {
    return cached.blob;
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("Für diesen Song ist noch kein Offline-Download vorhanden.");
  }

  const stream = await resolvePlaybackStream(track, signal);
  if (stream.contentLength && stream.contentLength > MAX_DOWNLOAD_BYTES) {
    throw new Error("Diese Audiodatei ist für einen Offline-Download zu groß.");
  }
  const blob = stream.blob ?? (() => {
    if (!stream.url) throw new Error("Für diesen Song ist kein Download verfügbar.");
    return downloadAudioBytes(stream.url, { contentLength: stream.contentLength, signal })
      .then((bytes) => bytes ? new Blob([bytes], { type: stream.mimeType }) : null);
  })();
  const resolved = await blob;
  if (!resolved?.size || resolved.size > MAX_DOWNLOAD_BYTES) {
    throw new Error("Der Song konnte nicht vollständig heruntergeladen werden.");
  }
  const header = new Uint8Array(await resolved.slice(0, 16).arrayBuffer());
  if (!isStandaloneAudioFile(header)) {
    throw new Error("Die Quelle liefert keine speicherbare Audiodatei.");
  }
  if (signal.aborted) throw new DOMException("Download abgebrochen", "AbortError");
  return resolved;
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  tracks: [],
  hydrated: false,
  statusById: {},
  hydrate: async () => {
    const records = await wavoDb.getPinnedAudioRecords();
    set({ tracks: records.map((record) => record.downloadTrack!).sort((a, b) => a.title.localeCompare(b.title)), hydrated: true });
  },
  download: async (track) => {
    if (activeDownloads.has(track.id) || get().statusById[track.id]) return;
    const controller = new AbortController();
    activeDownloads.set(track.id, controller);
    set((state) => ({ statusById: { ...state.statusById, [track.id]: "downloading" } }));
    try {
      const blob = await completeAudioBlob(track, controller.signal);
      if (controller.signal.aborted) throw new DOMException("Download abgebrochen", "AbortError");
      await wavoDb.pinAudio(track, blob);
      await audioCache.enforceCacheLimit();
      await get().hydrate();
    } finally {
      activeDownloads.delete(track.id);
      set((state) => {
        const next = { ...state.statusById };
        delete next[track.id];
        return { statusById: next };
      });
    }
  },
  remove: async (trackId) => {
    if (get().statusById[trackId]) return;
    set((state) => ({ statusById: { ...state.statusById, [trackId]: "removing" } }));
    try {
      await audioCache.deleteAudio(trackId);
      await get().hydrate();
    } finally {
      set((state) => {
        const next = { ...state.statusById };
        delete next[trackId];
        return { statusById: next };
      });
    }
  },
  cancel: (trackId) => activeDownloads.get(trackId)?.abort(),
}));
