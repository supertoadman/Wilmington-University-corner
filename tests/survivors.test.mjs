import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SpatialGrid, rngFrom, xpToNext, gainXp, computeStats, weaponStats, weaponLevelStats, levelText,
  newBuild, rollUpgrades, rollCorruptions, applyOffer, eligibleEvolutions, worstCorruption, corruptionLevel,
  orderChoices, letterOf, origAt, QuestionDeck, selectQuestions, fmtTime,
} from '../src/survivors/logic.js';
import { CHARACTERS, WEAPONS, PASSIVES, CORRUPTIONS, WEAPON_MAX, CORRUPTION_MAX, MAX_WEAPONS, ENEMIES, WAVES, RUN_SECONDS } from '../src/survivors/defs.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const ch = (id) => CHARACTERS.find((c) => c.id === id);

// ---------------------------------------------------------------------------
// Spatial grid
// ---------------------------------------------------------------------------
test('spatial grid queries match a brute-force search', () => {
  const rng = rngFrom(7);
  const grid = new SpatialGrid(48);
  const objs = Array.from({ length: 400 }, (_, i) => ({ i, x: (rng() - 0.5) * 2000, y: (rng() - 0.5) * 2000, r: 4 + rng() * 30 }));
  objs.forEach((o) => grid.insert(o));
  assert.equal(grid.count, 400);
  for (let k = 0; k < 200; k++) {
    const x = (rng() - 0.5) * 2200, y = (rng() - 0.5) * 2200, r = rng() * 120;
    const got = grid.query(x, y, r).map((o) => o.i).sort((a, b) => a - b);
    const want = objs.filter((o) => Math.hypot(o.x - x, o.y - y) <= r + o.r).map((o) => o.i);
    assert.deepEqual(got, want);
  }
});

test('spatial grid finds the nearest object, honoring a filter and a range', () => {
  const rng = rngFrom(11);
  const grid = new SpatialGrid(40);
  const objs = Array.from({ length: 300 }, (_, i) => ({ i, x: (rng() - 0.5) * 1500, y: (rng() - 0.5) * 1500, dead: rng() < 0.3 }));
  objs.forEach((o) => grid.insert(o));
  for (let k = 0; k < 100; k++) {
    const x = (rng() - 0.5) * 1600, y = (rng() - 0.5) * 1600;
    const alive = objs.filter((o) => !o.dead);
    const best = alive.reduce((b, o) => (Math.hypot(o.x - x, o.y - y) < Math.hypot(b.x - x, b.y - y) ? o : b));
    assert.equal(grid.nearest(x, y, Infinity, (o) => !o.dead), best);
  }
  assert.equal(grid.nearest(5000, 5000, 100), null);
});

test('spatial grid clears between frames and reuses its buckets', () => {
  const grid = new SpatialGrid(32);
  grid.insert({ x: 10, y: 10, r: 5 });
  grid.insert({ x: 12, y: 8, r: 5 });
  assert.equal(grid.query(10, 10, 1).length, 2);
  grid.clear();
  assert.equal(grid.count, 0);
  assert.equal(grid.query(10, 10, 50).length, 0);
  grid.insert({ x: -100, y: -100, r: 60 }); // a boss-sized body is found from a neighboring cell
  assert.equal(grid.query(-30, -100, 12).length, 1);
});

test('a crowd of 400 moving enemies stays cheap to query', () => {
  const grid = new SpatialGrid(48);
  const rng = rngFrom(3);
  const foes = Array.from({ length: 400 }, () => ({ x: (rng() - 0.5) * 900, y: (rng() - 0.5) * 900, r: 10 }));
  const out = [];
  const t0 = performance.now();
  let checks = 0;
  for (let frame = 0; frame < 120; frame++) {
    grid.clear();
    for (const f of foes) { f.x += rng() - 0.5; f.y += rng() - 0.5; grid.insert(f); }
    for (const f of foes) checks += grid.query(f.x, f.y, f.r, out).length;
  }
  assert.ok(checks >= 400 * 120); // everyone at least finds itself
  assert.ok(performance.now() - t0 < 3000, 'separation for 400 foes over 120 frames ran too slowly');
});

