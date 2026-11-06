// Crypt Survivors: the rules, as pure functions. The spatial hash that keeps hundreds of enemies
// cheap, the XP curve, how relics and corruptions combine into stats, what a level-up offers, and
// how questions are dealt. No DOM here, so tests/survivors.test.mjs runs it under Node.

import {
  BASE_STATS, WEAPONS, PASSIVES, CORRUPTIONS, MAX_WEAPONS, MAX_PASSIVES, WEAPON_MAX, CORRUPTION_MAX,
} from './defs.js';

export const LETTERS = 'ABCDEF';

/** Small, fast, seedable PRNG (mulberry32): returns a function giving floats in [0, 1). */
export function rngFrom(seed = Date.now()) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(a, rng = Math.random) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------------------------------------------------------------------------
// Spatial hash: objects with x, y and an optional radius r, bucketed by cell. Rebuilt each frame
// (clear + insert), queried for "everything within r of a point" in O(nearby) instead of O(n).
// ---------------------------------------------------------------------------
export class SpatialGrid {
  constructor(cell = 48) {
    this.cell = cell;
    this.inv = 1 / cell;
    this.buckets = new Map();
    this.used = [];
    this.pad = 0; // the largest radius inserted since the last clear
    this.count = 0;
  }

  static key(cx, cy) { return (cx + 32768) * 65536 + (cy + 32768); }

  clear() {
    for (const b of this.used) b.length = 0;
    this.used.length = 0;
    this.pad = 0;
    this.count = 0;
    // The world is endless: drop empty buckets now and then so the map doesn't grow without bound.
    if (this.buckets.size > 6000) this.buckets.clear();
  }

  insert(o) {
    const k = SpatialGrid.key(Math.floor(o.x * this.inv), Math.floor(o.y * this.inv));
    let b = this.buckets.get(k);
    if (!b) { b = []; this.buckets.set(k, b); }
    if (!b.length) this.used.push(b);
    b.push(o);
    if ((o.r || 0) > this.pad) this.pad = o.r || 0;
    this.count++;
  }

  /** Objects whose circle overlaps the circle (x, y, r), into `out` (reused to avoid garbage). */
  query(x, y, r, out = []) {
    out.length = 0;
    const reach = r + this.pad;
    const x0 = Math.floor((x - reach) * this.inv), x1 = Math.floor((x + reach) * this.inv);
    const y0 = Math.floor((y - reach) * this.inv), y1 = Math.floor((y + reach) * this.inv);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const b = this.buckets.get(SpatialGrid.key(cx, cy));
        if (!b) continue;
        for (let i = 0; i < b.length; i++) {
          const o = b[i];
          const dx = o.x - x, dy = o.y - y, rr = r + (o.r || 0);
          if (dx * dx + dy * dy <= rr * rr) out.push(o);
        }
      }
    }
    return out;
  }

  /** The nearest object to (x, y) within maxR that passes `ok` (or null), searching rings of cells outward. */
  nearest(x, y, maxR = Infinity, ok = null) {
    const cx = Math.floor(x * this.inv), cy = Math.floor(y * this.inv);
    const rings = Math.min(Math.ceil(maxR * this.inv) + 1, 64);
    let best = null, bestD = maxR * maxR;
    for (let ring = 0; ring <= rings; ring++) {
      // Once something is found, one more ring can still hold a closer object; beyond that, nothing can.
      if (best && (ring - 1) * this.cell > Math.sqrt(bestD)) break;
      for (let i = -ring; i <= ring; i++) {
        for (let j = -ring; j <= ring; j++) {
          if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
          const b = this.buckets.get(SpatialGrid.key(cx + i, cy + j));
          if (!b) continue;
          for (const o of b) {
            const dx = o.x - x, dy = o.y - y, d = dx * dx + dy * dy;
            if (d < bestD && (!ok || ok(o))) { best = o; bestD = d; }
          }
        }
      }
    }
    return best;
  }
}

