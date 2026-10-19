import { describe, expect, it } from "vitest";
import { clampLeftPanePercent, getFullscreenArtworkSize, getLeftPaneLimits } from "./fullscreenLayout";

describe("fullscreen player layout", () => {
  it("keeps both panes usable when the window is narrow", () => {
    const limits = getLeftPaneLimits(800);
    expect(limits.min).toBeGreaterThanOrEqual(45);
    expect(limits.max).toBeLessThanOrEqual(54);
    expect(clampLeftPanePercent(75, 800)).toBe(limits.max);
    expect(clampLeftPanePercent(25, 800)).toBe(limits.min);
  });

  it("allows a wide range on large screens and safely handles saved values", () => {
    expect(clampLeftPanePercent(73, 2400)).toBe(73);
    expect(clampLeftPanePercent(500, 2400)).toBe(75);
    expect(clampLeftPanePercent(Number.NaN, 2400)).toBe(50);
  });

  it("scales the artwork with the left pane without overflowing its available space", () => {
    expect(getFullscreenArtworkSize(380, 50, 1920, 1080)).toBe(380);
    expect(getFullscreenArtworkSize(550, 75, 1920, 1080)).toBe(550);
    expect(getFullscreenArtworkSize(640, 40, 800, 500)).toBeLessThanOrEqual(210);
    expect(getFullscreenArtworkSize(640, 50, 800, 1080)).toBeLessThanOrEqual(352);
  });
});