// ---------------------------------------------------------------------------
// Experience
// ---------------------------------------------------------------------------
test('the XP curve grows quadratically, so strong builds still get questions at a steady pace', () => {
  assert.equal(xpToNext(1), 5);
  assert.equal(xpToNext(2), 13);
  assert.equal(xpToNext(3), 22);
  assert.equal(xpToNext(10), 133);
  assert.equal(xpToNext(20), 427);
  let total = 0;
  for (let l = 1; l < 80; l++) { assert.ok(xpToNext(l + 1) > xpToNext(l)); if (l < 30) total += xpToNext(l); }
  assert.ok(total > 8000 && total < 12000, `${total} XP to reach level 30`);
});

test('gaining XP can level up several times and keeps the remainder', () => {
  const s = { level: 1, xp: 0 };
  assert.equal(gainXp(s, 4), 0);
  assert.equal(gainXp(s, 1), 1); // 5 reached
  assert.deepEqual(s, { level: 2, xp: 0 });
  assert.equal(gainXp(s, 13 + 22 + 7), 2); // through level 3 and 4, 7 left over
  assert.deepEqual(s, { level: 4, xp: 7 });
});

// ---------------------------------------------------------------------------
// Stats: upgrades add, corruptions multiply
// ---------------------------------------------------------------------------
test('base stats and character perks', () => {
  const s = computeStats(null);
  assert.equal(s.maxHp, 100);
  assert.equal(s.might, 1);
  assert.equal(s.cooldown, 1);
  near(computeStats(ch('advocate')).might, 1.1);
  near(computeStats(ch('scholar')).cooldown, 0.9);
  assert.equal(computeStats(ch('bailiff')).maxHp, 120);
  assert.equal(computeStats(ch('bailiff')).armor, 1);
  near(computeStats(ch('paladin')).regen, 0.4);
});

test('relic levels add up', () => {
  const s = computeStats(null, { might: 3, quill: 2, candle: 5, mirror: 2, armor: 4, boots: 1, magnet: 2, heart: 2 });
  near(s.might, 1.3);
  near(s.cooldown, 0.84);
  near(s.area, 1.5);
  assert.equal(s.amount, 2);
  assert.equal(s.armor, 4);
  near(s.move, 1.1);
  near(s.magnet, 1.5);
  assert.equal(s.maxHp, 140);
  near(s.regen, 0.4);
});

test('each corruption stack multiplies its stat', () => {
  near(computeStats(null, {}, { rust: 1 }).might, 0.85);
  near(computeStats(null, {}, { rust: 2 }).might, 0.85 * 0.85);
  near(computeStats(null, {}, { shackles: 1 }).move, 0.85);
  near(computeStats(null, {}, { hourglass: 1 }).cooldown, 1.18);
  near(computeStats(null, {}, { lantern: 1 }).area, 0.8);
  near(computeStats(null, {}, { shattered: 1 }).magnet, 0.65);
  near(computeStats(null, {}, { veil: 2 }).damageTaken, 1.15 * 1.15);
  const beacon = computeStats(null, {}, { beacon: 1 });
  near(beacon.enemySpeed, 1.2);
  near(beacon.spawnRate, 1.2);
  const tithe = computeStats(null, {}, { tithe: 2 });
  assert.equal(tithe.maxHp, Math.round(100 * 0.85 * 0.85));
  near(tithe.chip, 2 / 6);
});

test('a corruption cuts into what its relic gave, and floors keep stats sane', () => {
  // Might +30% then one Rusted Edge: 1.3 × 0.85.
  near(computeStats(null, { might: 3 }, { rust: 1 }).might, 1.3 * 0.85);
  // The Bailiff's 120 HP, +40% from the amulet, then one Blood Tithe.
  assert.equal(computeStats(ch('bailiff'), { heart: 2 }, { tithe: 1 }).maxHp, Math.round(120 * 1.4 * 0.85));
  // Cooldown can't fall below 20% of base however many quills, nor movement below 30%.
  assert.equal(computeStats(null, { quill: 5 }, {}).cooldown, 0.6);
  assert.equal(computeStats(null, {}, { shackles: 5, }).move, Math.max(0.3, 0.85 ** 5));
  assert.equal(computeStats(null, {}, { lantern: 5, shattered: 5 }).magnet, Math.max(0.2, 0.65 ** 5));
});

