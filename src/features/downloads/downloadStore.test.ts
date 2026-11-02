import { Blob as NodeBlob } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDownloadStore } from "./downloadStore";
import { resolvePlaybackStream, type PlaybackStream } from "@/features/player/engine/streamResolver";
import { audioCache, wavoDb } from "@/shared/storage";
import type { Track } from "@/shared/types";

vi.mock("@/features/player/engine/streamResolver", () => ({ resolvePlaybackStream: vi.fn() }));
vi.mock("@/shared/media/innertube", () => ({ downloadAudioBytes: vi.fn() }));
vi.mock("@/shared/storage", () => ({
  wavoDb: { getAudio: vi.fn(), pinAudio: vi.fn(), getPinnedAudioRecords: vi.fn() },
  audioCache: { enforceCacheLimit: vi.fn(), deleteAudio: vi.fn() },
}));

const track = (id: string): Track => ({ id, title: id, artists: "Artist", coverUrl: "", durationMs: 1000, playCount: 0 });
const stream: PlaybackStream = {
  blob: new NodeBlob(["OggS1234567890123456"], { type: "audio/ogg" }) as unknown as Blob,
  mimeType: "audio/ogg", codec: "opus", bitrate: 128000, expiresAtMs: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  useDownloadStore.setState({ tracks: [], statusById: {}, hydrated: true });
  vi.mocked(resolvePlaybackStream).mockResolvedValue(stream);
  vi.mocked(wavoDb.getPinnedAudioRecords).mockResolvedValue([]);
});

describe("offline download queue", () => {
  it("limits concurrent downloads, skips saved songs and shares overlapping requests", async () => {
    useDownloadStore.setState({ tracks: [track("saved")] });
    const releases = new Map<string, (value: PlaybackStream) => void>();
    vi.mocked(resolvePlaybackStream).mockImplementation((item) => new Promise((resolve) => { releases.set(item.id, resolve); }));
    const batch = useDownloadStore.getState().downloadMany([track("saved"), track("one"), track("two"), track("three"), track("one")]);
    const overlap = useDownloadStore.getState().download(track("one"));
    await vi.waitFor(() => expect(releases.size).toBe(2));
    expect(useDownloadStore.getState().statusById.three).toBe("queued");
    releases.get("one")!(stream);
    await overlap;
    await vi.waitFor(() => expect(releases.has("three")).toBe(true));
    releases.get("two")!(stream);
    releases.get("three")!(stream);
    expect(await batch).toEqual({ failed: 0 });
    expect(resolvePlaybackStream).toHaveBeenCalledTimes(3);
    expect(wavoDb.pinAudio).toHaveBeenCalledTimes(3);
    expect(useDownloadStore.getState().tracks.map((item) => item.id).sort()).toEqual(["one", "saved", "three", "two"]);
  });

  it("continues a playlist after a failure and retries only missing songs", async () => {
    vi.mocked(resolvePlaybackStream).mockRejectedValueOnce(new Error("Unavailable"));
    const songs = [track("bad"), track("good")];
    expect(await useDownloadStore.getState().downloadMany(songs)).toEqual({ failed: 1 });
    expect(useDownloadStore.getState().tracks.map((item) => item.id)).toEqual(["good"]);
    expect(await useDownloadStore.getState().downloadMany(songs)).toEqual({ failed: 0 });
    expect(resolvePlaybackStream).toHaveBeenCalledTimes(3);
    expect(useDownloadStore.getState().statusById).toEqual({});
  });

  it("cancels a queued song without starting its network request", async () => {
    const releases: Array<(value: PlaybackStream) => void> = [];
    vi.mocked(resolvePlaybackStream).mockImplementation(() => new Promise((resolve) => { releases.push(resolve); }));
    const batch = useDownloadStore.getState().downloadMany([track("one"), track("two"), track("cancel")]);
    await vi.waitFor(() => expect(releases.length).toBe(2));
    useDownloadStore.getState().cancel("cancel");
    releases.forEach((release) => release(stream));
    expect(await batch).toEqual({ failed: 1 });
    expect(resolvePlaybackStream).toHaveBeenCalledTimes(2);
    expect(useDownloadStore.getState().statusById).toEqual({});
  });

  it("does not overwrite a new download with an older hydration result", async () => {
    let finish!: (value: []) => void;
    vi.mocked(wavoDb.getPinnedAudioRecords).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const hydration = useDownloadStore.getState().hydrate();
    await useDownloadStore.getState().download(track("new"));
    finish([]);
    await hydration;
    expect(useDownloadStore.getState().tracks.map((item) => item.id)).toEqual(["new"]);
    await useDownloadStore.getState().remove("new");
    expect(audioCache.deleteAudio).toHaveBeenCalledWith("new");
    expect(useDownloadStore.getState().tracks).toEqual([]);
  });
});
