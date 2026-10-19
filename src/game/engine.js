// Sanctum Run engine: an endless isometric path through the sanctuary, a runner, the
// pursuer, and the realm (divine or corrupt) everything is drawn in.
//
// World units are tiles on the pack's 256×128 isometric grid. The path only ever heads up
// the screen, northeast (-y) or northwest (-x), so every sprite faces the way it was drawn
// (northeast) or its mirror. Each straight is 3 lanes wide and ends in a 3×3 corner.

import { asset, audio } from './assets.js';

const ZPX = 150; // screen px per tile of height, at scale 1
const DIRS = [
  { dx: 0, dy: -1, rx: 1, ry: 0, flip: false }, // northeast; the runner's right is +x
  { dx: -1, dy: 0, rx: 0, ry: -1, flip: true }, // northwest; the runner's right is -y
];
// Size each sprite is drawn at (px at scale 1 for the full image or frame) and its depth bias.
const SIZE = {
  runner: 330, chaser: 360, barrier: 470, 'toppled-statue': 470, trap: 250, 'brazier-obstacle': 240,
  lintel: 560, gateway: 560, 'dead-end-wall': 520, 'gap-edge': 300,
  column: 330, statue: 330, brazier: 280, cypress: 400, urn: 210, 'broken-wall': 400, temple: 1150,
  laurel: 92, wisdom: 104, aegis: 104,
};
const OBSTACLES = {
  barrier: { lanes: 3, depth: 0.3, clear: 0.65, weight: 3 },
  'toppled-statue': { lanes: 3, depth: 0.4, clear: 0.75, weight: 1.6 },
  lintel: { lanes: 3, depth: 0.22, slide: true, weight: 3 },
  trap: { lanes: 1, depth: 0.42, clear: 0.35, weight: 2.2 },
  braziers: { lanes: 2, depth: 0.4, clear: 99, weight: 2.2 },
  gap: { lanes: 3, gap: 2, weight: 2.2, after: 160 },
};
const PACE = { gentle: 5.4, standard: 6.6, swift: 8 };
const GRAVITY = 30;
const JUMP_V = 10.6;
const RUNNER_RADIUS = 0.12;
const RECOVERY_RUNWAY = 4;

// Ground-contact centers measured on the 640px artwork. Pack anchors mark the
// lowest alpha pixel, which is NOT the center of an isometric footprint. Both
// lintel layers must use the same anchor. The corrupt barrier faces the opposite
// way to its divine counterpart, so it also needs an art-specific mirror.
const GROUND_ART = {
  'divine-barrier': { anchor: [330 / 640, 414 / 640] },
  'corrupt-barrier': { anchor: [326 / 640, 424 / 640], mirror: true },
  'divine-toppled-statue': { anchor: [320 / 640, 492 / 640] },
  'corrupt-toppled-statue': { anchor: [320 / 640, 492 / 640] },
  'divine-trap': { anchor: [320 / 640, 326 / 640], heightScale: 0.78 },
  'corrupt-trap': { anchor: [320 / 640, 326 / 640], heightScale: 0.78 },
  'divine-brazier-obstacle': { anchor: [320 / 640, 510 / 640] },
  'corrupt-brazier-obstacle': { anchor: [320 / 640, 520 / 640] },
  'divine-slide-lintel-back': { anchor: [320 / 640, 528 / 640] },
  'divine-slide-lintel-front': { anchor: [320 / 640, 528 / 640] },
  'corrupt-slide-lintel-back': { anchor: [320 / 640, 552 / 640] },
  'corrupt-slide-lintel-front': { anchor: [320 / 640, 552 / 640] },
};

export const REALMS = ['divine', 'corrupt'];
const BG = { divine: ['divine-far-sky', 'divine-middle-ruins', 'divine-near-clouds'], corrupt: ['corrupt-far-sky', 'corrupt-middle-ruins', 'corrupt-near-smoke'] };

/** Everything the engine draws, for preloading (characters: the runner's two sheets). */
export function artFor(character) {
  const ids = [];
  for (const r of REALMS) {
    ids.push(`${r}-${character}-moves`, `${r}-chaser-run`, ...BG[r]);
    for (const k of ['barrier', 'toppled-statue', 'trap', 'brazier-obstacle', 'slide-lintel-back', 'slide-lintel-front', 'gateway', 'dead-end-wall', 'gap-edge',
      'column', 'statue', 'brazier', 'cypress', 'urn', 'broken-wall', 'temple', 'laurel', 'wisdom', 'aegis', 'effect-ring', 'effect-spark', 'effect-shadow']) ids.push(`${r}-${k}`);
  }
  return ids;
}

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