test('weapon levels and player stats combine', () => {
  const raw = weaponLevelStats('wand', 3); // +1 amount, then −0.2 s
  assert.equal(raw.amount, 2);
  near(raw.cooldown, 1.0);
  const stats = computeStats(null, { might: 2, mirror: 1, quill: 1 }, { hourglass: 1 });
  const w = weaponStats('wand', 3, stats);
  near(w.damage, 10 * 1.2);
  assert.equal(w.amount, 3);
  near(w.cooldown, 1.0 * 0.92 * 1.18);
  assert.equal(weaponLevelStats('whip', WEAPON_MAX).damage, 10 + 5 * 6);
  assert.equal(weaponLevelStats('whip', 99).damage, 10 + 5 * 6); // capped at max level
  assert.equal(levelText('whip', 2), '+1 projectile');
  assert.equal(levelText('whip', 4), '+5 damage, +10% area');
  assert.equal(levelText('wand', 3), '−0.2 s cooldown');
});

test('every weapon has a full level table, and every base weapon an evolution through a real relic', () => {
  for (const [id, w] of Object.entries(WEAPONS)) {
    if (w.evolved) { assert.ok(WEAPONS[w.from], `${id} evolves from a real weapon`); continue; }
    assert.equal(w.levels.length, WEAPON_MAX - 1, id);
    assert.ok(PASSIVES[w.evolve.with], `${id} evolves with a real relic`);
    assert.equal(WEAPONS[w.evolve.into].from, id);
  }
  assert.ok(Object.values(WEAPONS).filter((w) => !w.evolved).length >= 8);
  assert.ok(Object.keys(PASSIVES).length >= 8);
  assert.ok(Object.keys(CORRUPTIONS).length >= 8);
  for (const c of Object.values(CORRUPTIONS)) assert.ok(PASSIVES[c.twin], `${c.name} twins a relic`);
  for (const wave of WAVES) for (const id of Object.keys(wave.foes)) assert.ok(ENEMIES[id], id);
});

// ---------------------------------------------------------------------------
// Level-up offers
// ---------------------------------------------------------------------------
test('a right answer offers three different, valid upgrades', () => {
  for (let seed = 1; seed < 200; seed++) {
    const rng = rngFrom(seed);
    const build = newBuild('whip');
    build.passives = { might: 5, boots: 2 };
    const offers = rollUpgrades(build, rng);
    assert.equal(offers.length, 3);
    assert.equal(new Set(offers.map((o) => `${o.kind}:${o.id}`)).size, 3);
    for (const o of offers) {
      assert.ok(['weapon', 'passive'].includes(o.kind));
      if (o.kind === 'passive') assert.notEqual(o.id, 'might', 'a maxed relic is never offered');
      if (o.kind === 'weapon' && o.id === 'whip') assert.equal(o.level, 2);
    }
  }
});

test('a full weapon bar only offers levels for what you hold', () => {
  const build = newBuild();
  build.weapons = ['whip', 'wand', 'axe', 'cross', 'aura', 'tomes'].map((id) => ({ id, level: 2 }));
  assert.equal(build.weapons.length, MAX_WEAPONS);
  for (let seed = 1; seed < 100; seed++) {
    for (const o of rollUpgrades(build, rngFrom(seed))) if (o.kind === 'weapon') assert.ok(build.weapons.some((w) => w.id === o.id));
  }
});

test('when nothing is left to level, the offers fall back to a heal and gold', () => {
  const build = newBuild();
  build.weapons = Object.keys(WEAPONS).filter((id) => !WEAPONS[id].evolved).slice(0, MAX_WEAPONS).map((id) => ({ id, level: WEAPON_MAX }));
  build.passives = { boots: 5, armor: 5, magnet: 5, candle: 5, bracer: 5, quill: 5 }; // all maxed, slots full
  const kinds = rollUpgrades(build, rngFrom(5)).map((o) => o.kind);
  // Evolutions (here the axe, cross, wand and aura qualify) still lead; nothing else is left to offer.
  assert.deepEqual(kinds, ['evolve', 'heal', 'gold']);
});

