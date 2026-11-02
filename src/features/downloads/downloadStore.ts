import { create } from "zustand";
import { resolvePlaybackStream } from "@/features/player/engine/streamResolver";
import { downloadAudioBytes } from "@/shared/media/innertube";
import { audioCache, wavoDb } from "@/shared/storage";
import { isStandaloneAudioFile } from "@/shared/storage/audioFormat";
import type { Track } from "@/shared/types";

const MAX_DOWNLOAD_BYTES = 150 * 1024 * 1024;
const activeDownloads = new Map<string, AbortController>();
const pendingDownloads = new Map<string, Promise<void>>();
const waiting: Array<() => void> = [];
let running = 0;
let revision = 0;

async function downloadSlot(signal: AbortSignal): Promise<() => void> {
  if (running >= 2) {
    await new Promise<void>((resolve, reject) => {
      const resume = () => { signal.removeEventListener("abort", abort); resolve(); };
      const abort = () => {
        const index = waiting.indexOf(resume);
        if (index >= 0) waiting.splice(index, 1);
        reject(new DOMException("Download abgebrochen", "AbortError"));
      };
      waiting.push(resume);
      signal.addEventListener("abort", abort, { once: true });
    });
  } else {
    running++;
  }
  return () => {
    const next = waiting.shift();
    if (next) next();
    else running--;
  };
}

type DownloadStatus = "queued" | "downloading" | "removing";

interface DownloadState {
  tracks: Track[];
  hydrated: boolean;
  statusById: Record<string, DownloadStatus>;
  hydrate: () => Promise<void>;
  download: (track: Track) => Promise<void>;
  downloadMany: (tracks: Track[]) => Promise<{ failed: number }>;
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
    const startedAt = revision;
    const records = await wavoDb.getPinnedAudioRecords();
    if (startedAt === revision) {
      set({ tracks: records.map((record) => record.downloadTrack!).sort((a, b) => a.title.localeCompare(b.title)), hydrated: true });
    } else set({ hydrated: true });
  },
  download: (track) => {
    const pending = pendingDownloads.get(track.id);
    if (pending) return pending;
    if (get().tracks.some((saved) => saved.id === track.id)) return Promise.resolve();
    if (get().statusById[track.id] === "removing") return Promise.reject(new Error("Download wird entfernt."));
    const controller = new AbortController();
    activeDownloads.set(track.id, controller);
    set((state) => ({ statusById: { ...state.statusById, [track.id]: "queued" } }));
    const task = (async () => {
      const release = await downloadSlot(controller.signal);
      try {
        if (controller.signal.aborted) throw new DOMException("Download abgebrochen", "AbortError");
        set((state) => ({ statusById: { ...state.statusById, [track.id]: "downloading" } }));
        const blob = await completeAudioBlob(track, controller.signal);
        if (controller.signal.aborted) throw new DOMException("Download abgebrochen", "AbortError");
        await wavoDb.pinAudio(track, blob);
        revision++;
        set((state) => ({ tracks: [...state.tracks.filter((saved) => saved.id !== track.id), track].sort((a, b) => a.title.localeCompare(b.title)) }));
        await audioCache.enforceCacheLimit();
      } finally { release(); }
    })().finally(() => {
      activeDownloads.delete(track.id);
      pendingDownloads.delete(track.id);
      set((state) => {
        const next = { ...state.statusById };
        delete next[track.id];
        return { statusById: next };
      });
    });
    pendingDownloads.set(track.id, task);
    return task;
  },
  downloadMany: async (tracks) => {
    const unique = [...new Map(tracks.map((track) => [track.id, track])).values()];
    const results = await Promise.allSettled(unique.map((track) => get().download(track)));
    return { failed: results.filter((result) => result.status === "rejected").length };
  },
  remove: async (trackId) => {
    if (get().statusById[trackId]) return;
    set((state) => ({ statusById: { ...state.statusById, [trackId]: "removing" } }));
    try {
      await audioCache.deleteAudio(trackId);
      revision++;
      set((state) => ({ tracks: state.tracks.filter((track) => track.id !== trackId) }));
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
