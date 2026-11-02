import type { Track } from "@/shared/types";

export const OFFLINE_DOWNLOAD_REQUEST = "wavo:offline-download-request";
export type AutomaticDownloadReason = "favorites" | "playlists";
export interface OfflineDownloadRequest {
  reason: AutomaticDownloadReason;
  tracks: Track[];
}

export function requestAutomaticDownload(reason: AutomaticDownloadReason, tracks: Track[]) {
  if (typeof window !== "undefined" && tracks.length) {
    window.dispatchEvent(new CustomEvent<OfflineDownloadRequest>(OFFLINE_DOWNLOAD_REQUEST, { detail: { reason, tracks } }));
  }
}
