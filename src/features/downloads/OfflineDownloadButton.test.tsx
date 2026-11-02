import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { create } from "zustand";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OfflineDownloadButton } from "./OfflineDownloadButton";
import type { Track } from "@/shared/types";

vi.mock("./downloadStore", () => ({ useDownloadStore: create(() => ({
  hydrated: true, tracks: [] as Track[], statusById: {} as Record<string, string>, downloadMany: vi.fn(),
})) }));
vi.mock("@/shared/ui/Toast", () => ({ showToast: vi.fn() }));
import { useDownloadStore } from "./downloadStore";
const track = (id: string): Track => ({ id, title: id, artists: "Artist", coverUrl: "", durationMs: 1000, playCount: 0 });

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useDownloadStore.setState({ hydrated: true, tracks: [], statusById: {}, downloadMany: vi.fn().mockResolvedValue({ failed: 0 }) });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("offline download button", () => {
  it("downloads missing playlist songs with one click and disappears when complete", async () => {
    const songs = [track("saved"), track("missing")];
    useDownloadStore.setState({ tracks: [songs[0]] });
    const play = vi.fn();
    await act(async () => root.render(<div onClick={play}><OfflineDownloadButton tracks={songs} /></div>));
    await act(async () => container.querySelector("button")!.click());
    expect(play).not.toHaveBeenCalled();
    expect(useDownloadStore.getState().downloadMany).toHaveBeenCalledWith([songs[1]]);
    await act(async () => useDownloadStore.setState({ tracks: songs }));
    expect(container.querySelector("button")).toBeNull();
  });

  it("disables repeated clicks while queued and restores the button after failure", async () => {
    await act(async () => {
      useDownloadStore.setState({ statusById: { song: "queued" } });
      root.render(<OfflineDownloadButton compact tracks={[track("song")]} />);
    });
    expect(container.querySelector("button")!.disabled).toBe(true);
    await act(async () => useDownloadStore.setState({ statusById: {} }));
    expect(container.querySelector("button")!.disabled).toBe(false);
    await act(async () => useDownloadStore.setState({ tracks: [track("song")] }));
    expect(container.querySelector("button")).toBeNull();
  });
});
