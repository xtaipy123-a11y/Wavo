import { afterEach, describe, expect, it, vi } from "vitest";
import { streamAmllLyrics } from "./amll";

afterEach(() => vi.unstubAllGlobals());

const ttml = '<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml"><body dur="00:10.000"><div begin="00:01.000" end="00:10.000">' +
  '<p begin="00:01.000" end="00:03.000"><span begin="00:01.000" end="00:02.000">Hello </span><span begin="00:02.000" end="00:03.000">world</span></p>' +
  '<p begin="00:04.000" end="00:06.000"><span begin="00:04.000" end="00:05.000">Second </span><span begin="00:05.000" end="00:06.000">line</span></p>' +
  '</div></body></tt>';

function searchResponse(items: { id: number; musicNames: string[]; artistNames: string[] }[]) {
  return { ok: true, json: async () => ({ status: 200, data: { items } }) };
}

function lyricsResponse(lyrics: string) {
  return { ok: true, json: async () => ({ status: 200, data: { lyrics } }) };
}

describe("AMLL word lyrics", () => {
  it("accepts a matching title and artist with parsed word timestamps", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchResponse([
        { id: 12, musicNames: ["Example Song"], artistNames: ["Example Artist"] },
      ]))
      .mockResolvedValueOnce(lyricsResponse(ttml));
    vi.stubGlobal("fetch", fetchMock);
    const events = [];
    for await (const event of streamAmllLyrics({ title: "Example Song", artist: "Example Artist" })) events.push(event);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events[0]).toMatchObject({ type: "provider", provider: "amll", status: "found", syncLevel: "word_level" });
  });

  it("searches with the artist first and falls back to a title-only query", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchResponse([]))
      .mockResolvedValueOnce(searchResponse([
        { id: 12, musicNames: ["Example Song"], artistNames: ["Example Artist"] },
      ]))
      .mockResolvedValueOnce(lyricsResponse(ttml));
    vi.stubGlobal("fetch", fetchMock);
    const events = [];
    for await (const event of streamAmllLyrics({ title: "Example Song", artist: "Example Artist" })) events.push(event);

    expect(String(fetchMock.mock.calls[0][0])).toContain("artistName=Example+Artist");
    expect(String(fetchMock.mock.calls[1][0])).not.toContain("artistName=");
    expect(events[0]).toMatchObject({ type: "provider", status: "found", syncLevel: "word_level" });
  });

  it("strips edition suffixes from the search title", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchResponse([
        { id: 12, musicNames: ["Example Song"], artistNames: ["Example Artist"] },
      ]))
      .mockResolvedValueOnce(lyricsResponse(ttml));
    vi.stubGlobal("fetch", fetchMock);
    const events = [];
    for await (const event of streamAmllLyrics({
      title: "Example Song - Remastered 2011",
      artist: "Example Artist",
    })) events.push(event);

    const searchUrl = String(fetchMock.mock.calls[0][0]);
    expect(searchUrl).toContain("musicName=Example+Song&");
    expect(searchUrl).not.toContain("Remastered");
    expect(events[0]).toMatchObject({ type: "provider", status: "found" });
  });

  it("accepts a single word-timed line", async () => {
    const singleLine = '<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml"><body dur="00:06.000"><div begin="00:01.000" end="00:06.000">' +
      '<p begin="00:01.000" end="00:03.000"><span begin="00:01.000" end="00:02.000">Hello </span><span begin="00:02.000" end="00:03.000">world</span></p>' +
      '</div></body></tt>';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchResponse([
        { id: 12, musicNames: ["Example Song"], artistNames: ["Example Artist"] },
      ]))
      .mockResolvedValueOnce(lyricsResponse(singleLine));
    vi.stubGlobal("fetch", fetchMock);
    const events = [];
    for await (const event of streamAmllLyrics({ title: "Example Song", artist: "Example Artist" })) events.push(event);
    expect(events[0]).toMatchObject({ type: "provider", status: "found", syncLevel: "word_level" });
  });

  it("prefers a result whose duration matches the playing track", async () => {
    const shortVersion = '<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml"><body dur="01:00.000"><div begin="00:01.000" end="01:00.000">' +
      '<p begin="00:01.000" end="00:03.000"><span begin="00:01.000" end="00:02.000">Wrong </span><span begin="00:02.000" end="00:03.000">version</span></p>' +
      '<p begin="00:04.000" end="00:06.000"><span begin="00:04.000" end="00:05.000">Wrong </span><span begin="00:05.000" end="00:06.000">again</span></p>' +
      '</div></body></tt>';
    const fullVersion = '<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml"><body dur="03:20.000"><div begin="00:01.000" end="03:20.000">' +
      '<p begin="00:01.000" end="00:03.000"><span begin="00:01.000" end="00:02.000">Right </span><span begin="00:02.000" end="00:03.000">version</span></p>' +
      '<p begin="00:04.000" end="00:06.000"><span begin="00:04.000" end="00:05.000">Right </span><span begin="00:05.000" end="00:06.000">again</span></p>' +
      '</div></body></tt>';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchResponse([
        { id: 12, musicNames: ["Example Song"], artistNames: ["Example Artist"] },
        { id: 34, musicNames: ["Example Song"], artistNames: ["Example Artist"] },
      ]))
      .mockResolvedValueOnce(lyricsResponse(shortVersion))
      .mockResolvedValueOnce(lyricsResponse(fullVersion));
    vi.stubGlobal("fetch", fetchMock);
    const events = [];
    for await (const event of streamAmllLyrics({
      title: "Example Song",
      artist: "Example Artist",
      durationMs: 200_000,
    })) events.push(event);

    const found = events.find((event) => event.type === "provider" && event.status === "found");
    expect(found).toMatchObject({
      type: "provider",
      status: "found",
      candidate: { matchedTrack: { durationMs: 200_000 } },
    });
  });

  it("rejects a different artist before downloading lyrics", async () => {
    const fetchMock = vi.fn().mockResolvedValue(searchResponse([
      { id: 12, musicNames: ["Example Song"], artistNames: ["Wrong Artist"] },
    ]));
    vi.stubGlobal("fetch", fetchMock);
    const events = [];
    for await (const event of streamAmllLyrics({ title: "Example Song", artist: "Example Artist" })) events.push(event);
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("/get"))).toBe(true);
    expect(events[0]).toMatchObject({ type: "provider", status: "not_found" });
  });
});