export class Engine {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.img = {};
    this.palettes = null;
    this.time = 0;
    this.resize();
  }

  setArt(img, palettes) { this.img = img; this.palettes = palettes; }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.W = w; this.H = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    // Show a good stretch of path ahead on any screen; phones in portrait zoom in so the
    // three lanes span most of the width.
    this.k = w < h ? clamp(w / 1050, 0.26, 0.5) : clamp(Math.min(w / 2300, h / 1300), 0.24, 0.6);
  }

  // -------------------------------------------------------------------------
  // Run setup
  // -------------------------------------------------------------------------
  reset({ character = 'socrates', pace = 'standard', gateSpacing = 100, gates = 0, demo = false, seed = Date.now() } = {}) {
    this.character = character;
    this.demo = demo;
    this.rand = rng(seed);
    this.baseSpeed = PACE[pace] || PACE.standard;
    this.gateSpacing = gateSpacing;
    this.gatesLeft = gates;
    this.nextGateD = demo ? Infinity : 34;
    this.pendingGate = null;
    this.gateIndex = 0;
    this.fallenSent = false;
    this.segments = [];
    this.cells = new Map();
    this.particles = [];
    this.texts = [];
    this.mode = 'run'; // run | brake | gate | fall | caught | done
    this.realm = 'divine';
    this.corruption = 0;
    this.wave = null; // realm transition { from, to, t }
    this.r = {
      seg: 0, t: 2, l: 0, lane: 0, z: 0, vz: 0, speed: this.baseSpeed, slide: 0, stumble: 0, invuln: 0,
      shield: false, hearts: 3, anim: 0, turnQueued: false, fallT: 0, landT: 0, airT: 0,
    };
    this.chaser = { gap: 9, target: 9, lunge: 0, anim: 0 };
    this.stats = { laurels: 0, distance: 0, score: 0, insight: 0, falls: 0 };
    this.shake = 0;
    this.flash = null;
    this.step = 0;
    this.cam = null;
    this.ensure();
  }

  get runnerSeg() { return this.segments[this.r.seg]; }
  get distance() { const s = this.runnerSeg; return s.d0 + this.r.t; }

  // -------------------------------------------------------------------------
  // Path generation
  // -------------------------------------------------------------------------
  ensure() {
    let changed = false;
    while (!this.segments.length || this.segments.at(-1).d0 + this.segments.at(-1).len < (this.segments.length ? this.distance : 0) + 80) {
      this.addSegment();
      changed = true;
    }
    // Forget straights well behind the pursuer.
    while (this.r.seg > 2 && this.segments[0].d0 + this.segments[0].len < this.distance - 40) {
      this.segments.shift();
      this.r.seg--;
      changed = true;
    }
    if (changed) this.rebuildCells();
  }

  addSegment() {
    const prev = this.segments.at(-1);
    const R = this.rand;
    const first = !prev;
    const dir = first ? 0 : 1 - prev.dir;
    const D = DIRS[dir];
    const sx = first ? 0 : prev.sx + DIRS[prev.dir].dx * prev.len;
    const sy = first ? 0 : prev.sy + DIRS[prev.dir].dy * prev.len;
    const d0 = first ? 0 : prev.d0 + prev.len;
    const difficulty = clamp(d0 / 1600, 0, 1);
    const len = first ? 30 : Math.round(lerp(26, 16, difficulty) + R() * 10);
    const seg = { sx, sy, dir, len, d0, items: [], gaps: [], terrace: { left: null, right: null } };

    // Features along the straight: a gate when one is due, obstacles between them.
    const used = []; // [from, to] spans of t that hold something
    const free = (a, b) => used.every(([x, y]) => b < x || a > y);
    if (!this.demo && this.gatesLeft > 0 && this.nextGateD < d0 + len - 7) {
      const t = Math.max(7, Math.round(this.nextGateD - d0));
      if (t < len - 6) {
        seg.items.push({ kind: 'gate', t, l: 0, state: 'closed', index: this.gateIndex = (this.gateIndex || 0) + 1 });
        used.push([t - 6, t + 4]);
        this.gatesLeft--;
        this.nextGateD = d0 + t + this.gateSpacing;
      }
    }
    const spacing = () => lerp(10, 6.2, difficulty) + R() * 3.5 - this.corruption / 60;
    for (let t = first ? 14 : 5 + R() * 3; t < len - 4; t += spacing()) {
      const at = Math.round(t);
      if (!free(at - 2, at + 2)) continue;
      const pool = Object.entries(OBSTACLES).filter(([, o]) => !o.after || d0 > o.after);
      let pick = R() * pool.reduce((n, [, o]) => n + o.weight, 0);
      const [kind, o] = pool.find(([, x]) => (pick -= x.weight) < 0) || pool[0];
      if (o.gap) {
        if (at + o.gap >= len - 3) continue;
        seg.gaps.push([at, at + o.gap - 1]);
        seg.items.push({ kind: 'gap', t: at, l: 0, len: o.gap });
        used.push([at - 2, at + o.gap + 1]);
        continue;
      }
      const item = { kind, t: at, l: 0, lanes: [-1, 0, 1] };
      if (o.lanes === 1) item.lanes = [Math.floor(R() * 3) - 1];
      if (o.lanes === 2) { const open = Math.floor(R() * 3) - 1; item.lanes = [-1, 0, 1].filter((x) => x !== open); }
      seg.items.push(item);
      used.push([at - 2, at + 2]);
    }

    // Laurels in runs along one lane, lifted over anything that has to be jumped.
    for (let t = first ? 6 : 3; t < len - 3; t += 6 + Math.floor(R() * 6)) {
      const lane = Math.floor(R() * 3) - 1;
      const n = 4 + Math.floor(R() * 4);
      for (let i = 0; i < n && t + i < len - 2; i++) {
        const at = t + i;
        const blocker = seg.items.find((it) => it.t === at && (it.lanes?.includes(lane) || it.kind === 'gap' || it.kind === 'gate'));
        const inGap = seg.gaps.some(([a, b]) => at >= a && at <= b);
        if (blocker?.kind === 'gate' || blocker?.kind === 'lintel' || (blocker && !OBSTACLES[blocker.kind]?.clear && !inGap)) continue;
        if (blocker && OBSTACLES[blocker.kind]?.clear > 2) continue;
        const near = seg.items.find((it) => Math.abs(it.t - at) <= 1 && it.kind !== 'gate' && (it.kind === 'gap' || (it.lanes?.includes(lane) && OBSTACLES[it.kind]?.clear < 2)));
        seg.items.push({ kind: 'laurel', t: at, l: lane, z: near || inGap ? 1.05 - Math.abs((near?.t ?? at) - at) * 0.35 : 0.42 });
      }
    }
    if (!first && R() < 0.22) seg.items.push({ kind: R() < 0.5 ? 'wisdom' : 'aegis', t: Math.round(len / 2 + (R() - 0.5) * 6), l: Math.floor(R() * 3) - 1, z: 0.5 });

    // Terraces: the side behind the path (left on NE, right on NW) carries the tall colonnade;
    // the side toward the camera gets low urns and braziers so nothing hides the runner.
    const back = dir === 0 ? -1 : 1;
    if (R() < 0.75) seg.terrace[back] = { from: 3, to: len - 3, tall: true };
    if (R() < 0.45) seg.terrace[-back] = { from: 4 + Math.floor(R() * 4), to: len - 4 - Math.floor(R() * 4), tall: false };
    for (const side of [-1, 1]) {
      const tr = seg.terrace[side];
      if (!tr) continue;
      for (let t = tr.from; t <= tr.to; t++) {
        const k = (t - tr.from) % 4;
        let kind = null;
        if (tr.tall) kind = k === 0 ? 'column' : k === 2 ? ['statue', 'cypress', 'brazier', 'broken-wall', 'cypress'][Math.floor(R() * 5)] : null;
        else kind = k === 1 ? ['urn', 'brazier', 'urn'][Math.floor(R() * 3)] : null;
        if (kind) seg.items.push({ kind, t, l: side * 2, decor: true });
      }
    }
    // Now and then a temple floats beyond the colonnade.
    if (!first && R() < 0.3 && len > 18) seg.island = { t: Math.round(len / 2), l: back * 6 };
    if (first) seg.island = { t: 16, l: back * 6 };

    // The wall past each corner says "turn".
    seg.items.push({ kind: 'dead-end-wall', t: len + 2, l: 0, decor: true, wall: true });
    this.segments.push(seg);
  }

  rebuildCells() {
    const cells = new Map();
    const put = (x, y, kind, extra = {}) => {
      const key = `${x},${y}`;
      const prev = cells.get(key);
      if (prev && (prev.kind === 'path' || kind !== 'path')) return;
      cells.set(key, { x, y, kind, ...extra });
    };
    for (const seg of this.segments) {
      const D = DIRS[seg.dir];
      const inGap = (t) => seg.gaps.some(([a, b]) => t >= a && t <= b);
      for (let t = 0; t <= seg.len + 1; t++) {
        if (inGap(t)) continue;
        for (let l = -1; l <= 1; l++) put(seg.sx + D.dx * t + D.rx * l, seg.sy + D.dy * t + D.ry * l, 'path', { inlay: l === 0 && t % 4 === 2 && t <= seg.len - 2 });
      }
      for (const side of [-1, 1]) {
        const tr = seg.terrace[side];
        if (!tr) continue;
        for (let t = tr.from; t <= tr.to; t++) put(seg.sx + D.dx * t + D.rx * side * 2, seg.sy + D.dy * t + D.ry * side * 2, 'terrace');
      }
      if (seg.island) {
        const { t: it, l: il } = seg.island;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) put(seg.sx + D.dx * (it + a) + D.rx * (il + b), seg.sy + D.dy * (it + a) + D.ry * (il + b), 'island');
      }
    }
    this.cells = cells;
    this.cellList = [...cells.values()].sort((a, b) => a.x + a.y - (b.x + b.y));
  }

  pos(seg, t, l) {
    const D = DIRS[seg.dir];
    return { x: seg.sx + D.dx * t + D.rx * l, y: seg.sy + D.dy * t + D.ry * l };
  }

  /** Point on the path `back` tiles behind the runner (for the pursuer). */
  behind(back) {
    let i = this.r.seg;
    let t = this.r.t - back;
    while (t < 0 && i > 0) { i--; t += this.segments[i].len; }
    return { seg: this.segments[i], t: Math.max(t, -2) };
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------
  input(action) {
    const r = this.r;
    if (this.mode !== 'run') return;
    const seg = this.runnerSeg;
    if (action === 'left' || action === 'right') {
      // Near a corner, the way it turns means "turn"; anything else changes lanes.
      const turn = seg.dir === 0 ? 'left' : 'right';
      if (action === turn && seg.len - r.t < 3.4 && r.t > seg.len - 3.4) {
        r.turnQueued = true;
        if (r.t >= seg.len - 1.1) this.turn();
        return;
      }
      r.lane = clamp(r.lane + (action === 'left' ? -1 : 1), -1, 1);
    } else if (action === 'jump') {
      if (r.z <= 0.001 && r.stumble <= 0) {
        r.vz = JUMP_V; r.slide = 0; r.airT = 0;
        audio.play('jump', { volume: 0.7 });
      }
    } else if (action === 'slide') {
      if (r.z > 0.05) r.vz = Math.min(r.vz, -16); // dive back down, then slide
      if (r.slide <= 0) audio.play(`${this.realm}-slide`, { volume: 0.6 });
      r.slide = 0.72;
    }
  }

  turn() {
    const r = this.r;
    const seg = this.runnerSeg;
    const next = this.segments[r.seg + 1];
    if (!next) return;
    const p = this.pos(seg, r.t, r.l);
    const D = DIRS[next.dir];
    r.seg++;
    r.t = (p.x - next.sx) * D.dx + (p.y - next.sy) * D.dy;
    r.l = (p.x - next.sx) * D.rx + (p.y - next.sy) * D.ry;
    r.lane = clamp(Math.round(r.l), -1, 1);
    r.turnQueued = false;
    audio.play(`${this.realm}-turn-whoosh`, { volume: 0.55 });
    this.ensure();
  }

  // -------------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------------
  update(dt) {
    // Small physics steps keep lane changes, jump clearance and edge crossings
    // consistent even when rendering stalls. Never simulate a whole hidden tab.
    let remaining = clamp(dt, 0, 0.1);
    while (remaining > 1e-8) {
      const step = Math.min(remaining, 1 / 120);
      this.simulate(step);
      remaining -= step;
    }
  }

  simulate(dt) {
    this.time += dt;
    const r = this.r;
    this.updateWave(dt);
    this.updateParticles(dt);
    this.shake = Math.max(0, this.shake - dt * 3);
    if (this.flash) { this.flash.t += dt; if (this.flash.t > this.flash.d) this.flash = null; }
    r.anim += dt;
    this.chaser.anim += dt;

    if (this.mode === 'gate' || this.mode === 'done') { this.updateChaser(dt); return; }
    if (this.mode === 'fall' || this.mode === 'caught') { this.updateFall(dt); this.updateChaser(dt); return; }

    const seg = this.runnerSeg;
    const difficulty = clamp(this.distance / 2000, 0, 1);
    let target = this.baseSpeed * (1 + 0.32 * difficulty) * (1 + 0.24 * this.corruption / 100);
    if (r.stumble > 0) target *= 0.55;
    if (this.mode === 'brake') {
      const gate = this.pendingGate;
      const left = gate.t - 1.7 - r.t;
      target = left <= 0.05 ? 0 : Math.min(target, Math.sqrt(2 * 9 * left));
      if (left <= 0.05) {
        r.speed = 0;
        this.mode = 'gate';
        this.hooks.onGate?.(gate);
        return;
      }
    }
    r.speed = lerp(r.speed, target, 1 - Math.exp(-dt * (this.mode === 'brake' ? 8 : 2.2)));
    if (this.demo || this.autoplay) this.autopilot();

    r.t += r.speed * dt;
    this.stats.distance = Math.max(this.stats.distance, this.distance);
    const dl = r.lane - r.l;
    r.l += Math.sign(dl) * Math.min(Math.abs(dl), 10 * dt);
    r.slide = Math.max(0, r.slide - dt);
    r.stumble = Math.max(0, r.stumble - dt);
    r.invuln = Math.max(0, r.invuln - dt);
    r.landT = Math.max(0, r.landT - dt);
    if (r.z > 0 || r.vz > 0) {
      r.airT += dt;
      r.z += r.vz * dt - GRAVITY * dt * dt / 2;
      r.vz -= GRAVITY * dt;
      if (r.z <= 0) { r.z = 0; r.vz = 0; r.landT = 0.12; audio.play('land', { volume: 0.45 }); if (r.slide > 0) r.slide = 0.72; }
    }

    // Footsteps, softly.
    if (r.z === 0 && r.slide <= 0 && (this.step -= dt) <= 0) { this.step = 1.2 * this.baseSpeed / Math.max(r.speed, 1); audio.play(`${this.realm}-footsteps`, { volume: 0.16 }); }

    // Corners: a queued turn happens on reaching the corner.
    if (r.turnQueued && r.t >= seg.len - 1.1) this.turn();

    this.collide();
    if (this.mode !== 'run' && this.mode !== 'brake') return;

    // Off the edge: a gap, or a corner taken straight on.
    const p = this.pos(this.runnerSeg, r.t, r.l);
    if (r.z <= 0.02 && !this.cells.has(`${Math.round(p.x)},${Math.round(p.y)}`)) { this.startFall(); return; }
    if (r.t > this.runnerSeg.len + 1.6) { this.startFall(); return; }

    this.updateChaser(dt);
    this.ensure();
  }

  collide() {
    const r = this.r;
    const seg = this.runnerSeg;
    for (const it of seg.items) {
      if (it.decor || it.done) continue;
      const near = Math.abs(it.t - r.t);
      if (it.kind === 'gate') {
        if (it.state === 'closed' && it.t - r.t < 2.6 && this.mode === 'run') {
          it.state = 'asking';
          this.pendingGate = it;
          this.mode = 'brake';
          r.lane = 0;
        }
        continue;
      }
      if (it.kind === 'laurel' || it.kind === 'wisdom' || it.kind === 'aegis') {
        if (near < 0.55 && Math.abs(it.l - r.l) < 0.6 && Math.abs((it.z ?? 0.4) - r.z - 0.4) < 0.9) this.collect(it);
        continue;
      }
      const o = OBSTACLES[it.kind];
      if (!o || it.kind === 'gap' || near > o.depth + RUNNER_RADIUS || r.invuln > 0) continue;
      if (!it.lanes.some((lane) => Math.abs(lane - r.l) < 0.5 + RUNNER_RADIUS)) continue;
      // A slide issued in the air is a dive, not immediate clearance below a beam.
      const hit = o.slide ? r.slide <= 0 || r.z > 0.05 : r.z < o.clear;
      if (hit) { it.done = true; this.hit(); return; }
    }
  }

  collect(it) {
    it.done = true;
    const p = this.pos(this.runnerSeg, it.t, it.l);
    if (it.kind === 'laurel') {
      const worth = this.realm === 'corrupt' ? 2 : 1;
      this.stats.laurels += worth;
      this.stats.score += 10 * worth;
      audio.play('collect-laurel', { volume: 0.45, rate: 0.96 + Math.random() * 0.1 });
      this.burst(p.x, p.y, it.z ?? 0.4, 5, 'spark');
    } else if (it.kind === 'wisdom') {
      this.stats.insight = Math.min(3, this.stats.insight + 1);
      audio.play('collect-wisdom', { volume: 0.7 });
      this.burst(p.x, p.y, 0.5, 12, 'spark');
      this.say('+1 Insight', '#f9dfa0');
    } else {
      this.r.shield = true;
      audio.play('activate-aegis', { volume: 0.7 });
      this.burst(p.x, p.y, 0.5, 12, 'ring');
      this.say('Aegis', '#f9dfa0');
    }
    this.hooks.onEvent?.(it.kind);
  }

  hit() {
    const r = this.r;
    this.shake = 1;
    if (r.shield) {
      r.shield = false;
      r.invuln = 1;
      audio.play(`${this.realm}-shield-ending`, { volume: 0.8 });
      this.flash = { color: '255,236,180', t: 0, d: 0.35 };
      this.say('The aegis holds', '#f9dfa0');
      this.hooks.onEvent?.('shield');
      return;
    }
    r.hearts--;
    r.stumble = 0.6;
    r.invuln = 1.6;
    this.chaser.lunge = 2.6;
    audio.play('damage', { volume: 0.8 });
    audio.play(`${this.realm}-chaser-growl`, { volume: 0.5 });
    this.flash = { color: '150,20,30', t: 0, d: 0.45 };
    this.hooks.onEvent?.('hit');
    if (r.hearts <= 0) this.caught();
  }

  startFall() {
    const r = this.r;
    this.mode = 'fall';
    r.fallT = 0;
    r.vz = 2;
    this.stats.falls++;
    audio.play(`${this.realm}-fall`, { volume: 0.8 });
  }

  updateFall(dt) {
    const r = this.r;
    r.fallT += dt;
    if (this.mode === 'fall') {
      r.vz -= GRAVITY * 0.7 * dt;
      r.z += r.vz * dt;
      if (r.fallT > 1.0) {
        r.hearts--;
        this.chaser.lunge = 2.6;
        this.hooks.onEvent?.('hit');
        if (r.hearts <= 0) { this.caught(); return; }
        this.respawn();
      }
    } else if (this.mode === 'caught' && r.fallT > 1.7 && !this.fallenSent) {
      this.fallenSent = true;
      this.hooks.onFallen?.();
    }
  }

  /** Find solid ground with time to react, without skipping unanswered gates. */
  respawn() {
    const r = this.r;
    this.ensure();
    let found = false;
    for (let i = r.seg; i < this.segments.length && !found; i++) {
      const seg = this.segments[i];
      const gate = seg.items.find((it) => it.kind === 'gate' && !it.done);
      if (i === r.seg && !gate && r.t > seg.len - 3.4) continue;
      const limit = gate ? gate.t - 2 : seg.len - RECOVERY_RUNWAY;
      const start = i === r.seg ? Math.min(r.t, limit) : 1;
      for (let t = Math.max(1, Math.ceil(start * 2) / 2); t <= limit; t += 0.5) {
        // A gate safely stops the runner, so it can shorten the recovery runway.
        const end = Math.min(t + RECOVERY_RUNWAY, gate ? gate.t - 1.7 : seg.len);
        const gap = seg.gaps.some(([a, b]) => end >= a - 0.5 && t <= b + 0.5);
        const obstacle = seg.items.some((it) => !it.done && !it.decor && OBSTACLES[it.kind]?.depth
          && it.t + OBSTACLES[it.kind].depth + RUNNER_RADIUS >= t
          && it.t - OBSTACLES[it.kind].depth - RUNNER_RADIUS <= end);
        const p = this.pos(seg, t, 0);
        if (gap || obstacle || this.cells.get(`${Math.round(p.x)},${Math.round(p.y)}`)?.kind !== 'path') continue;
        r.seg = i;
        r.t = t;
        if (gate?.state === 'asking') gate.state = 'closed';
        found = true;
        break;
      }
      // Generation reserves a clear approach to every gate; never jump past it.
      if (gate) break;
    }
    if (!found) throw new Error('No safe recovery point on the generated path');
    Object.assign(r, { l: 0, lane: 0, z: 0, vz: 0, slide: 0, invuln: 2,
      stumble: 0, speed: 0, turnQueued: false, fallT: 0, airT: 0, landT: 0 });
    this.pendingGate = null;
    this.mode = 'run';
    this.cam = null;
    this.ensure();
  }

  caught() {
    this.mode = 'caught';
    this.fallenSent = false;
    this.r.fallT = 0;
    this.r.z = 0; this.r.vz = 0;
    this.chaser.target = 0.6;
    audio.play(`${this.realm}-chaser-growl`, { volume: 0.9 });
    audio.play(`${this.realm}-game-over`, { volume: 0.8 });
  }

  /** After the Fallen screen's "Rise again": full hearts, a little corruption lifted. */
  revive() {
    this.respawn();
    this.r.hearts = 3;
    this.r.invuln = 2.5;
    this.chaser.gap = 6; this.chaser.target = 6; this.chaser.lunge = 0;
    this.fallenSent = false;
  }

  updateChaser(dt) {
    const c = this.chaser;
    c.lunge = Math.max(0, c.lunge - dt);
    if (this.mode !== 'caught') c.target = clamp(9.5 - 6.5 * this.corruption / 100 - (c.lunge > 0 ? 3.2 : 0) - (3 - this.r.hearts) * 0.6, 1.4, 10);
    c.gap = lerp(c.gap, c.target, 1 - Math.exp(-dt * (this.mode === 'caught' ? 5 : 1.4)));
  }

  /** Answer a gate: right opens it in gold; wrong taints it and feeds the corruption. */
  resolveGate(right) {
    const gate = this.pendingGate;
    if (!gate) return;
    gate.state = right ? 'open' : 'tainted';
    gate.done = true;
    this.pendingGate = null;
    const p = this.pos(this.runnerSeg, gate.t, 0);
    if (right) {
      this.burst(p.x, p.y, 1.2, 26, 'spark');
      this.burst(p.x, p.y, 0.2, 3, 'ring');
    } else {
      this.burst(p.x, p.y, 1.0, 26, 'ember');
      this.shake = 0.6;
    }
    this.mode = 'run';
  }

  setCorruption(v) {
    this.corruption = clamp(v, 0, 100);
    const to = this.realm === 'divine' && this.corruption >= 50 ? 'corrupt' : this.realm === 'corrupt' && this.corruption < 40 ? 'divine' : null;
    if (to) this.changeRealm(to);
  }

  changeRealm(to) {
    if (to === this.realm) return;
    this.wave = { from: this.realm, to, t: 0 };
    this.realm = to;
    audio.play(to === 'corrupt' ? 'enter-corrupt' : 'enter-divine', { volume: 0.9 });
    this.hooks.onRealm?.(to);
  }

  updateWave(dt) {
    if (this.wave && (this.wave.t += dt) > 1.6) this.wave = null;
  }

  /** Title-screen autopilot: plays perfectly and never asks anything. */
  autopilot() {
    const r = this.r;
    const seg = this.runnerSeg;
    if (seg.len - r.t < 1.6 && !r.turnQueued) this.input(seg.dir === 0 ? 'left' : 'right');
    for (const it of seg.items) {
      const ahead = it.t - r.t;
      if (it.decor || it.done || ahead < 0 || ahead > 2.2) continue;
      if (it.kind === 'gap' && ahead < 1.3) this.input('jump');
      const o = OBSTACLES[it.kind];
      if (!o || it.kind === 'gap') continue;
      if (o.lanes === 3 && !o.slide && ahead < 1.25) this.input('jump');
      if (o.slide && ahead < 1.6) this.input('slide');
      if (o.lanes < 3 && it.lanes.includes(r.lane)) {
        const open = [-1, 0, 1].filter((x) => !it.lanes.includes(x)).sort((a, b) => Math.abs(a - r.lane) - Math.abs(b - r.lane))[0];
        if (open !== undefined) this.input(open < r.lane ? 'left' : 'right');
        else if (o.clear < 1 && ahead < 1.25) this.input('jump');
      }
    }
    if (this.demo) r.invuln = 1;
  }

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------
  burst(x, y, z, n, kind) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = kind === 'ring' ? 0 : 0.8 + Math.random() * 2.2;
      this.particles.push({
        kind, x, y, z, vx: Math.cos(a) * s * 0.6, vy: Math.sin(a) * s * 0.6, vz: kind === 'ember' ? 1 + Math.random() * 2 : 2 + Math.random() * 3,
        life: kind === 'ring' ? 0.7 + i * 0.15 : 0.6 + Math.random() * 0.6, t: 0, size: kind === 'ring' ? 1 : 0.4 + Math.random() * 0.6,
      });
    }
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.t += dt;
      if (p.kind === 'ring') continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vz -= (p.kind === 'ember' ? -0.6 : 7) * dt;
    }
    this.particles = this.particles.filter((p) => p.t < p.life);
    for (const s of this.texts) s.t += dt;
    this.texts = this.texts.filter((s) => s.t < 1.4);
  }

  say(text, color) { this.texts.push({ text, color, t: 0 }); }

  // -------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------
  iso(x, y, z = 0) {
    const k = this.k;
    return { X: (x - y) * 128 * k + this.ox, Y: (x + y) * 64 * k - z * ZPX * k + this.oy };
  }

  render() {
    const { ctx, W, H, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = this.r;
    const p = this.pos(this.runnerSeg, r.t, r.l);
    const k = this.k * (this.mode === 'gate' ? 1.1 : 1);
    this.zoom = lerp(this.zoom || k, k, 0.06);
    const keep = this.k;
    this.k = this.zoom;
    const tx = (p.x - p.y) * 128 * this.k;
    const ty = (p.x + p.y) * 64 * this.k;
    if (!this.cam) this.cam = { x: tx, y: ty };
    this.cam.x = lerp(this.cam.x, tx, 0.12);
    this.cam.y = lerp(this.cam.y, ty, 0.2);
    const sh = this.shake * this.shake * 14;
    // The camera leads toward where the path is heading (more on narrow screens); on the
    // title screen the runner moves aside for the menu.
    const lead = (this.runnerSeg.dir === 0 ? -1 : 1) * (W < H ? 0.17 : 0.08);
    this.focus = lerp(this.focus ?? 0.5, this.demo && W > 760 ? 0.68 : 0.5 + lead, 0.03);
    this.ox = W * this.focus - this.cam.x + (Math.random() - 0.5) * sh;
    this.oy = H * (W < H ? 0.7 : 0.64) - this.cam.y + (Math.random() - 0.5) * sh;

    if (this.wave) {
      // The new realm spreads outward from the runner, over the old one.
      const t = ease(clamp(this.wave.t / 1.3, 0, 1));
      const c = this.iso(p.x, p.y, 0.6);
      const radius = t * Math.hypot(W, H);
      this.drawScene(this.wave.from);
      ctx.save();
      ctx.beginPath();
      ctx.arc(c.X, c.Y, radius, 0, Math.PI * 2);
      ctx.clip();
      this.drawScene(this.wave.to);
      ctx.restore();
      const g = ctx.createRadialGradient(c.X, c.Y, Math.max(0, radius - 60), c.X, c.Y, radius + 30);
      const tone = this.wave.to === 'corrupt' ? '120,10,25' : '255,226,150';
      g.addColorStop(0, `rgba(${tone},0)`);
      g.addColorStop(0.7, `rgba(${tone},${0.75 * (1 - t)})`);
      g.addColorStop(1, `rgba(${tone},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    } else this.drawScene(this.realm);

    this.drawOverlay();
    this.k = keep;
  }

  drawScene(realm) {
    this.drawBackground(realm);
    this.drawWorld(realm);
  }

  drawBackground(realm) {
    const { ctx, W, H } = this;
    const pal = this.palettes?.[realm] || {};
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    if (realm === 'divine') { sky.addColorStop(0, '#f6eedc'); sky.addColorStop(1, '#e3d6bb'); } else { sky.addColorStop(0, '#120d14'); sky.addColorStop(0.6, '#2a1a20'); sky.addColorStop(1, '#3a1d1f'); }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    const layers = BG[realm];
    const par = [0.06, 0.16, 0.34];
    const place = [[0, 1.05], [0.18, 0.85], [0.42, 0.9]];
    layers.forEach((id, i) => {
      const img = this.img[id];
      if (!img) return;
      const h = H * place[i][1];
      const w = h * (img.width / img.height);
      const drift = this.time * (i === 2 ? 14 : i === 1 ? 4 : 1.5);
      let x = -(((this.cam?.x || 0) * par[i] + drift) % w);
      if (x > 0) x -= w;
      ctx.globalAlpha = i === 2 ? 0.45 : 1;
      for (; x < W; x += w - 1) ctx.drawImage(img, x, H * place[i][0] - h * 0.1 * i, w, h);
      ctx.globalAlpha = 1;
    });
    // Haze toward the bottom so the floating path reads against the sky.
    const haze = ctx.createLinearGradient(0, H * 0.5, 0, H);
    haze.addColorStop(0, realm === 'divine' ? 'rgba(238,228,205,0)' : 'rgba(35,30,36,0)');
    haze.addColorStop(1, realm === 'divine' ? 'rgba(238,228,205,0.55)' : 'rgba(20,10,14,0.6)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, W, H);
    void pal;
  }

  drawWorld(realm) {
    const { ctx, W, H } = this;
    const k = this.k;
    const pal = this.palettes?.[realm] || { stone: '#eee4cd', light: '#fff8e9', shade: '#b5a78c', deep: '#302b23', gold: '#c7a15d', accent: '#f9dfa0' };
    const corrupt = realm === 'corrupt';
    const hw = 128 * k;
    const hh = 64 * k;
    const lip = 22 * k;
    const cliff = 70 * k;

    // Floor: top faces, the gold trim on open edges, and the stone sides below them.
    for (const c of this.cellList) {
      const { X, Y } = this.iso(c.x, c.y);
      if (X < -hw * 2 || X > W + hw * 2 || Y < -hh * 3 || Y > H + cliff + hh) continue;
      const openX = !this.cells.has(`${c.x + 1},${c.y}`);
      const openY = !this.cells.has(`${c.x},${c.y + 1}`);
      if (openX) {
        ctx.fillStyle = pal.deep;
        ctx.beginPath(); ctx.moveTo(X + hw, Y); ctx.lineTo(X, Y + hh); ctx.lineTo(X, Y + hh + cliff); ctx.lineTo(X + hw, Y + cliff); ctx.closePath(); ctx.fill();
      }
      if (openY) {
        ctx.fillStyle = pal.shade;
        ctx.beginPath(); ctx.moveTo(X - hw, Y); ctx.lineTo(X, Y + hh); ctx.lineTo(X, Y + hh + cliff); ctx.lineTo(X - hw, Y + cliff); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath(); ctx.moveTo(X - hw, Y + lip); ctx.lineTo(X, Y + hh + lip); ctx.lineTo(X, Y + hh + cliff); ctx.lineTo(X - hw, Y + cliff); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = c.kind === 'path' ? pal.stone : c.kind === 'terrace' ? (corrupt ? '#b2a491' : '#e6dac0') : pal.light;
      ctx.beginPath(); ctx.moveTo(X, Y - hh); ctx.lineTo(X + hw, Y); ctx.lineTo(X, Y + hh); ctx.lineTo(X - hw, Y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = corrupt ? 'rgba(40,20,24,0.35)' : 'rgba(181,167,140,0.55)';
      ctx.lineWidth = Math.max(0.6, k * 1.2);
      ctx.stroke();
      if (corrupt && (c.x * 7 + c.y * 13) % 5 === 0) {
        // Cracks with ember light in them.
        ctx.strokeStyle = 'rgba(152,62,74,0.85)';
        ctx.lineWidth = Math.max(1, k * 2.4);
        ctx.beginPath(); ctx.moveTo(X - hw * 0.5, Y - hh * 0.1); ctx.lineTo(X - hw * 0.1, Y + hh * 0.15); ctx.lineTo(X + hw * 0.2, Y - hh * 0.2); ctx.lineTo(X + hw * 0.55, Y + hh * 0.05); ctx.stroke();
      }
      if (c.inlay) {
        ctx.strokeStyle = pal.gold; ctx.lineWidth = Math.max(1, 3 * k);
        ctx.beginPath(); ctx.moveTo(X, Y - hh * 0.38); ctx.lineTo(X + hw * 0.38, Y); ctx.lineTo(X, Y + hh * 0.38); ctx.lineTo(X - hw * 0.38, Y); ctx.closePath(); ctx.stroke();
        ctx.fillStyle = pal.gold;
        ctx.beginPath(); ctx.moveTo(X, Y - hh * 0.1); ctx.lineTo(X + hw * 0.1, Y); ctx.lineTo(X, Y + hh * 0.1); ctx.lineTo(X - hw * 0.1, Y); ctx.closePath(); ctx.fill();
      }
      if (openX || openY) {
        ctx.strokeStyle = pal.gold; ctx.lineWidth = Math.max(1, 4 * k);
        ctx.beginPath();
        if (openY) { ctx.moveTo(X - hw, Y); ctx.lineTo(X, Y + hh); }
        if (openX) { ctx.moveTo(X, Y + hh); ctx.lineTo(X + hw, Y); }
        ctx.stroke();
      }
    }

    // Sprites, back to front by where they meet the ground.
    const list = [];
    const r = this.r;
    for (const seg of this.segments) {
      const flip = DIRS[seg.dir].flip;
      if (seg.island) {
        const q = this.pos(seg, seg.island.t, seg.island.l);
        list.push({ id: `${realm}-temple`, x: q.x, y: q.y, d: q.x + q.y + 0.5, size: SIZE.temple, flip });
      }
      for (const it of seg.items) {
        if (it.done && it.kind !== 'gate') continue;
        const q = this.pos(seg, it.t, it.l);
        const d = q.x + q.y;
        const kind = it.kind;
        if (kind === 'gap') {
          // The broken-off floor falls away down the chasm, slowly turning.
          const fall = (this.time * 0.35 + it.t * 0.13) % 1;
          const e = this.pos(seg, it.t + 0.5, 0.9 * Math.sin(it.t));
          list.push({ id: `${realm}-gap-edge`, x: e.x, y: e.y, z: -0.3 - fall * 3.5, d: e.x + e.y - 3, size: SIZE['gap-edge'] * 0.55, flip, alpha: 0.9 * (1 - fall) });
          continue;
        }
        if (kind === 'lintel') {
          list.push({ id: `${realm}-slide-lintel-back`, x: q.x, y: q.y, d: d - 1.4, size: SIZE.lintel, flip });
          list.push({ id: `${realm}-slide-lintel-front`, x: q.x, y: q.y, d: d + 1.4, size: SIZE.lintel, flip });
          continue;
        }
        if (kind === 'braziers') {
          for (const l of it.lanes) { const b = this.pos(seg, it.t, l); list.push({ id: `${realm}-brazier-obstacle`, x: b.x, y: b.y, d: b.x + b.y, size: SIZE['brazier-obstacle'], flip }); }
          continue;
        }
        if (kind === 'trap') { const b = this.pos(seg, it.t, it.lanes[0]); list.push({ id: `${realm}-trap`, x: b.x, y: b.y, d: b.x + b.y - 0.5, size: SIZE.trap, flip }); continue; }
        if (kind === 'gate') {
          const tone = it.state === 'tainted' ? 'corrupt' : it.state === 'open' ? 'divine' : realm;
          list.push({ id: `${tone}-gateway`, x: q.x, y: q.y, d: d + 0.2, size: SIZE.gateway, flip, glow: it.state === 'asking' ? 1 : it.state === 'open' ? 0.6 : 0 });
          continue;
        }
        if (kind === 'laurel' || kind === 'wisdom' || kind === 'aegis') {
          const bob = Math.sin(this.time * 4 + it.t) * 0.06;
          list.push({ id: `${realm}-${kind}`, x: q.x, y: q.y, z: (it.z ?? 0.4) + bob, d: d + 0.1, size: SIZE[kind], center: true, spin: kind === 'laurel' });
          continue;
        }
        if (it.wall) {
          // The wall stands across the old direction, so it is drawn mirrored from the path.
          list.push({ id: `${realm}-dead-end-wall`, x: q.x, y: q.y, d: d - 0.8, size: SIZE['dead-end-wall'], flip: !flip });
          continue;
        }
        const id = `${realm}-${kind}`;
        list.push({ id, x: q.x, y: q.y, d, size: SIZE[kind] || 300, flip, fade: it.decor && !this.isBehind(seg, it) });
      }
    }

    // Runner, pursuer and their shadows.
    const seg = this.runnerSeg;
    const rp = this.pos(seg, r.t, r.l);
    const flip = DIRS[seg.dir].flip;
    list.push({ id: `${realm}-effect-shadow`, x: rp.x, y: rp.y, d: rp.x + rp.y - 0.01, size: 200 * (1 - Math.min(r.z, 1.5) * 0.3), center: true, alpha: this.mode === 'fall' ? 0 : 0.8 });
    list.push({ runner: true, x: rp.x, y: rp.y, z: r.z, d: rp.x + rp.y, flip });
    if (this.mode !== 'gate' || this.chaser.gap < 7) {
      const b = this.behind(this.chaser.gap);
      if (b.seg) {
        const cp = this.pos(b.seg, b.t, clamp(r.l * 0.6, -1, 1));
        list.push({ chaser: true, x: cp.x, y: cp.y, d: cp.x + cp.y, flip: DIRS[b.seg.dir].flip });
      }
    }
    list.sort((a, b) => a.d - b.d);
    for (const s of list) {
      if (s.runner) this.drawRunner(realm, s);
      else if (s.chaser) this.drawChaser(realm, s);
      else this.drawSprite(s);
    }

    // Particles and floating words.
    for (const p of this.particles) {
      const { X, Y } = this.iso(p.x, p.y, p.z);
      const life = 1 - p.t / p.life;
      if (p.kind === 'ring') {
        const img = this.img[`${realm}-effect-ring`];
        const s = (0.6 + p.t * 3) * 260 * k;
        if (img) { ctx.globalAlpha = life; ctx.drawImage(img, X - s / 2, Y - s / 4, s, s / 2); ctx.globalAlpha = 1; }
        continue;
      }
      if (p.kind === 'ember') {
        ctx.fillStyle = `rgba(${150 + Math.random() * 60},${30 + Math.random() * 30},40,${life})`;
        ctx.beginPath(); ctx.arc(X, Y, 5 * k * p.size + 1, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      const img = this.img[`${realm}-effect-spark`];
      const s = 70 * k * p.size * life + 2;
      if (img) { ctx.globalAlpha = life; ctx.drawImage(img, X - s / 2, Y - s / 2, s, s); ctx.globalAlpha = 1; }
    }
  }

  /** Decor on the camera side of the path, drawn faint when the runner is near it. */
  isBehind(seg, it) { return (seg.dir === 0 ? -1 : 1) * Math.sign(it.l) > 0; }

  drawSprite(s) {
    const img = this.img[s.id];
    if (!img) return;
    const a = asset(s.id) || {};
    const ground = GROUND_ART[s.id];
    const { ctx } = this;
    const k = this.k;
    const { X, Y } = this.iso(s.x, s.y, s.z || 0);
    const scale = (s.size * k) / Math.max(img.width, img.height);
    const w = img.width * scale;
    const h = img.height * scale * (ground?.heightScale ?? 1);
    const ax = s.center ? 0.5 : (ground?.anchor[0] ?? a.anchor?.x ?? 0.5);
    const ay = s.center ? 0.5 : (ground?.anchor[1] ?? a.anchor?.y ?? 1);
    ctx.save();
    let alpha = s.alpha ?? 1;
    if (s.fade) {
      const r = this.iso(...Object.values(this.pos(this.runnerSeg, this.r.t, this.r.l)));
      if (Math.abs(r.X - X) < w * 0.6 && r.Y < Y + 20 * k && r.Y > Y - h) alpha *= 0.45;
    }
    ctx.globalAlpha = alpha;
    ctx.translate(X, Y);
    if (s.spin) ctx.scale(Math.cos(this.time * 3 + s.x), 1);
    if (!!s.flip !== !!ground?.mirror) ctx.scale(-1, 1);
    if (s.glow) { ctx.shadowColor = 'rgba(255,224,140,0.95)'; ctx.shadowBlur = 40 * s.glow * (0.7 + 0.3 * Math.sin(this.time * 4)); }
    ctx.drawImage(img, -ax * w, -ay * h, w, h);
    ctx.restore();
  }

  frameOf(realm) {
    const r = this.r;
    const sheet = `${realm}-${this.character}-moves`;
    const a = asset(sheet);
    if (!a) return null;
    const anim = (name, t, fps) => { const fr = a.animations[name].frames; return fr[Math.min(fr.length - 1, Math.floor(t * fps))]; };
    let f;
    if (this.mode === 'caught' || this.mode === 'fall') f = anim('fall', r.fallT, 4);
    else if (this.mode === 'gate' || this.mode === 'done' || (this.mode === 'brake' && r.speed < 1.5)) f = 'idle';
    else if (r.stumble > 0) f = anim('stumble', 0.6 - r.stumble, 4);
    else if (r.slide > 0) f = r.slide > 0.62 ? 'slide-drop' : r.slide < 0.1 ? 'slide-rise' : 'slide-hold';
    else if (r.z > 0) f = r.vz > 4 ? 'jump-takeoff' : r.vz < -6 && r.z < 0.5 ? 'jump-land' : 'jump-air';
    else if (r.landT > 0) f = 'jump-land';
    else { const fr = a.animations.run.frames; f = fr[Math.floor(r.anim * 12 * (r.speed / this.baseSpeed)) % fr.length]; }
    return { sheet, rect: a.frames[f], name: f };
  }

  drawRunner(realm, s) {
    const fr = this.frameOf(realm);
    const img = fr && this.img[fr.sheet];
    if (!img) return;
    const { ctx } = this;
    const k = this.k;
    const r = this.r;
    // jump-air already lifts the figure 72px inside its frame; don't add that twice.
    const lift = fr.name === 'jump-air' ? Math.max(0, s.z * ZPX - 72 * (SIZE.runner / 640)) : s.z * ZPX;
    const { X, Y } = this.iso(s.x, s.y, 0);
    const size = SIZE.runner * k;
    const [fx, fy, fw, fh] = fr.rect;
    ctx.save();
    if (r.invuln > 0 && this.mode === 'run' && !this.demo) ctx.globalAlpha = 0.55 + 0.45 * Math.round((Math.sin(this.time * 30) + 1) / 2);
    if (this.mode === 'fall') ctx.globalAlpha = clamp(1 - r.fallT / 0.9, 0, 1);
    ctx.translate(X, Y - lift * k + 8 * (SIZE.runner / 640) * k);
    if (s.flip) ctx.scale(-1, 1);
    if (realm === 'corrupt') { ctx.shadowColor = 'rgba(152,30,45,0.8)'; ctx.shadowBlur = 18 * k * 2; }
    ctx.drawImage(img, fx, fy, fw, fh, -size / 2, -size, size, size);
    ctx.restore();
    if (r.shield) {
      const ring = this.img[`${realm}-effect-ring`];
      if (ring) {
        const w = 230 * k * (1 + 0.05 * Math.sin(this.time * 6));
        ctx.globalAlpha = 0.85;
        ctx.drawImage(ring, X - w / 2, Y - lift * k - w * 0.25, w, w / 2);
        ctx.globalAlpha = 1;
      }
    }
  }

  drawChaser(realm, s) {
    const id = `${realm}-chaser-run`;
    const img = this.img[id];
    const a = asset(id);
    if (!img || !a) return;
    const { ctx } = this;
    const k = this.k;
    const frames = a.animations.run.frames;
    const f = a.frames[frames[Math.floor(this.chaser.anim * 12) % frames.length]];
    const { X, Y } = this.iso(s.x, s.y, Math.abs(Math.sin(this.chaser.anim * 6)) * 0.08);
    const size = SIZE.chaser * k;
    const near = clamp(1 - (this.chaser.gap - 2) / 7, 0, 1);
    ctx.save();
    ctx.globalAlpha = realm === 'divine' ? 0.55 + 0.45 * near : 0.75 + 0.25 * near;
    ctx.translate(X, Y + 8 * (SIZE.chaser / 640) * k);
    if (s.flip) ctx.scale(-1, 1);
    if (realm === 'corrupt') { ctx.shadowColor = 'rgba(120,10,25,0.9)'; ctx.shadowBlur = 30 * k; }
    ctx.drawImage(img, f[0], f[1], f[2], f[3], -size / 2, -size, size, size);
    ctx.restore();
  }

  drawOverlay() {
    const { ctx, W, H } = this;
    const c = this.corruption / 100;
    // Corruption closes in from the edges; near the end it beats like a heart.
    if (c > 0 || this.realm === 'corrupt') {
      const beat = c > 0.84 ? 0.12 * Math.max(0, Math.sin(this.time * 7.5)) ** 8 : 0;
      const a = clamp(0.12 + c * 0.55 + beat, 0, 0.8);
      const g = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * (0.55 - c * 0.18), W / 2, H * 0.55, Math.hypot(W, H) * 0.62);
      g.addColorStop(0, 'rgba(60,4,14,0)');
      g.addColorStop(1, `rgba(60,4,14,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.flash) {
      ctx.fillStyle = `rgba(${this.flash.color},${0.45 * (1 - this.flash.t / this.flash.d)})`;
      ctx.fillRect(0, 0, W, H);
    }
    // Floating words over the runner.
    const r = this.r;
    const p = this.pos(this.runnerSeg, r.t, r.l);
    const { X, Y } = this.iso(p.x, p.y, r.z);
    ctx.textAlign = 'center';
    for (const s of this.texts) {
      const life = 1 - s.t / 1.4;
      ctx.globalAlpha = Math.min(1, life * 2);
      ctx.font = `600 ${Math.round(18 + 10 * this.k)}px Fraunces, Georgia, serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(20,14,10,0.6)';
      const y = Y - SIZE.runner * this.k - 10 - s.t * 40;
      ctx.strokeText(s.text, X, y);
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, X, y);
    }
    ctx.globalAlpha = 1;
  }
}
