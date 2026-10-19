import { afterEach, describe, expect, it, vi } from "vitest";
import { streamAmllLyrics } from "./amll";

afterEach(() => vi.unstubAllGlobals());

const ttml = '<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml"><body><div>' +
  '<p begin="00:01.000" end="00:03.000"><span begin="00:01.000" end="00:02.000">Hello </span><span begin="00:02.000" end="00:03.000">world</span></p>' +
  '<p begin="00:04.000" end="00:06.000"><span begin="00:04.000" end="00:05.000">Second </span><span begin="00:05.000" end="00:06.000">line</span></p>' +
  '</div></body></tt>';

describe("AMLL word lyrics", () => {
  it("accepts a matching title and artist with parsed word timestamps", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 200, data: { items: [
        { id: 12, musicNames: ["Example Song"], artistNames: ["Example Artist"] },
      ] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 200, data: { lyrics: ttml } }) });
    vi.stubGlobal("fetch", fetchMock);
    const events = [];
    for await (const event of streamAmllLyrics({ title: "Example Song", artist: "Example Artist" })) events.push(event);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events[0]).toMatchObject({ type: "provider", provider: "amll", status: "found", syncLevel: "word_level" });
  });

  it("rejects a different artist before downloading lyrics", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 200, data: { items: [
      { id: 12, musicNames: ["Example Song"], artistNames: ["Wrong Artist"] },
    ] } }) });
    vi.stubGlobal("fetch", fetchMock);
    const events = [];
    for await (const event of streamAmllLyrics({ title: "Example Song", artist: "Example Artist" })) events.push(event);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events[0]).toMatchObject({ type: "provider", status: "not_found" });
  });
});