test('a maxed weapon with its relic offers its evolution first', () => {
  const build = newBuild('whip');
  build.weapons[0].level = WEAPON_MAX;
  assert.deepEqual(eligibleEvolutions(build), []);
  build.passives.heart = 1;
  assert.deepEqual(eligibleEvolutions(build), [{ kind: 'evolve', id: 'scourge', from: 'whip' }]);
  const offers = rollUpgrades(build, rngFrom(9));
  assert.deepEqual(offers[0], { kind: 'evolve', id: 'scourge', from: 'whip' });
  applyOffer(build, offers[0]);
  assert.deepEqual(build.weapons, [{ id: 'scourge', level: 1 }]);
  for (let seed = 1; seed < 50; seed++) {
    assert.ok(!rollUpgrades(build, rngFrom(seed)).some((o) => o.kind === 'weapon' && (o.id === 'whip' || o.id === 'scourge')));
  }
});

test('every third answer in a row offers to purify a corruption, if one is carried', () => {
  const build = newBuild('wand');
  assert.ok(!rollUpgrades(build, rngFrom(1), { streak: 3 }).some((o) => o.kind === 'purify'), 'nothing to purify');
  applyOffer(build, { kind: 'corruption', id: 'rust' });
  applyOffer(build, { kind: 'corruption', id: 'veil' });
  applyOffer(build, { kind: 'corruption', id: 'veil' });
  assert.ok(!rollUpgrades(build, rngFrom(1), { streak: 2 }).some((o) => o.kind === 'purify'));
  const offers = rollUpgrades(build, rngFrom(1), { streak: 6 });
  assert.equal(offers.length, 3);
  assert.deepEqual(offers[2], { kind: 'purify', id: 'veil' }); // the worst corruption
  assert.equal(worstCorruption(build), 'veil');
  applyOffer(build, offers[2]);
  assert.deepEqual(build.corruptions, { rust: 1, veil: 1 });
  applyOffer(build, { kind: 'purify', id: 'rust' });
  assert.deepEqual(build.corruptions, { veil: 1 });
  assert.equal(build.purified, 2);
});

test('a wrong answer offers three different corruptions, each stacking to its cap', () => {
  const build = newBuild('wand');
  for (let seed = 1; seed < 100; seed++) {
    const offers = rollCorruptions(build, rngFrom(seed));
    assert.equal(offers.length, 3);
    assert.equal(new Set(offers.map((o) => o.id)).size, 3);
    offers.forEach((o) => assert.ok(CORRUPTIONS[o.id]));
  }
  for (let i = 0; i < 9; i++) applyOffer(build, { kind: 'corruption', id: 'rust' });
  assert.equal(build.corruptions.rust, CORRUPTION_MAX);
  assert.equal(build.taken.rust, 9);
  for (let seed = 1; seed < 50; seed++) assert.ok(!rollCorruptions(build, rngFrom(seed)).some((o) => o.id === 'rust'));
  for (const id of Object.keys(CORRUPTIONS)) build.corruptions[id] = CORRUPTION_MAX;
  assert.deepEqual(rollCorruptions(build, rngFrom(1)), [{ kind: 'toll' }]);
  assert.equal(corruptionLevel(build), 1);
  assert.equal(corruptionLevel(newBuild()), 0);
});

test('a debuff card changes the stats it names', () => {
  const build = newBuild('whip');
  build.passives.boots = 2;
  const before = computeStats(ch('advocate'), build.passives, build.corruptions);
  applyOffer(build, { kind: 'corruption', id: 'shackles' });
  applyOffer(build, { kind: 'corruption', id: 'beacon' });
  const after = computeStats(ch('advocate'), build.passives, build.corruptions);
  near(after.move, before.move * 0.85);
  near(after.enemySpeed, 1.2);
  near(after.might, before.might);
  applyOffer(build, { kind: 'passive', id: 'might' });
  near(computeStats(ch('advocate'), build.passives, build.corruptions).might, 1.2);
});

