// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlaylistsList } from "./usePlaylists";
import { api } from "@/shared/api";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const authState = vi.hoisted(() => ({ userId: "playlist-user-1" }));

vi.mock("@/shared/api", () => ({
  api: { listPlaylists: vi.fn(), getUserPlaylist: vi.fn() },
  getAuthSession: () => ({ accessToken: "test-token", user: { id: authState.userId } }),
  mediaUrl: (url: string) => url,
  toClientTrack: (track: unknown) => track,
}));

describe("usePlaylistsList", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    authState.userId = "playlist-user-1";
    localStorage.clear();
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    (api.getUserPlaylist as any).mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it("ignores an old account's playlist response after switching accounts", async () => {
    let resolveOld!: (value: any) => void;
    const oldRequest = new Promise<any>((resolve) => { resolveOld = resolve; });
    (api.listPlaylists as any)
      .mockImplementationOnce(() => oldRequest)
      .mockResolvedValue({ items: [{ id: "new-list", title: "New", updatedAt: "2026-10-18" }] });

    let result: ReturnType<typeof usePlaylistsList> | undefined;
    function TestComponent() {
      result = usePlaylistsList();
      return null;
    }
    await act(async () => { root.render(<TestComponent />); });
    authState.userId = "playlist-user-2";
    await act(async () => { window.dispatchEvent(new Event("auth:changed")); });
    expect(result?.data.playlists.map((playlist) => playlist.id)).toEqual(["new-list"]);

    await act(async () => {
      resolveOld({ items: [{ id: "old-list", title: "Old", updatedAt: "2026-10-17" }] });
      await oldRequest;
    });
    expect(result?.data.playlists.map((playlist) => playlist.id)).toEqual(["new-list"]);
  });
});
