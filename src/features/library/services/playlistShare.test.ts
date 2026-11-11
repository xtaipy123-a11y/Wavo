import { describe, expect, it } from "vitest";
import {
  buildPlaylistShareLink,
  decodePlaylistShareLink,
  decodePlaylistShareToken,
  encodePlaylistShareToken,
  extractPlaylistShareToken,
  isPlaylistShareLink,
  parsePlaylistSharePayload,
  toShareTrack,
  type PlaylistSharePayload,
} from "./playlistShare";

const payload: PlaylistSharePayload = {
  v: 1,
  title: "Night drive",
  description: "Late night synths",
  tracks: [
    {
      id: "track-1",
      title: "First",
      artists: [{ id: "artist-1", name: "Artist One" }],
      durationMs: 180_000,
      cover: { url: "https://img.example/1.jpg", width: 512, height: 512 },
    },
    {
      id: "track-2",
      title: "Second",
      artists: [{ id: "artist-2", name: "Artist Two" }],
      durationMs: 200_000,
      disliked: true,
    },
  ],
};

describe("playlist share links", () => {
  it("round-trips order and dislike state", async () => {
    const token = await encodePlaylistShareToken(payload);
    const decoded = await decodePlaylistShareToken(token);
    expect(decoded).toEqual(payload);
  });

  it("builds a self-contained wavo link", async () => {
    const link = await buildPlaylistShareLink(payload);
    expect(link.startsWith("wavo://playlist?d=")).toBe(true);
    expect(isPlaylistShareLink(link)).toBe(true);
    expect(await decodePlaylistShareLink(link)).toEqual(payload);
  });

  it("extracts the token from a share link", async () => {
    const token = await encodePlaylistShareToken(payload);
    expect(extractPlaylistShareToken(`wavo://playlist?d=${token}`)).toBe(token);
  });

  it("rejects damaged tokens and urls", async () => {
    const token = await encodePlaylistShareToken(payload);
    expect(await decodePlaylistShareToken(`${token.slice(0, -2)}xx`)).toBeNull();
    expect(extractPlaylistShareToken("wavo://playlist?id=abc")).toBeNull();
    expect(extractPlaylistShareToken("https://evil.example/playlist?d=abc")).toBeNull();
    expect(isPlaylistShareLink("https://open.spotify.com/playlist/abc")).toBe(false);
  });

  it("validates payloads strictly", () => {
    expect(parsePlaylistSharePayload({ ...payload, v: 2 })).toBeNull();
    expect(parsePlaylistSharePayload({ ...payload, title: "" })).toBeNull();
    expect(
      parsePlaylistSharePayload({
        v: 1,
        title: "Broken",
        tracks: [{ id: "x", title: "y", artists: "nope" }],
      }),
    ).toBeNull();
  });

  it("converts client tracks for sharing", () => {
    const shared = toShareTrack(
      {
        id: "abc",
        title: "Song",
        artists: "Artist One, Artist Two",
        coverUrl: "https://img.example/cover.jpg",
        durationMs: 1234,
        playCount: 0,
      },
      true,
    );
    expect(shared).toMatchObject({
      id: "abc",
      artists: [
        { id: "", name: "Artist One" },
        { id: "", name: "Artist Two" },
      ],
      disliked: true,
    });
  });
});
