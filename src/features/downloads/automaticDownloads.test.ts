import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startAutomaticDownloads, useAutomaticDownloadStore } from "./automaticDownloads";
import { useDownloadStore } from "./downloadStore";
import { requestAutomaticDownload } from "@/shared/events/offlineDownloads";
import type { Track } from "@/shared/types";

const download = vi.hoisted(() => vi.fn());
vi.mock("./downloadStore", () => ({ useDownloadStore: { getState: () => ({ download }) } }));
const track = (id: string): Track => ({ id, title: id, artists: "Artist", coverUrl: "", durationMs: 1000, playCount: 0 });
let stop: (() => void) | undefined;

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  useAutomaticDownloadStore.setState({ favorites: true, playlists: true, pending: [] });
  download.mockResolvedValue(undefined);
});
afterEach(() => { stop?.(); stop = undefined; vi.restoreAllMocks(); });

describe("automatic offline downloads", () => {
  it("respects independent persisted settings for favorites and playlists", async () => {
    useAutomaticDownloadStore.getState().setEnabled("favorites", false);
    stop = startAutomaticDownloads(vi.fn());
    requestAutomaticDownload("favorites", [track("favorite")]);
    requestAutomaticDownload("playlists", [track("playlist")]);
    await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(download).toHaveBeenCalledWith(track("playlist"));
    await useAutomaticDownloadStore.persist.rehydrate();
    expect(useAutomaticDownloadStore.getState().favorites).toBe(false);
    expect(useAutomaticDownloadStore.getState().playlists).toBe(true);
  });

  it("keeps offline requests across restarts and downloads when online again", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    stop = startAutomaticDownloads(vi.fn());
    requestAutomaticDownload("favorites", [track("offline")]);
    requestAutomaticDownload("playlists", [track("offline")]);
    expect(download).not.toHaveBeenCalled();
    expect(useAutomaticDownloadStore.getState().pending).toHaveLength(1);
    await useAutomaticDownloadStore.persist.rehydrate();
    stop();
    stop = startAutomaticDownloads(vi.fn());
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(useAutomaticDownloadStore.getState().pending).toEqual([]));
    expect(useDownloadStore.getState().download).toHaveBeenCalledTimes(1);
  });

  it("keeps failed songs pending, continues with new songs and retries on reconnect", async () => {
    const failure = vi.fn();
    download.mockRejectedValueOnce(new Error("Network error"));
    stop = startAutomaticDownloads(failure);
    requestAutomaticDownload("playlists", [track("bad"), track("good")]);
    await vi.waitFor(() => expect(failure).toHaveBeenCalledWith(1));
    expect(download).toHaveBeenCalledTimes(2);
    expect(useAutomaticDownloadStore.getState().pending.map((item) => item.track.id)).toEqual(["bad"]);
    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(useAutomaticDownloadStore.getState().pending).toEqual([]));
    expect(download).toHaveBeenCalledTimes(3);
  });

  it("drops pending requests when their setting is turned off", () => {
    useAutomaticDownloadStore.getState().enqueue({ reason: "favorites", tracks: [track("favorite")] });
    useAutomaticDownloadStore.getState().enqueue({ reason: "playlists", tracks: [track("playlist")] });
    useAutomaticDownloadStore.getState().setEnabled("favorites", false);
    expect(useAutomaticDownloadStore.getState().pending.map((item) => item.track.id)).toEqual(["playlist"]);
  });
});