// ---------------------------------------------------------------------------
// Questions and their choices
// ---------------------------------------------------------------------------
const Q = (o, extra = {}) => ({ q: 'Stem', o, a: 0, ...extra });

test('a fixed question keeps its choices in order', () => {
  const q = Q(['A only', 'B only', 'Both A and B', 'Neither'], { fixed: true, a: 2 });
  for (let seed = 1; seed < 100; seed++) assert.deepEqual(orderChoices(q, rngFrom(seed)), [0, 1, 2, 3]);
});

test('other questions shuffle their choices, and letters map back to the original choice', () => {
  const q = Q(['right', 'w1', 'w2', 'w3', 'w4']);
  const orders = new Set();
  for (let seed = 1; seed < 200; seed++) {
    q.order = orderChoices(q, rngFrom(seed));
    assert.deepEqual([...q.order].sort(), [0, 1, 2, 3, 4]);
    orders.add(q.order.join(''));
    const shown = q.order.indexOf(q.a);
    assert.equal(origAt(q, shown), q.a);
    assert.equal(letterOf(q, q.a), 'ABCDE'[shown]);
  }
  assert.ok(orders.size > 20, 'choices actually move');
  assert.ok([...orders].some((o) => !o.startsWith('0')), 'the right answer is not always A');
});

test('the deck deals every question once a lap, then reshuffles without an immediate repeat', () => {
  const qs = Array.from({ length: 7 }, (_, i) => Q(['a', 'b', 'c'], { id: `c/s/${i}`, fixed: i === 3 }));
  const deck = new QuestionDeck(qs, { shuffled: true, rng: rngFrom(4) });
  for (let lap = 0; lap < 5; lap++) {
    const seen = new Set();
    let prev = deck.last;
    for (let i = 0; i < qs.length; i++) {
      const q = deck.next();
      assert.notEqual(q, prev);
      prev = q;
      seen.add(q.id);
      assert.equal(q.order.length, 3);
      if (q.fixed) assert.deepEqual(q.order, [0, 1, 2]);
    }
    assert.equal(seen.size, qs.length);
  }
  assert.equal(deck.laps, 4);
  const ordered = new QuestionDeck(qs, { shuffled: false, rng: rngFrom(1) });
  assert.deepEqual(Array.from({ length: 9 }, () => ordered.next().id), [0, 1, 2, 3, 4, 5, 6, 0, 1].map((i) => `c/s/${i}`));
  assert.equal(new QuestionDeck([]).next(), null);
});

test('a run can ask only the questions missed before, or an explicit list', () => {
  const qs = ['a/x/0', 'a/x/1', 'b/y/0'].map((id) => ({ id }));
  assert.equal(selectQuestions(qs).length, 3);
  assert.deepEqual(selectQuestions(qs, { missedOnly: true, isMissed: (id) => id.startsWith('a/') }).map((q) => q.id), ['a/x/0', 'a/x/1']);
  assert.deepEqual(selectQuestions(qs, { only: new Set(['b/y/0']) }).map((q) => q.id), ['b/y/0']);
  assert.equal(fmtTime(0), '00:00');
  assert.equal(fmtTime(905.7), '15:05');
});

// ---------------------------------------------------------------------------
// The world, simulated without a screen
// ---------------------------------------------------------------------------
const { World } = await import('../src/survivors/engine.js');

function simWorld(opts = {}, hooks = {}) {
  const canvas = { clientWidth: 1280, clientHeight: 800, getContext: () => ({}) };
  const w = new World(canvas, hooks);
  w.reset({ character: 'advocate', seed: 42, ...opts });
  return w;
}

