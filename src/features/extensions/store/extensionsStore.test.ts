import { describe, expect, it } from "vitest";
import { parseThemePack } from "./extensionsStore";

const validPack = {
  wavoThemeVersion: 1,
  id: "my-blue",
  name: "My Blue",
  light: { background: "#f0f5ff", surface: "#ffffff", elevated: "#dce7ff", text: "#102040", accent: "#2867c9" },
  dark: { background: "#10192a", surface: "#080f1e", elevated: "#1c2d48", text: "#e6efff", accent: "#72aaff" },
};

describe("Wavo theme files", () => {
  it("accepts a declarative color theme", () => {
    expect(parseThemePack(validPack)).toMatchObject({ id: "my-blue", name: "My Blue" });
  });

  it("rejects CSS or script injection in colors and invalid IDs", () => {
    expect(() => parseThemePack({ ...validPack, dark: { ...validPack.dark, accent: "red; background: url(file:///secret)" } })).toThrow();
    expect(() => parseThemePack({ ...validPack, id: "../escape" })).toThrow();
  });
});
