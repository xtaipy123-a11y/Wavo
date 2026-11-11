import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const emptyDiscovery = () => ({ tracks: [] as any[], albums: [] as any[], artists: [] as any[], categoryShelves: [] as any[], playlistShelves: [] as any[] });
const { state, retry, play } = vi.hoisted(() => ({
  state: {
    discovery: { data: { tracks: [] as any[], albums: [] as any[], artists: [] as any[], categoryShelves: [] as any[], playlistShelves: [] as any[] }, isLoading: false, error: false },
    recent: [] as any[],
    recommended: [] as any[],
  },
  retry: vi.fn(), play: vi.fn(),
}));
vi.mock("../hooks/useHomeDiscovery", () => ({ useHomeDiscovery: () => ({ ...state.discovery, retry }) }));
vi.mock("../hooks/useRecentlyPlayed", () => ({ useRecentlyPlayed: () => ({ data: state.recent, isLoading: false }) }));
vi.mock("../hooks/useDailyMixes", () => ({ useDailyMixes: () => ({ data: [] }) }));
vi.mock("../hooks/useRecommendations", () => ({ useRecommendations: () => ({ data: state.recommended, isLoading: false }) }));
vi.mock("@/features/auth/store/authStore", () => ({ useAuthStore: (fn: any) => fn({ user: { displayName: "Test User" } }) }));
vi.mock("@/features/library/hooks/useLikedTracks", () => ({ useLikedTracks: () => ({ data: { total: 0 } }) }));
vi.mock("@/features/player", () => ({ playerEngine: { playTrack: play } }));
vi.mock("@/features/settings/store/customizationStore", () => ({ useIsContentTransparent: () => false }));
vi.mock("@/languages", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("./HomePageSkeleton", () => ({ default: () => <div>Loading music</div> }));
vi.mock("./PopularTracksSection", () => ({ default: ({ title, items }: any) => <section>{title}: {items.map((entry: any) => entry.item.title ?? entry.item.name).join(", ")}</section> }));
const Card = ({ title, onPlay }: any) => <button onClick={onPlay}>{title}</button>;
vi.mock("@/features/player/ui/SongCard", () => ({ default: (props: any) => <Card {...props} /> }));
vi.mock("@/features/player/ui/SongCardWithMenu", () => ({ default: (props: any) => <Card {...props} /> }));
import HomePage from "./HomePage";

describe("home display", () => {
  let container: HTMLDivElement, root: Root;
  const render = async () => { await act(async () => root.render(<MemoryRouter><HomePage /></MemoryRouter>)); };
  beforeEach(() => {
    state.discovery = { data: emptyDiscovery(), isLoading: false, error: false }; state.recent = []; state.recommended = [];
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    vi.clearAllMocks();
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  it("shows a greeting and liked songs immediately on a fresh account while discovery loads", async () => {
    state.discovery.isLoading = true; await render();
    expect(container.textContent).toContain("Test User");
    expect(container.textContent).toContain("library.liked_songs");
    expect(container.textContent).toContain("Loading music");
  });
  it("renders discovery tracks and history even with fewer than five recent tracks", async () => {
    const entry = { type: "track", item: { id: "track", title: "Recent song" }, playCount: 1 };
    state.recent = [entry];
    state.discovery.data = { ...emptyDiscovery(), tracks: [{ ...entry, item: { id: "discover", title: "Discovery song" } }] };
    await render();
    expect(container.textContent).toContain("home.discover: Discovery song");
    expect(container.textContent).toContain("home.jumpBackIn: Recent song");
    const quick = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Recent song")!;
    await act(async () => quick.click());
    expect(play).toHaveBeenCalledWith(entry.item, [entry.item], "Recent song Radio", undefined);
  });
  it("renders extra discovery rows for albums, artists and curated playlists", async () => {
    const album = { type: "album", item: { id: "a1", title: "New album" }, playCount: 0 };
    const artist = { type: "artist", item: { id: "ar1", name: "New artist" }, playCount: 0 };
    const playlist = { type: "playlist", item: { id: "p1", title: "Throwback pick" }, playCount: 0 };
    const mood = { type: "playlist", item: { id: "m1", title: "Chill pick" }, playCount: 0 };
    state.discovery.data = {
      ...emptyDiscovery(),
      albums: [album],
      artists: [artist],
      categoryShelves: [{ key: "category-0", title: "Chill · Featured playlists", items: [mood] }],
      playlistShelves: [{ key: "playlists-0", title: "Throwback", items: [playlist] }],
    };
    await render();
    expect(container.textContent).toContain("home.newReleases: New album");
    expect(container.textContent).toContain("home.topArtists: New artist");
    expect(container.textContent).toContain("Chill · Featured playlists: Chill pick");
    expect(container.textContent).toContain("Throwback: Throwback pick");
  });
  it("renders the personalised recommendations row when suggestions are available", async () => {
    state.recommended = [
      { type: "track", item: { id: "r1", title: "Suggested song" }, playCount: 0 },
      { type: "track", item: { id: "r2", title: "Another suggestion" }, playCount: 0 },
    ];
    await render();
    expect(container.textContent).toContain("home.recommendedForYou: Suggested song, Another suggestion");
  });
  it("keeps the home usable on a discovery failure and offers retry", async () => {
    state.discovery.error = true; await render();
    expect(container.textContent).toContain("library.liked_songs");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("home.discoveryUnavailable");
    await act(async () => Array.from(container.querySelectorAll("button")).find(button => button.textContent === "home.retry")!.click());
    expect(retry).toHaveBeenCalledOnce();
  });
});