test('a simulated run levels up through questions, spawns hundreds of foes and a boss, and stays fast', () => {
  const rng = rngFrom(99);
  let asked = 0, chests = 0, bossSeen = null, peak = 0, slowest = 0;
  const hooks = {
    onLevelUp: () => {
      asked++;
      // Alternate right and wrong answers: a boon, then a corruption.
      const offers = asked % 4 === 0 ? rollCorruptions(w.build, rng) : rollUpgrades(w.build, rng, { streak: asked % 4 });
      applyOffer(w.build, offers[0]);
      w.syncBuild();
      w.levelResolved();
    },
    onChest: () => { chests++; w.chestResolved(); },
    onBoss: (def) => { bossSeen = bossSeen || def.name; },
  };
  const w = simWorld({}, hooks);
  w.hurt = () => {}; // an invulnerable survivor, so the whole six minutes run
  for (let f = 0; f < 6 * 60 * 30; f++) {
    w.input.x = Math.cos(f / 200); w.input.y = Math.sin(f / 330);
    const t0 = performance.now();
    w.update(1 / 30);
    const ms = performance.now() - t0;
    if (w.enemies.length > 250) slowest = Math.max(slowest, ms);
    peak = Math.max(peak, w.enemies.length);
  }
  assert.ok(Math.abs(w.time - 360) < 0.5);
  assert.ok(asked >= 6, `levelled ${asked} times`); // a passive bot that circles and never aims
  assert.equal(w.player.level, asked + 1);
  assert.ok(w.kills > 300, `${w.kills} kills`);
  assert.ok(peak >= 140, `peak ${peak} foes`);
  assert.equal(bossSeen, 'The Vampire Lord');
  assert.ok(w.build.weapons.length >= 2);
  assert.ok(Object.keys(w.build.corruptions).length >= 1);
  for (const e of w.enemies) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.hp));
  assert.ok(Number.isFinite(w.player.x) && Number.isFinite(w.player.y));
  assert.ok(slowest < 40, `a crowded frame took ${slowest.toFixed(1)} ms`);
});

test('three hundred foes update in a few milliseconds a frame', () => {
  const w = simWorld({ seed: 5 });
  w.hurt = () => {};
  w.build.weapons = ['whip', 'wand', 'axe', 'cross', 'aura', 'tomes'].map((id) => ({ id, level: 8 }));
  w.syncBuild();
  for (let i = 0; i < 320; i++) w.spawn(['skeleton', 'zombie', 'ghoul', 'bat'][i % 4], (i % 20) * 30 - 300, Math.floor(i / 20) * 30 - 240, { hp: 50 });
  w.update(1 / 60);
  const t0 = performance.now();
  for (let f = 0; f < 120; f++) w.update(1 / 60);
  const per = (performance.now() - t0) / 120;
  assert.ok(w.enemies.length > 250, `${w.enemies.length} alive`);
  assert.ok(per < 8, `${per.toFixed(2)} ms per frame`);
});

test('corruptions slow the survivor in the world, and the blood tithe never kills', () => {
  const w = simWorld({ seed: 8 });
  w.direct = () => {}; // an empty crypt
  w.input.x = 1;
  for (let f = 0; f < 60; f++) w.update(1 / 60);
  const free = w.player.x;
  w.reset({ seed: 8 });
  w.direct = () => {};
  applyOffer(w.build, { kind: 'corruption', id: 'shackles' });
  applyOffer(w.build, { kind: 'corruption', id: 'shackles' });
  w.syncBuild();
  w.input.x = 1;
  for (let f = 0; f < 60; f++) w.update(1 / 60);
  near(w.player.x / free, 0.85 * 0.85, 0.01);
  for (let i = 0; i < 5; i++) applyOffer(w.build, { kind: 'corruption', id: 'tithe' });
  w.syncBuild();
  w.player.hp = 3;
  for (let f = 0; f < 60 * 40; f++) w.update(1 / 60);
  assert.equal(w.player.hp, 1);
  assert.equal(w.over, false);
});

test('surviving fifteen minutes wins; endless keeps going', () => {
  let won = false;
  const w = simWorld({ seed: 3 }, { onVictory: () => { won = true; } });
  w.hurt = () => {};
  w.direct = () => {};
  w.time = RUN_SECONDS - 0.1;
  w.update(0.05); w.update(0.05); w.update(0.05);
  assert.ok(won && w.over && w.won);
  const e = simWorld({ seed: 3, endless: true });
  e.hurt = () => {};
  e.time = RUN_SECONDS - 0.1;
  for (let f = 0; f < 30; f++) e.update(0.05);
  assert.equal(e.over, false);
  assert.ok(e.time > RUN_SECONDS);
});