// ---------------------------------------------------------------------------
// Experience: each level needs more than the last, quadratically, so the questions keep coming at a
// steady pace even as a strong build kills faster and faster (level 2 at 5 XP, 10 at ~1,000, 30 at ~10,000).
// ---------------------------------------------------------------------------
export function xpToNext(level) {
  const n = Math.max(0, level - 1);
  return Math.round(5 + 7 * n + 0.8 * n * n);
}

/** Add xp to { level, xp } (xp = progress into the current level). Returns how many levels were gained. */
export function gainXp(state, amount) {
  state.xp += amount;
  let ups = 0;
  while (state.xp >= xpToNext(state.level)) {
    state.xp -= xpToNext(state.level);
    state.level++;
    ups++;
  }
  return ups;
}

// ---------------------------------------------------------------------------
// Stats: a character's mods and relic levels add up; corruption stacks then multiply on top.
// ---------------------------------------------------------------------------
const FLAT = new Set(['armor', 'amount', 'regen']);
const FRACTIONAL = ['might', 'cooldown', 'area', 'speed', 'move', 'magnet', 'duration', 'growth'];

export function computeStats(character = null, passives = {}, corruptions = {}) {
  const s = { ...BASE_STATS };
  const add = { maxHp: 0 };
  for (const k of FRACTIONAL) add[k] = 0;
  const mods = character?.mods || {};
  const hpFlat = mods.maxHp || 0;
  for (const [k, v] of Object.entries(mods)) {
    if (FLAT.has(k)) s[k] += v;
    else if (k !== 'maxHp') add[k] += v;
  }
  for (const [id, level] of Object.entries(passives)) {
    const per = PASSIVES[id]?.per || {};
    for (const [k, v] of Object.entries(per)) {
      if (FLAT.has(k)) s[k] += v * level;
      else add[k] += v * level;
    }
  }
  s.maxHp = (BASE_STATS.maxHp + hpFlat) * (1 + add.maxHp);
  for (const k of FRACTIONAL) s[k] = BASE_STATS[k] * (1 + add[k]);
  for (const [id, stacks] of Object.entries(corruptions)) {
    const c = CORRUPTIONS[id];
    if (!c || !stacks) continue;
    for (const [k, f] of Object.entries(c.per)) s[k] *= f ** stacks;
    if (c.chip) s.chip += c.chip * stacks;
  }
  s.cooldown = Math.max(0.2, s.cooldown);
  s.move = Math.max(0.3, s.move);
  s.area = Math.max(0.25, s.area);
  s.magnet = Math.max(0.2, s.magnet);
  s.might = Math.max(0.2, s.might);
  s.maxHp = Math.max(10, Math.round(s.maxHp));
  s.regen = Math.round(s.regen * 100) / 100;
  return s;
}

/** A weapon's numbers at a level, before (raw) or after the player's stats. */
export function weaponLevelStats(id, level) {
  const def = WEAPONS[id];
  const w = { ...def.base };
  const lv = Math.min(level, WEAPON_MAX);
  for (let i = 0; def.levels && i < lv - 1; i++) {
    for (const [k, v] of Object.entries(def.levels[i])) w[k] = (w[k] ?? 0) + v;
  }
  return w;
}

export function weaponStats(id, level, stats = BASE_STATS) {
  const w = weaponLevelStats(id, level);
  return {
    ...w,
    damage: w.damage * stats.might,
    cooldown: Math.max(0.08, w.cooldown * stats.cooldown),
    area: (w.area ?? 1) * stats.area,
    speed: (w.speed ?? 1) * stats.speed,
    amount: (w.amount ?? 1) + stats.amount,
    duration: (w.duration ?? 0) * stats.duration,
  };
}

