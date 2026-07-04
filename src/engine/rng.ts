// Single seeded RNG (spec §0.2). xmur3 string hash -> mulberry32 stream.
// RNG state is a plain uint32 held in GameState so runs serialize/replay exactly.

export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export interface RngBox {
  rngS: number;
}

/** Advance the stream and return a float in [0, 1). */
export function rand(box: RngBox): number {
  box.rngS = (box.rngS + 0x6d2b79f5) >>> 0;
  let t = box.rngS;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** 1..100 */
export function d100(box: RngBox): number {
  return 1 + Math.floor(rand(box) * 100);
}

/** true with probability pct/100 */
export function chance(box: RngBox, pct: number): boolean {
  return d100(box) <= pct;
}

export function randInt(box: RngBox, min: number, max: number): number {
  return min + Math.floor(rand(box) * (max - min + 1));
}

export function pick<T>(box: RngBox, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('pick from empty array');
  return arr[Math.floor(rand(box) * arr.length)];
}

/** Weighted pick. weights parallel to items; total need not be 1. */
export function weightedPick<T>(box: RngBox, items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return pick(box, items);
  let r = rand(box) * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

/** Fisher-Yates shuffle (returns new array, consumes RNG). */
export function shuffle<T>(box: RngBox, arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(box) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Independent derived stream for presentation-layer choices (template variants).
 * Never touches the game RNG, so prose variety cannot perturb replay (DECISIONS D-002).
 */
export function derivedRng(seed: string, key: string): RngBox {
  return { rngS: hashSeed(seed + '::' + key) };
}
