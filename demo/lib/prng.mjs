// Deterministic randomness for the seeder: the same seed always builds the same school.

/** 32-bit FNV-1a hash of a string. */
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** mulberry32: a small, fast generator returning floats in [0, 1). */
export function rng(seed) {
  let a = typeof seed === 'string' ? hash32(seed) : seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = {
    next,
    int: (n) => Math.floor(next() * n),
    range: (lo, hi) => lo + next() * (hi - lo),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** Standard normal (Box-Muller). */
    normal: () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next()),
    /** Index chosen with probability proportional to weights. */
    weighted(weights) {
      let total = 0;
      for (const w of weights) total += w;
      let x = next() * total;
      for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x < 0) return i; }
      return weights.length - 1;
    },
    shuffle(arr) {
      const a2 = arr.slice();
      for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; }
      return a2;
    },
  };
  return r;
}

export const logistic = (x) => 1 / (1 + Math.exp(-x));
