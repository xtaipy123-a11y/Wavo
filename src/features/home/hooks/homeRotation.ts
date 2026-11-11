/**
 * Per-launch variation for the home feed. A new seed is created whenever the
 * renderer starts, so every app launch shows a different order and picks a
 * different mood category, while a single session stays stable.
 */
export function createRandom(seed: number = Math.floor(Math.random() * 0x7fffffff)) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function rotateItems<T>(items: T[], offset: number): T[] {
  if (items.length < 2) return items;
  const normalized = ((offset % items.length) + items.length) % items.length;
  if (normalized === 0) return items;
  return [...items.slice(normalized), ...items.slice(0, normalized)];
}

export function randomOffset(random: () => number, length: number): number {
  return length > 1 ? Math.floor(random() * length) : 0;
}

export function pickRandom<T>(items: T[], count: number, random: () => number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  while (pool.length > 0 && picked.length < count) {
    picked.push(...pool.splice(Math.floor(random() * pool.length), 1));
  }
  return picked;
}
