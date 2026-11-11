import { describe, expect, it } from "vitest";
import { isHiddenPlaylistItem, mapPathfinderItem } from "./spotifyPathfinder";

function item(flags: Record<string, unknown> = {}) {
  return {
    ...flags,
    itemV2: {
      data: {
        __typename: "Track",
        name: "Hidden Song",
        uri: "spotify:track:abc123",
        artists: { items: [{ profile: { name: "Artist" } }] },
        trackDuration: { totalMilliseconds: 180_000 },
      },
    },
  };
}

describe("spotify hidden track detection", () => {
  it("maps regular tracks without a dislike flag", () => {
    expect(mapPathfinderItem(item())?.disliked).toBeUndefined();
  });

  it("honors hidden flags on the item wrappers", () => {
    expect(mapPathfinderItem(item({ hidden: true }))?.disliked).toBe(true);
    expect(
      isHiddenPlaylistItem({
        itemV2: { data: { __typename: "Track", isHidden: true } },
      }),
    ).toBe(true);
    expect(
      isHiddenPlaylistItem({
        attributes: { banned: true },
      }),
    ).toBe(true);
  });
});
