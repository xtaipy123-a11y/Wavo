import { describe, expect, it } from "vitest";
import { findDeeplinkArg, parseDeeplink } from "./deeplink";

describe("parseDeeplink", () => {
  it("accepts real share targets", () => {
    expect(parseDeeplink("wavo://artist?id=UCGtGpOIGHfRu1KYL9pi-mNQ")).toEqual({
      type: "artist",
      id: "UCGtGpOIGHfRu1KYL9pi-mNQ",
    });
    expect(parseDeeplink("wavo://album?id=MPREb_xCxkOKReFZv")).toEqual({
      type: "album",
      id: "MPREb_xCxkOKReFZv",
    });
    expect(
      parseDeeplink("wavo://playlist?id=VLPLD8jNKEyHYB2DHh5vXSI4USLFo29vzUYl"),
    ).toEqual({ type: "playlist", id: "VLPLD8jNKEyHYB2DHh5vXSI4USLFo29vzUYl" });
    expect(parseDeeplink("wavo://track?id=RGdkabupfPI")).toEqual({
      type: "track",
      id: "RGdkabupfPI",
    });
    const token = "a".repeat(64);
    expect(parseDeeplink(`wavo://release?id=11111111-1111-4111-8111-111111111111&token=${token}`))
      .toEqual({ type: "release", id: "11111111-1111-4111-8111-111111111111", token });
  });

  it("rejects smuggled urls", () => {
    expect(parseDeeplink("https://evil.com")).toBeNull();
    expect(parseDeeplink("javascript:alert(1)")).toBeNull();
    expect(parseDeeplink("wavo://artist?id=UCaaaaaaaaaaaaaaaaaaaaaa&x=1&y=2")).toEqual({
      type: "artist",
      id: "UCaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(
      parseDeeplink("wavo://artist?id=UCaaaaaaaaaaaaaaaaaaaaaa&id=UCbbbbbbbbbbbbbbbbbbbbbb"),
    ).toBeNull();
    expect(parseDeeplink("wavo://artist")).toBeNull();
    expect(parseDeeplink("wavo://evil?id=RGdkabupfPI")).toBeNull();
    expect(parseDeeplink("wavo://track?id=RGdkabupfPIextra")).toBeNull();
    expect(parseDeeplink("wavo://artist?id=ABaaaaaaaaaaaaaaaaaaaaaa")).toBeNull();
    expect(parseDeeplink("wavo://artist?id=UCaaa/../../../../etc")).toBeNull();
    expect(parseDeeplink("wavo://release?id=11111111-1111-4111-8111-111111111111&token=bad")).toBeNull();
    expect(parseDeeplink(`wavo://release?id=11111111-1111-4111-8111-111111111111&token=${"a".repeat(64)}&redirect=https://evil.com`)).toBeNull();
    expect(parseDeeplink("not a url")).toBeNull();
  });

  it("finds the deeplink arg anywhere in argv", () => {
    expect(
      findDeeplinkArg(["/usr/bin/wavo", "wavo://track?id=RGdkabupfPI"]),
    ).toBe("wavo://track?id=RGdkabupfPI");
    expect(findDeeplinkArg(["/usr/bin/wavo", "--no-sandbox"])).toBeUndefined();
  });
});
