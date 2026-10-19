import { afterEach, describe, expect, it, vi } from "vitest";
import { streamLrclibLyrics } from "./lrclib";

afterEach(() => vi.unstubAllGlobals());

describe("LRCLIB lyrics", () => {
  it("returns timed lyrics for a matching track", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        trackName: "Example Song",
        artistName: "Example Artist",
        duration: 180,
        syncedLyrics: "[00:01.00]First line",
        plainLyrics: "First line",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const events = [];
    for await (const event of streamLrclibLyrics({ title: "Example Song", artist: "Example Artist", durationMs: 180000 })) {
      events.push(event);
    }
    expect(fetchMock.mock.calls[0][0]).toContain("/api/get?");
    expect(events[0]).toMatchObject({ type: "provider", status: "found", syncLevel: "line_level" });
    expect(events[1]).toMatchObject({ type: "done", best: { provider: "lrclib" } });
  });

  it("does not display lyrics from a different artist", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ trackName: "Example Song", artistName: "Wrong Artist", duration: 180, plainLyrics: "Wrong lyrics" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);
    const events = [];
    for await (const event of streamLrclibLyrics({ title: "Example Song", artist: "Example Artist", durationMs: 180000 })) {
      events.push(event);
    }
    expect(events.at(-1)).toMatchObject({ type: "done", status: "not_found" });
  });
});
