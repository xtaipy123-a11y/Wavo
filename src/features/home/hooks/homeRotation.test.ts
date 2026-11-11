import { describe, expect, it } from "vitest";
import { createRandom, pickRandom, randomOffset, rotateItems } from "./homeRotation";

describe("home rotation", () => {
  it("rotates without dropping or duplicating items", () => {
    expect(rotateItems([1, 2, 3, 4], 1)).toEqual([2, 3, 4, 1]);
    expect(rotateItems([1, 2, 3, 4], 6)).toEqual([3, 4, 1, 2]);
    expect(rotateItems([1, 2, 3, 4], -1)).toEqual([4, 1, 2, 3]);
    expect(rotateItems([1], 5)).toEqual([1]);
    expect(rotateItems([], 5)).toEqual([]);
  });

  it("produces the same sequence for the same seed", () => {
    const first = createRandom(42);
    const second = createRandom(42);
    expect([first(), first(), first()]).toEqual([second(), second(), second()]);

    const values = Array.from({ length: 20 }, () => first());
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it("picks unique items", () => {
    const picked = pickRandom(["a", "b", "c", "d"], 3, createRandom(7));
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
  });

  it("keeps offsets inside the list", () => {
    expect(randomOffset(() => 0.999, 10)).toBe(9);
    expect(randomOffset(() => 0.5, 1)).toBe(0);
  });
});
