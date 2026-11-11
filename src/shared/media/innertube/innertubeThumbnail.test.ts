import { describe, expect, it } from "vitest";
import { toCardArtworkUrl, toSquareArtworkUrl } from "./innertubeThumbnail";

describe("toSquareArtworkUrl", () => {
  it("downsizes original artist artwork instead of requesting the full resolution", () => {
    expect(toSquareArtworkUrl("https://yt3.googleusercontent.com/abc=s0", 350))
      .toBe("https://yt3.googleusercontent.com/abc=w350-h350-l90-rj");
  });

  it("replaces an existing size suffix", () => {
    expect(toSquareArtworkUrl("https://yt3.googleusercontent.com/abc=w512-h512-l90-rj", 350))
      .toBe("https://yt3.googleusercontent.com/abc=w350-h350-l90-rj");
  });

  it("leaves non-artwork hosts untouched", () => {
    expect(toSquareArtworkUrl("https://i.ytimg.com/vi/abc/hqdefault.jpg", 350))
      .toBe("https://i.ytimg.com/vi/abc/hqdefault.jpg");
  });
});

describe("toCardArtworkUrl", () => {
  it("resizes profile artwork the same way as square artwork", () => {
    expect(toCardArtworkUrl("https://yt3.googleusercontent.com/abc=s0", 350))
      .toBe("https://yt3.googleusercontent.com/abc=w350-h350-l90-rj");
  });

  it("requests the smaller 480×360 thumbnail for video artwork", () => {
    expect(toCardArtworkUrl("https://i.ytimg.com/vi/abc/hq720.jpg?sqp=token", 350))
      .toBe("https://i.ytimg.com/vi/abc/hqdefault.jpg?sqp=token");
  });

  it("keeps already small video thumbnails and unrelated hosts unchanged", () => {
    expect(toCardArtworkUrl("https://i.ytimg.com/vi/abc/hqdefault.jpg", 350))
      .toBe("https://i.ytimg.com/vi/abc/hqdefault.jpg");
    expect(toCardArtworkUrl("https://cdn.example.com/cover.png", 350))
      .toBe("https://cdn.example.com/cover.png");
  });
});
