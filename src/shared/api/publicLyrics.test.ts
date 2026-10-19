import { afterEach, describe, expect, it, vi } from "vitest";
import { streamPublicLyrics } from "./publicLyrics";

afterEach(() => vi.unstubAllGlobals());

describe("public lyrics sources", () => {
  it("keeps LRCLIB available if the word source fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("api.amll.dev")) return { ok: false, status: 429 };
      return {
        ok: true,
        json: async () => ({
          trackName: "Example Song",
          artistName: "Example Artist",
          duration: 180,
          syncedLyrics: "[00:01.00]First line",
        }),
      };
    }));
    const events = [];
    for await (const event of streamPublicLyrics({ title: "Example Song", artist: "Example Artist", durationMs: 180000 })) {
      events.push(event);
    }
    expect(events.some((event) => event.type === "provider" && event.provider === "amll" && event.status === "error")).toBe(true);
    expect(events.some((event) => event.type === "provider" && event.provider === "lrclib" && event.status === "found")).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "done", best: { provider: "lrclib" } });
  });
});