const pct = (v) => `${Math.round(v * 100)}%`;
const DESCRIBE = {
  damage: (v) => `+${v} damage`,
  cooldown: (v) => `${v < 0 ? '−' : '+'}${Math.abs(v)} s cooldown`,
  area: (v) => `+${pct(v)} area`,
  amount: (v) => `+${v} ${v === 1 ? 'projectile' : 'projectiles'}`,
  speed: (v) => `+${pct(v)} speed`,
  duration: (v) => `+${v} s duration`,
  pierce: (v) => `+${v} pierce`,
};
/** What reaching `level` adds to a weapon, in words ("+5 damage, +10% area"). */
export function levelText(id, level) {
  const def = WEAPONS[id];
  if (level <= 1 || !def.levels) return def.desc;
  return Object.entries(def.levels[level - 2] || {}).map(([k, v]) => DESCRIBE[k]?.(v) || `+${v} ${k}`).join(', ');
}

// ---------------------------------------------------------------------------
// Builds and level-up offers. A build is { weapons: [{ id, level }], passives: { id: level },
// corruptions: { id: stacks } }.
// ---------------------------------------------------------------------------
export const newBuild = (startWeapon) => ({ weapons: startWeapon ? [{ id: startWeapon, level: 1 }] : [], passives: {}, corruptions: {}, purified: 0, taken: {} });

export const corruptionStacks = (build) => Object.values(build.corruptions).reduce((n, v) => n + v, 0);
/** 0 (pure) to 1 (fully corrupted): drives the music, the floor and the vignette. */
export const corruptionLevel = (build) => Math.min(1, corruptionStacks(build) / 6);

export function eligibleEvolutions(build) {
  return build.weapons.filter((w) => {
    const def = WEAPONS[w.id];
    return !def.evolved && def.evolve && w.level >= WEAPON_MAX && (build.passives[def.evolve.with] || 0) > 0;
  }).map((w) => ({ kind: 'evolve', id: WEAPONS[w.id].evolve.into, from: w.id }));
}

/** The corruption a Purify card cleanses: the most stacked one (ties go to the first taken). */
export function worstCorruption(build) {
  let best = null;
  for (const [id, n] of Object.entries(build.corruptions)) if (n > 0 && (!best || n > build.corruptions[best])) best = id;
  return best;
}

function pickWeighted(pool, rng) {
  const total = pool.reduce((n, o) => n + o.weight, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= pool[i].weight;
    if (r <= 0) return pool.splice(i, 1)[0];
  }
  return pool.pop();
}

/**
 * Three boons for a right answer: an evolution if one is ready, then new weapons, weapon levels, new
 * relics and relic levels (what you already carry is likelier). When the streak reaches a multiple of 3
 * and the build carries a corruption, the last card is a Purify card that cleanses one.
 */
export function rollUpgrades(build, rng = Math.random, { streak = 0, count = 3 } = {}) {
  const offers = eligibleEvolutions(build).slice(0, 1);
  const pool = [];
  const owned = new Set(build.weapons.map((w) => w.id));
  for (const w of build.weapons) {
    if (!WEAPONS[w.id].evolved && w.level < WEAPON_MAX) pool.push({ kind: 'weapon', id: w.id, level: w.level + 1, weight: 3 });
  }
  if (build.weapons.length < MAX_WEAPONS) {
    for (const [id, def] of Object.entries(WEAPONS)) {
      // An evolved weapon's base counts as owned, so it can't be picked up a second time.
      if (def.evolved || owned.has(id) || build.weapons.some((w) => WEAPONS[w.id].from === id)) continue;
      pool.push({ kind: 'weapon', id, level: 1, weight: 1.3 });
    }
  }
  for (const [id, level] of Object.entries(build.passives)) {
    if (level < PASSIVES[id].max) pool.push({ kind: 'passive', id, level: level + 1, weight: 2.4 });
  }
  if (Object.keys(build.passives).length < MAX_PASSIVES) {
    for (const id of Object.keys(PASSIVES)) if (!(id in build.passives)) pool.push({ kind: 'passive', id, level: 1, weight: 1 });
  }
  while (offers.length < count && pool.length) {
    const { weight, ...o } = pickWeighted(pool, rng);
    offers.push(o);
  }
  // Everything maxed: fall back to a heal and a purse of gold.
  for (const kind of ['heal', 'gold']) if (offers.length < count) offers.push({ kind });
  const purify = worstCorruption(build);
  if (streak > 0 && streak % 3 === 0 && purify) offers[count - 1] = { kind: 'purify', id: purify };
  return offers.slice(0, count);
}

