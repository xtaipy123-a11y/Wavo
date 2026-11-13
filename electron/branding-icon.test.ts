import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { getPath: () => "" } }));

import { pngToIco, shortcutIconValue } from "./branding-icon";

describe("branding icon", () => {
  it("wraps a PNG in a single-entry ICO container", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const ico = pngToIco(png);

    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(1);
    expect(ico[6]).toBe(0);
    expect(ico[7]).toBe(0);
    expect(ico.readUInt16LE(10)).toBe(1);
    expect(ico.readUInt16LE(12)).toBe(32);
    expect(ico.readUInt32LE(14)).toBe(png.length);
    expect(ico.readUInt32LE(18)).toBe(22);
    expect(ico.subarray(22).equals(png)).toBe(true);
  });

  it("builds an unquoted shortcut icon location", () => {
    expect(shortcutIconValue("C:\\Users\\Some Name\\wavo\\icon.ico")).toBe(
      "C:\\Users\\Some Name\\wavo\\icon.ico,0",
    );
  });
});
