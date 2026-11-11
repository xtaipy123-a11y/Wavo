import { describe, expect, it } from "vitest";
import { pickCategoryShelf } from "./useHomeDiscovery";

describe("pickCategoryShelf", () => {
  it("returns exactly one shelf even when a category has many", () => {
    const shelves = Array.from({ length: 14 }, (_, index) => ({
      title: `Shelf ${index}`,
      items: [index],
    }));
    const picked = pickCategoryShelf(shelves, () => 0.5);
    expect(picked).toBeDefined();
    expect(shelves).toContain(picked);
  });

  it("skips empty shelves and handles an empty category", () => {
    expect(pickCategoryShelf([{ title: "Empty", items: [] }], () => 0.5)).toBeUndefined();
    expect(pickCategoryShelf([], () => 0.5)).toBeUndefined();
  });

  it("can pick a different shelf with another seed", () => {
    const shelves = Array.from({ length: 14 }, (_, index) => ({
      title: `Shelf ${index}`,
      items: [index],
    }));
    const offsets = new Set(
      Array.from({ length: 20 }, (_, seed) =>
        pickCategoryShelf(shelves, () => seed / 20)?.title,
      ),
    );
    expect(offsets.size).toBeGreaterThan(1);
  });
});