/** Three corruptions for a wrong answer (each can stack to CORRUPTION_MAX). */
export function rollCorruptions(build, rng = Math.random, count = 3) {
  const pool = Object.keys(CORRUPTIONS).filter((id) => (build.corruptions[id] || 0) < CORRUPTION_MAX);
  const offers = shuffle(pool, rng).slice(0, count).map((id) => ({ kind: 'corruption', id, level: (build.corruptions[id] || 0) + 1 }));
  if (!offers.length) offers.push({ kind: 'toll' });
  return offers;
}

/** Apply a chosen card to the build. Heal, gold and toll are left to the game (they touch the player). */
export function applyOffer(build, offer) {
  switch (offer.kind) {
    case 'weapon': {
      const w = build.weapons.find((x) => x.id === offer.id);
      if (w) w.level = Math.min(WEAPON_MAX, w.level + 1);
      else if (build.weapons.length < MAX_WEAPONS) build.weapons.push({ id: offer.id, level: 1 });
      break;
    }
    case 'passive':
      build.passives[offer.id] = Math.min(PASSIVES[offer.id].max, (build.passives[offer.id] || 0) + 1);
      break;
    case 'evolve': {
      const w = build.weapons.find((x) => x.id === offer.from);
      if (w) { w.id = offer.id; w.level = 1; }
      break;
    }
    case 'corruption':
      build.corruptions[offer.id] = Math.min(CORRUPTION_MAX, (build.corruptions[offer.id] || 0) + 1);
      build.taken[offer.id] = (build.taken[offer.id] || 0) + 1;
      break;
    case 'purify':
      if (build.corruptions[offer.id] > 0) {
        build.corruptions[offer.id]--;
        if (!build.corruptions[offer.id]) delete build.corruptions[offer.id];
        build.purified++;
      }
      break;
    default:
  }
  return build;
}

// ---------------------------------------------------------------------------
// Questions. Each comes from play/data/ in the shape scripts/lib/quiz.mjs writes:
// { q, o: [choices], a, e, oe, topic, n, pre?, fixed?, s? }.
// ---------------------------------------------------------------------------

/** Display order of a question's choices: shuffled, unless the choices refer to each other (`fixed`). */
export function orderChoices(q, rng = Math.random) {
  const idx = q.o.map((_, i) => i);
  return q.fixed ? idx : shuffle(idx, rng);
}

/** The letter a choice (by original index) is shown under, and the original index behind a letter. */
export const letterOf = (q, orig) => LETTERS[q.order.indexOf(orig)];
export const origAt = (q, shown) => q.order[shown];

/** Which questions a run asks: all, only the ones missed before, or an explicit set of ids. */
export function selectQuestions(all, { missedOnly = false, isMissed = () => false, only = null } = {}) {
  if (only) return all.filter((q) => only.has(q.id));
  if (missedOnly) return all.filter((q) => isMissed(q.id));
  return all.slice();
}

/**
 * Hands out one question per level-up. When the pool runs out it starts again, reshuffled (without
 * repeating the question just asked), and every deal shuffles that question's choices afresh.
 */
export class QuestionDeck {
  constructor(questions, { shuffled = true, rng = Math.random } = {}) {
    this.rng = rng;
    this.shuffled = shuffled;
    this.order = shuffled ? shuffle(questions.slice(), rng) : questions.slice();
    this.cursor = 0;
    this.laps = 0;
    this.last = null;
  }

  get size() { return this.order.length; }

  next() {
    if (!this.order.length) return null;
    if (this.cursor >= this.order.length) {
      this.cursor = 0;
      this.laps++;
      if (this.shuffled) {
        shuffle(this.order, this.rng);
        if (this.order.length > 1 && this.order[0] === this.last) [this.order[0], this.order[1]] = [this.order[1], this.order[0]];
      }
    }
    const q = this.order[this.cursor++];
    q.order = orderChoices(q, this.rng);
    this.last = q;
    return q;
  }
}

export const fmtTime = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
