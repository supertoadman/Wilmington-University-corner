// Crypt Survivors: the world. Runs the simulation (the wave director, hundreds of enemies kept cheap by
// a spatial hash, auto-firing weapons, gems and pickups) and draws it on one canvas, pixel-crisp.
// It never touches the page: game.js reads its state for the HUD and answers its hooks
// (onLevelUp, onChest, onDeath, onVictory, onBoss, onEvent). No DOM at import, so Node tests can run it.

import { ENEMIES, BOSSES, WAVES, EVENTS, ENDLESS_BOSSES, RUN_SECONDS, CHARACTERS, WEAPONS } from './defs.js';
import { SpatialGrid, rngFrom, gainXp, computeStats, weaponStats, corruptionLevel, xpToNext, newBuild } from './logic.js';

const TAU = Math.PI * 2;
const TILE = 32;
const BASE_MOVE = 110;      // px/s
const BASE_PICKUP = 38;     // px
const MAX_FOES = 420;
const MAX_GEMS = 320;
const DECOR = ['decor-column', 'decor-angel', 'decor-wraith', 'decor-ossuary', 'decor-shrine', 'decor-grave', 'decor-column'];

const hash2 = (x, y) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Smooth value noise (bilinear over a hashed lattice), for organic blotches of corruption on the floor. */
const noise = (x, y) => {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0), b = hash2(x0 + 1, y0), c = hash2(x0, y0 + 1), d = hash2(x0 + 1, y0 + 1);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
};
const gemSprite = (v) => (v >= 20 ? 'gem-4' : v >= 5 ? 'gem-3' : v >= 2 ? 'gem-2' : 'gem-1');

export class World {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.sprites = null;
    this.sound = null;
    this.grid = new SpatialGrid(48);
    this.near = [];
    this.input = { x: 0, y: 0 };
    this.zoom = 2;
    this.vw = 640;
    this.vh = 400;
    this.frame = 0;
    this.resize();
    this.reset({ demo: true, seed: 1 });
  }

  setSprites(s) { this.sprites = s; }
  setSound(s) { this.sound = s; }
  sfx(name, opts) { if (!this.demo) this.sound?.play(name, opts); }

  resize() {
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = Math.max(1, this.canvas.clientWidth || 1280);
    const h = Math.max(1, this.canvas.clientHeight || 800);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    // Whole-number zoom keeps every sprite pixel the same size; aim for ~400 world px on the short side.
    this.zoom = Math.max(1, Math.round(Math.min(this.canvas.width, this.canvas.height) / 400));
    if (dpr >= 2 && this.zoom < 2) this.zoom = 2;
    this.vw = this.canvas.width / this.zoom;
    this.vh = this.canvas.height / this.zoom;
    this.vignette = null;
    this.vignetteKey = null;
  }

  // -------------------------------------------------------------------------
  // A run
  // -------------------------------------------------------------------------
  reset({ character = 'advocate', endless = false, demo = false, seed = (Math.random() * 1e9) | 0 } = {}) {
    this.rng = rngFrom(seed);
    this.demo = demo;
    this.endless = endless;
    this.char = CHARACTERS.find((c) => c.id === character) || CHARACTERS[0];
    this.build = newBuild(this.char.weapon);
    this.time = 0;
    this.player = { x: 0, y: 0, r: 8, hp: 1, facing: 1, aimX: 1, aimY: 0, moving: false, walk: 0, hurt: 0, level: 1, xp: 0, healCap: 0 };
    this.enemies = [];
    this.projectiles = [];
    this.slashes = [];
    this.strikes = [];
    this.pools = [];
    this.drops = [];
    this.props = [];
    this.decals = [];
    this.effects = [];
    this.texts = [];
    this.shots = [];
    this.weapons = [];
    this.orbit = [];
    this.kills = 0;
    this.gold = 0;
    this.damageBy = {};
    this.pendingLevels = 0;
    this.pendingChests = 0;
    this.asking = false;
    this.spawnT = 0;
    this.eventIdx = 0;
    this.nextEndless = RUN_SECONDS + 90;
    this.endlessN = 0;
    this.bosses = [];
    this.bossesSlain = 0;
    this.over = false;
    this.won = false;
    this.nextId = 1;
    this.shake = 0;
    this.propT = 0;
    this.corruption = 0;
    this.chipT = 0;
    this.cam = { x: 0, y: 0 };
    this.syncBuild(true);
  }

  /** Recompute stats and weapons after the build changes (a card, a chest, a corruption). */
  syncBuild(fresh = false) {
    const before = this.stats?.maxHp || 0;
    this.stats = computeStats(this.char, this.build.passives, this.build.corruptions);
    const p = this.player;
    if (fresh) p.hp = this.stats.maxHp;
    else if (this.stats.maxHp > before) p.hp += this.stats.maxHp - before;
    p.hp = Math.min(p.hp, this.stats.maxHp);
    const old = new Map(this.weapons.map((w) => [w.id, w]));
    this.weapons = this.build.weapons.map((b) => {
      const w = old.get(b.id) || { id: b.id, timer: 0.4, active: 0, angle: 0, volley: 0 };
      w.level = b.level;
      w.def = WEAPONS[b.id];
      w.s = weaponStats(b.id, b.level, this.stats);
      return w;
    });
    this.corruption = corruptionLevel(this.build);
  }

  heal(n) {
    const p = this.player;
    const before = p.hp;
    p.hp = Math.min(this.stats.maxHp, p.hp + n);
    if (p.hp - before >= 1) this.text(p.x, p.y - 22, `+${Math.round(p.hp - before)}`, '#7dffa0');
  }

  addGold(n) { this.gold += n; }

  /** Called by the game when a level-up's question and card are done. */
  levelResolved() { this.pendingLevels = Math.max(0, this.pendingLevels - 1); this.asking = false; }
  chestResolved() { this.pendingChests = Math.max(0, this.pendingChests - 1); this.asking = false; }

  /** Push the enemies back from the player (after a pause, so the first frame back isn't a death). */
  clearAround(radius = 70) {
    const p = this.player;
    for (const e of this.enemies) {
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d < radius && !e.boss) { e.x = p.x + (dx / d) * radius; e.y = p.y + (dy / d) * radius; }
      e.hitCd = Math.max(e.hitCd, 0.4);
    }
  }

  get xpNeeded() { return xpToNext(this.player.level); }

  // -------------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------------
  update(dt) {
    dt = Math.min(dt, 0.05);
    this.frame++;
    if (this.over) { this.updateEffects(dt); return; }
    this.time += dt;
    this.updatePlayer(dt);
    this.direct(dt);
    this.grid.clear();
    for (const e of this.enemies) if (!e.dead) this.grid.insert(e);
    this.updateEnemies(dt);
    this.updateWeapons(dt);
    this.updateProjectiles(dt);
    this.updateSlashes(dt);
    this.updateStrikes(dt);
    this.updatePools(dt);
    this.updateShots(dt);
    this.updateDrops(dt);
    this.updateProps(dt);
    this.updateEffects(dt);
    this.reap();
    if (this.demo) return;
    if (!this.endless && this.time >= RUN_SECONDS && !this.over) { this.win(); return; }
    if (!this.asking && !this.over) {
      if (this.pendingChests > 0) { this.asking = true; this.hooks.onChest?.(); } else if (this.pendingLevels > 0) { this.asking = true; this.hooks.onLevelUp?.(); }
    }
  }

  updatePlayer(dt) {
    const p = this.player;
    let { x: ix, y: iy } = this.input;
    if (this.demo) {
      const a = this.time * 0.35;
      ix = Math.cos(a); iy = Math.sin(a * 0.7) * 0.6;
    }
    const m = Math.hypot(ix, iy);
    if (m > 1) { ix /= m; iy /= m; }
    p.moving = m > 0.08;
    if (p.moving) {
      const sp = BASE_MOVE * this.stats.move;
      p.x += ix * sp * dt;
      p.y += iy * sp * dt;
      const n = Math.hypot(ix, iy);
      p.aimX = ix / n; p.aimY = iy / n;
      if (Math.abs(ix) > 0.1) p.facing = ix > 0 ? 1 : -1;
      p.walk += dt * 10 * this.stats.move;
    }
    p.hurt = Math.max(0, p.hurt - dt);
    p.healCap = Math.max(0, p.healCap - dt * 8);
    if (this.demo) { p.hp = this.stats.maxHp; return; }
    if (this.stats.regen > 0 && p.hp < this.stats.maxHp) p.hp = Math.min(this.stats.maxHp, p.hp + this.stats.regen * dt);
    if (this.stats.chip > 0) {
      // Blood Tithe: a steady drain, but it never takes the last point of health.
      this.chipT += this.stats.chip * dt;
      if (this.chipT >= 1) {
        const n = Math.floor(this.chipT);
        this.chipT -= n;
        if (p.hp > 1) { p.hp = Math.max(1, p.hp - n); this.text(p.x, p.y - 22, `−${n}`, '#ff5a6e'); }
      }
    }
    // The camera eases after the player, so fast moves don't jolt.
    const k = 1 - Math.exp(-dt * 12);
    this.cam.x += (p.x - this.cam.x) * k;
    this.cam.y += (p.y - this.cam.y) * k;
  }

  // -------------------------------------------------------------------------
  // Wave director
  // -------------------------------------------------------------------------
  wave() {
    const t = this.time;
    if (this.demo) return { ...WAVES[Math.floor(t / 20) % 3], alive: 50, hp: 1, power: 1 };
    if (t < RUN_SECONDS) {
      const m = Math.min(WAVES.length - 1, Math.floor(t / 60));
      return { ...WAVES[m], hp: 1 + t / 60 * 0.13, power: 1 + t / 60 * 0.035 };
    }
    const past = t - RUN_SECONDS;
    const lap = Math.floor(past / 300);
    const m = 10 + (Math.floor(past / 60) % 5);
    return { ...WAVES[m], hp: (1 + 15 * 0.13) * (1 + 0.6 * past / 300), power: 1.6 + lap * 0.25, alive: WAVES[m].alive + 40, every: WAVES[m].every * 0.85 };
  }

  direct(dt) {
    const w = this.wave();
    const rate = this.stats.spawnRate;
    const cap = Math.min(MAX_FOES, Math.round(w.alive * Math.min(1.6, rate)));
    this.spawnT += dt * rate;
    let alive = this.enemies.length;
    while (this.spawnT >= w.every) {
      this.spawnT -= w.every;
      if (alive >= cap) continue;
      const group = 1 + (this.rng() < 0.35 ? 1 : 0) + Math.floor(this.time / 300);
      const type = this.pick(w.foes);
      const [x, y] = this.spawnPoint();
      for (let i = 0; i < group && alive < cap; i++, alive++) {
        this.spawn(type, x + (this.rng() - 0.5) * 30, y + (this.rng() - 0.5) * 30, { hp: w.hp, power: w.power });
      }
    }
    if (this.demo) return;
    while (this.eventIdx < EVENTS.length && this.time >= EVENTS[this.eventIdx][0]) {
      const [, kind, what] = EVENTS[this.eventIdx++];
      this.event(kind, what, w);
    }
    if (this.endless && this.time >= this.nextEndless) {
      this.endlessN++;
      this.nextEndless += 90;
      if (this.endlessN % 2 === 0) this.event('boss', ENDLESS_BOSSES[(this.endlessN / 2 - 1) % ENDLESS_BOSSES.length], w);
      else this.event(this.endlessN % 4 === 1 ? 'swarm' : 'ring', ['bat', 'skull', 'ghost', 'hound', 'imp'][this.endlessN % 5], w);
    }
  }

  pick(weights) {
    let total = 0;
    for (const k in weights) total += weights[k];
    let r = this.rng() * total;
    for (const k in weights) { r -= weights[k]; if (r <= 0) return k; }
    return Object.keys(weights)[0];
  }

  spawnPoint(dist = null) {
    const p = this.player;
    const R = dist ?? Math.hypot(this.vw, this.vh) / 2 + 24 + this.rng() * 50;
    // Lean toward where the player is heading, so a runner keeps meeting foes.
    let a = this.rng() * TAU;
    if (p.moving && this.rng() < 0.35) a = Math.atan2(p.aimY, p.aimX) + (this.rng() - 0.5) * 1.6;
    return [p.x + Math.cos(a) * R, p.y + Math.sin(a) * R];
  }

  spawn(type, x, y, { hp = 1, power = 1, swarm = null, elite = null } = {}) {
    const def = ENEMIES[type] || BOSSES[type];
    const boss = !!BOSSES[type];
    const isElite = elite ?? (!boss && !swarm && this.rng() < 0.015 + 0.06 * this.corruption);
    const lvl = this.player.level;
    const maxHp = def.hp * hp * (isElite ? 2.6 : 1) * (boss ? 1 + 0.035 * lvl : 1);
    const e = {
      id: this.nextId++, type, def, x, y, kx: 0, ky: 0, hp: maxHp, maxHp, r: def.r * (isElite ? 1.15 : 1),
      speed: def.speed * (0.9 + this.rng() * 0.2) * (isElite ? 1.1 : 1), power: def.power * power, xp: def.xp * (isElite ? 4 : 1),
      mass: def.mass * (isElite ? 2 : 1), scale: (def.scale || 1) * (isElite ? 1.2 : 1), flash: 0, hitCd: 0, boss, elite: isElite,
      tint: isElite ? 'crimson' : (!boss && this.corruption > 0.5 && this.rng() < 0.2 ? 'violet' : null),
      phase: this.rng() * TAU, cast: 2 + this.rng() * 3, dashCd: 3 + this.rng() * 2, dashT: 0, dead: false, hits: null,
      dirX: swarm ? swarm[0] : 0, dirY: swarm ? swarm[1] : 0, life: swarm ? 16 : Infinity, vx: 0, face: def.face || 1,
    };
    this.enemies.push(e);
    if (boss) { this.bosses.push(e); this.hooks.onBoss?.(def, e); this.sfx('boss'); this.shake = 6; }
    return e;
  }

  event(kind, what, w) {
    const p = this.player;
    if (kind === 'boss') {
      const [x, y] = this.spawnPoint(Math.hypot(this.vw, this.vh) / 2 + 40);
      this.spawn(what, x, y, { hp: Math.max(1, w.hp * 0.6), power: Math.max(1, w.power * 0.8) });
      return;
    }
    const n = kind === 'ring' ? 40 : 36;
    if (kind === 'ring') {
      const R = Math.max(this.vw, this.vh) * 0.55;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        this.spawn(what, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, { hp: w.hp, power: w.power, elite: false });
      }
      this.hooks.onEvent?.('ring', ENEMIES[what].name);
    } else {
      const a = this.rng() * TAU;
      const dir = [Math.cos(a + Math.PI), Math.sin(a + Math.PI)];
      const R = Math.hypot(this.vw, this.vh) / 2 + 30;
      const cx = p.x + Math.cos(a) * R, cy = p.y + Math.sin(a) * R;
      for (let i = 0; i < n; i++) {
        const off = (i - n / 2) * 9;
        this.spawn(what, cx - dir[1] * off + (this.rng() - 0.5) * 40, cy + dir[0] * off + (this.rng() - 0.5) * 40,
          { hp: w.hp, power: w.power, swarm: dir, elite: false });
      }
      this.hooks.onEvent?.('swarm', ENEMIES[what].name);
    }
    this.sfx('swarm');
  }

  // -------------------------------------------------------------------------
  // Enemies
  // -------------------------------------------------------------------------
  updateEnemies(dt) {
    const p = this.player;
    const sp = this.stats.enemySpeed;
    const far = Math.max(this.vw, this.vh) * 0.75 + 260;
    const near = this.near;
    const decay = Math.exp(-dt * 7);
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.flash -= dt;
      e.hitCd -= dt;
      let dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      let ux = dx / d, uy = dy / d;
      if (e.life !== Infinity) {
        e.life -= dt;
        if (e.life <= 0) { e.dead = true; e.gone = true; continue; }
        ux = e.dirX; uy = e.dirY;
      }
      let v = e.speed * sp;
      if (e.def.dash) {
        e.dashCd -= dt;
        if (e.dashT > 0) { e.dashT -= dt; v *= 3; } else if (e.dashCd <= 0 && d < 260) { e.dashT = 0.55; e.dashCd = 4 + this.rng() * 2.5; e.flash = 0.15; }
      }
      if (e.def.caster && !this.demo) {
        e.cast -= dt;
        if (e.cast <= 0 && d < 380) {
          e.cast = e.boss ? 2.6 : 3.5 + this.rng() * 1.5;
          this.castAt(e, ux, uy);
        }
      }
      // Separation: overlapping foes push apart (half the crowd each frame, so it costs half).
      let sx = 0, sy = 0;
      if (((this.frame + e.id) & 1) === 0) {
        this.grid.query(e.x, e.y, e.r * 0.9, near);
        for (let i = 0; i < near.length && i < 8; i++) {
          const o = near[i];
          if (o === e) continue;
          let ox = e.x - o.x, oy = e.y - o.y;
          let od = Math.hypot(ox, oy);
          if (od < 0.01) { ox = this.rng() - 0.5; oy = this.rng() - 0.5; od = 0.5; }
          const overlap = e.r + o.r - od;
          if (overlap > 0) {
            const push = Math.min(overlap, 6) * (o.mass / (e.mass + o.mass)) * 2;
            sx += (ox / od) * push; sy += (oy / od) * push;
          }
        }
      }
      e.x += ux * v * dt + e.kx * dt + sx * dt * 10;
      e.y += uy * v * dt + e.ky * dt + sy * dt * 10;
      e.kx *= decay; e.ky *= decay;
      e.vx = ux;
      // Stragglers left far behind come back around ahead of the player.
      if (d > far && e.life === Infinity && !e.boss) {
        const [nx, ny] = this.spawnPoint();
        e.x = nx; e.y = ny;
      }
      if (!this.demo && d < e.r + p.r && e.hitCd <= 0) {
        e.hitCd = 0.5;
        this.hurt(e.power);
      }
    }
  }

  castAt(e, ux, uy) {
    const n = e.def.caster === 2 ? 10 : 1;
    for (let i = 0; i < n; i++) {
      const a = n === 1 ? Math.atan2(uy, ux) : (i / n) * TAU + this.time;
      this.shots.push({ x: e.x, y: e.y - 8, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, life: 4, power: e.power * 0.7, r: 5 });
    }
    this.sfx('cast');
  }

  updateShots(dt) {
    const p = this.player;
    for (const s of this.shots) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.life > 0 && Math.hypot(s.x - p.x, s.y - p.y) < s.r + p.r) { s.life = 0; this.hurt(s.power); }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
  }

  hurt(power) {
    if (this.over || this.demo) return;
    const p = this.player;
    const dmg = Math.max(1, power - this.stats.armor) * this.stats.damageTaken;
    p.hp -= dmg;
    p.hurt = 0.18;
    this.shake = Math.min(6, this.shake + 2);
    this.sfx('hurt');
    if (p.hp <= 0) {
      p.hp = 0;
      this.over = true;
      this.sfx('death');
      this.effect('fx-necro', p.x, p.y - 10, { frames: 3, life: 0.9, scale: 2.5 });
      this.hooks.onDeath?.();
    }
  }

  win() {
    this.over = true;
    this.won = true;
    for (const e of this.enemies) if (!e.dead) { e.dead = true; e.gone = true; this.effect('fx-necro', e.x, e.y - 8, { frames: 3, life: 0.5 }); }
    this.sfx('victory');
    this.hooks.onVictory?.();
  }

  /** Damage an enemy from a weapon `w` (its runtime), with optional knockback direction. */
  damage(e, amount, w, kx = 0, ky = 0) {
    if (e.dead) return;
    let dmg = amount * (0.92 + this.rng() * 0.16);
    let crit = false;
    if (w.s.crit && this.rng() < w.s.crit) { dmg *= 2; crit = true; }
    e.hp -= dmg;
    e.flash = 0.1;
    this.damageBy[w.id] = (this.damageBy[w.id] || 0) + dmg;
    const kb = (w.s.knockback ?? 0.6) * 140 / e.mass;
    if (!e.boss && (kx || ky)) { e.kx += kx * kb; e.ky += ky * kb; }
    if (this.texts.length < 40 && w.def.kind !== 'aura' && w.def.kind !== 'pool') this.text(e.x + (this.rng() - 0.5) * 8, e.y - e.r * e.scale - 6, String(Math.max(1, Math.round(dmg))), crit ? '#ffd76a' : '#ffffff', crit ? 1.2 : 0.9);
    if (w.s.lifesteal && crit && this.player.healCap < 8) { this.player.healCap += 1; this.heal(1); }
    this.sfx('hit');
    if (e.hp <= 0) this.kill(e, w);
  }

  kill(e, w) {
    e.dead = true;
    this.kills++;
    this.sfx('kill');
    this.effect('fx-necro', e.x, e.y - 6 * e.scale, { frames: 3, life: 0.32, scale: 0.8 * e.scale, alpha: 0.75 });
    if (this.rng() < 0.18 || e.boss) {
      this.decals.push({ id: `fx-blood.${(this.rng() * 3) | 0}`, x: e.x, y: e.y, scale: e.boss ? 2 : 1 });
      if (this.decals.length > 70) this.decals.shift();
    }
    if (w?.s.heal && this.player.healCap < 8) { this.player.healCap += w.s.heal; this.heal(w.s.heal); }
    if (this.demo) return;
    this.drop('gem', e.x, e.y, e.xp);
    if (e.boss) {
      this.bossesSlain++;
      this.bosses = this.bosses.filter((b) => b !== e);
      this.drop('chest', e.x + 14, e.y);
      this.drop('gold', e.x - 14, e.y, 25);
      this.shake = 8;
      this.hooks.onBossDown?.(e.def);
    } else {
      const r = this.rng();
      if (r < 0.012) this.drop('gold', e.x, e.y, 1);
      else if (r < 0.015) this.drop('roast', e.x, e.y);
      if (e.elite && this.rng() < 0.25) this.drop('roast', e.x + 8, e.y);
    }
  }

  reap() {
    if (this.enemies.some((e) => e.dead)) this.enemies = this.enemies.filter((e) => !e.dead);
  }

  // -------------------------------------------------------------------------
  // Weapons
  // -------------------------------------------------------------------------
  updateWeapons(dt) {
    for (const w of this.weapons) {
      const kind = w.def.kind;
      if (kind === 'orbit') { this.updateOrbit(w, dt); continue; }
      w.timer -= dt;
      if (w.timer > 0) continue;
      w.timer += w.s.cooldown;
      if (w.timer < 0) w.timer = w.s.cooldown;
      this.fire(w, kind);
    }
  }

  target(maxR = 420) {
    const p = this.player;
    return this.grid.nearest(p.x, p.y, maxR, (e) => !e.dead);
  }

  visibleFoes() {
    const p = this.player, hw = this.vw / 2 + 10, hh = this.vh / 2 + 10;
    return this.enemies.filter((e) => !e.dead && Math.abs(e.x - p.x) < hw && Math.abs(e.y - p.y) < hh);
  }

  fire(w, kind) {
    const p = this.player, s = w.s;
    switch (kind) {
      case 'whip':
        for (let i = 0; i < s.amount; i++) this.slashes.push({ w, delay: i * 0.1, side: i % 2 ? -p.facing : p.facing, row: Math.floor(i / 2), life: s.duration, done: false });
        break;
      case 'bolt': {
        const t = this.target();
        for (let i = 0; i < s.amount; i++) {
          let ax = p.aimX, ay = p.aimY;
          if (t) { const dx = t.x - p.x, dy = t.y - 6 - p.y, d = Math.hypot(dx, dy) || 1; ax = dx / d; ay = dy / d; }
          const a = Math.atan2(ay, ax) + (i - (s.amount - 1) / 2) * 0.12;
          this.shoot(w, { x: p.x, y: p.y - 8, a, speed: 300 * s.speed, r: 5 * s.area, life: 1.5, sprite: 'fx-dart', frames: 4, scale: 0.9 * s.area, delay: i * 0.05 });
        }
        this.sfx('bolt');
        break;
      }
      case 'axe':
        for (let i = 0; i < s.amount; i++) {
          const side = i % 2 ? -p.facing : p.facing;
          this.shoot(w, { x: p.x, y: p.y - 10, vx: side * (40 + i * 28 + this.rng() * 20), vy: -330 - this.rng() * 50, gravity: 640, r: 10 * s.area, life: 2.4, sprite: WEAPONS[w.id].icon, spin: 9 * side, scale: 1.15 * s.area, delay: i * 0.08 });
        }
        this.sfx('axe');
        break;
      case 'spiral': {
        w.volley = (w.volley || 0) + 1;
        for (let i = 0; i < s.amount; i++) {
          const a = (i / s.amount) * TAU + w.volley * 0.35;
          this.shoot(w, { x: p.x, y: p.y - 8, a, speed: 220 * s.speed, r: 12 * s.area, life: 1.7, sprite: 'e-axe', spin: 10, scale: 1.3 * s.area });
        }
        this.sfx('axe');
        break;
      }
      case 'cross': {
        const t = this.target(360);
        for (let i = 0; i < s.amount; i++) {
          let a = Math.atan2(p.aimY, p.aimX);
          if (t) a = Math.atan2(t.y - p.y, t.x - p.x);
          a += (i - (s.amount - 1) / 2) * 0.5;
          this.shoot(w, { x: p.x, y: p.y - 8, a, speed: 300 * s.speed, accel: 520 * s.speed, r: 10 * s.area, life: 2.6, sprite: WEAPONS[w.id].icon, spin: 12, scale: (w.def.evolved ? 1.3 : 1.7) * s.area, delay: i * 0.12 });
        }
        this.sfx('cross');
        break;
      }
      case 'aura': {
        const R = 46 * s.area;
        this.grid.query(p.x, p.y, R, this.near);
        for (const e of this.near.slice()) {
          const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
          this.damage(e, s.damage, w, dx / d, dy / d);
        }
        this.hitProps(p.x, p.y, R);
        w.pulse = 1;
        if (this.near.length) this.sfx('aura');
        break;
      }
      case 'pool': {
        const foes = this.visibleFoes();
        for (let i = 0; i < s.amount; i++) {
          const t = foes.length ? foes[(this.rng() * foes.length) | 0] : null;
          const tx = t ? t.x : p.x + (this.rng() - 0.5) * 220;
          const ty = t ? t.y : p.y + (this.rng() - 0.5) * 160;
          this.projectiles.push({ kind: 'flask', w, x: p.x, y: p.y - 10, sx: p.x, sy: p.y - 10, tx, ty, t: 0, dur: 0.45, delay: i * 0.1, sprite: 'w-water', rot: 0, spin: 10, scale: 1, life: 1, hit: null });
        }
        break;
      }
      case 'strike': {
        const foes = this.visibleFoes();
        for (let i = 0; i < s.amount && foes.length; i++) {
          const t = foes.splice((this.rng() * foes.length) | 0, 1)[0];
          this.strikes.push({ w, x: t.x, y: t.y, delay: i * 0.07, r: 26 * s.area, done: false, life: 0.22 });
          if (s.double) this.strikes.push({ w, x: t.x, y: t.y, delay: i * 0.07 + 0.18, r: 26 * s.area, done: false, life: 0.22 });
        }
        break;
      }
      case 'fireball': {
        const foes = this.visibleFoes();
        const t = foes.length ? foes[(this.rng() * foes.length) | 0] : null;
        const base = t ? Math.atan2(t.y - p.y, t.x - p.x) : this.rng() * TAU;
        for (let i = 0; i < s.amount; i++) {
          const a = base + (this.rng() - 0.5) * 0.9;
          this.shoot(w, { x: p.x, y: p.y - 8, a, speed: 150 * s.speed, r: 7 * s.area, life: 2.6, sprite: 'fx-flame', frames: 3, scale: 1.1 * s.area, delay: i * 0.05, burst: w.def.evolved });
        }
        this.sfx('fire');
        break;
      }
      default:
    }
  }

  shoot(w, o) {
    const vx = o.vx ?? Math.cos(o.a) * o.speed, vy = o.vy ?? Math.sin(o.a) * o.speed;
    this.projectiles.push({
      kind: o.accel ? 'boomerang' : 'shot', w, x: o.x, y: o.y, vx, vy, dx: vx, dy: vy, gravity: o.gravity || 0, accel: o.accel || 0,
      r: o.r, life: o.life, pierce: w.s.pierce ?? 1, sprite: o.sprite, frames: o.frames || 0, rot: Math.atan2(vy, vx), spin: o.spin || 0,
      scale: o.scale || 1, delay: o.delay || 0, hit: new Set(), returned: false, burst: o.burst, age: 0,
    });
  }

  updateProjectiles(dt) {
    const near = this.near;
    for (const pr of this.projectiles) {
      if (pr.delay > 0) {
        pr.delay -= dt;
        if (pr.delay <= 0) { pr.x = this.player.x; pr.y = this.player.y - 8; if (pr.kind === 'flask') { pr.sx = pr.x; pr.sy = pr.y; } }
        continue;
      }
      pr.age += dt;
      if (pr.kind === 'flask') {
        pr.t += dt / pr.dur;
        pr.x = pr.sx + (pr.tx - pr.sx) * pr.t;
        pr.y = pr.sy + (pr.ty - pr.sy) * pr.t;
        pr.rot += pr.spin * dt;
        if (pr.t >= 1) {
          pr.life = 0;
          const s = pr.w.s;
          this.pools.push({ w: pr.w, x: pr.tx, y: pr.ty, r: 28 * s.area, life: s.duration, max: s.duration, tick: 0, seek: s.seek });
          this.sfx('water');
        }
        continue;
      }
      pr.life -= dt;
      if (pr.gravity) pr.vy += pr.gravity * dt;
      if (pr.accel) {
        const d = Math.hypot(pr.dx, pr.dy) || 1;
        pr.vx -= (pr.dx / d) * pr.accel * dt;
        pr.vy -= (pr.dy / d) * pr.accel * dt;
        // On the way back it can hit the same foes again.
        if (!pr.returned && pr.vx * pr.dx + pr.vy * pr.dy < 0) { pr.returned = true; pr.hit.clear(); }
      }
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.rot = pr.spin ? pr.rot + pr.spin * dt : Math.atan2(pr.vy, pr.vx);
      this.grid.query(pr.x, pr.y, pr.r, near);
      for (let i = 0; i < near.length && pr.pierce > 0; i++) {
        const e = near[i];
        if (e.dead || pr.hit.has(e.id)) continue;
        pr.hit.add(e.id);
        const d = Math.hypot(pr.vx, pr.vy) || 1;
        this.damage(e, pr.w.s.damage, pr.w, pr.vx / d, pr.vy / d);
        if (pr.burst) this.effect('fx-flame', e.x, e.y - 8, { frames: 3, life: 0.3, scale: 1.6 });
        pr.pierce--;
      }
      this.hitProps(pr.x, pr.y, pr.r);
      if (pr.pierce <= 0) pr.life = 0;
    }
    this.projectiles = this.projectiles.filter((pr) => pr.life > 0);
  }

  updateSlashes(dt) {
    const p = this.player;
    const near = this.near;
    for (const sl of this.slashes) {
      if (sl.delay > 0) { sl.delay -= dt; continue; }
      if (!sl.done) {
        sl.done = true;
        const s = sl.w.s;
        const w = 112 * s.area, h = 26 * s.area;
        sl.cx = p.x + sl.side * (w / 2 + 2);
        sl.cy = p.y - 8 - sl.row * 18;
        sl.w2 = w; sl.h2 = h;
        this.grid.query(sl.cx, sl.cy, w / 2, near);
        for (const e of near.slice()) {
          if (Math.abs(e.x - sl.cx) <= w / 2 + e.r && Math.abs(e.y - sl.cy) <= h / 2 + e.r) this.damage(e, s.damage, sl.w, sl.side, 0);
        }
        this.hitProps(sl.cx, sl.cy, w / 2);
        this.sfx('whip');
      }
      sl.life -= dt;
    }
    this.slashes = this.slashes.filter((sl) => sl.life > 0);
  }

  updateStrikes(dt) {
    for (const st of this.strikes) {
      if (st.delay > 0) { st.delay -= dt; continue; }
      if (!st.done) {
        st.done = true;
        this.grid.query(st.x, st.y, st.r, this.near);
        for (const e of this.near.slice()) this.damage(e, st.w.s.damage, st.w);
        this.hitProps(st.x, st.y, st.r);
        st.path = this.boltPath(st.x, st.y);
        this.effect('fx-zap', st.x, st.y, { frames: 4, life: 0.25, scale: st.r / 14 });
        this.shake = Math.min(4, this.shake + 1);
        this.sfx('lightning');
      }
      st.life -= dt;
    }
    this.strikes = this.strikes.filter((st) => st.life > 0);
  }

  boltPath(x, y) {
    const pts = [];
    const top = y - this.vh * 0.7;
    let px = x + (this.rng() - 0.5) * 60;
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push(i === 8 ? x : px, top + (y - top) * t);
      px += (this.rng() - 0.5) * 26 + (x - px) * 0.3;
    }
    return pts;
  }

  updatePools(dt) {
    const p = this.player;
    for (const pool of this.pools) {
      pool.life -= dt;
      pool.tick -= dt;
      if (pool.seek) {
        const dx = p.x - pool.x, dy = p.y - pool.y, d = Math.hypot(dx, dy) || 1;
        pool.x += (dx / d) * 34 * dt; pool.y += (dy / d) * 34 * dt;
        pool.r = Math.min(pool.r + 5 * dt, 28 * pool.w.s.area * 1.8);
      }
      if (pool.tick <= 0) {
        pool.tick = 0.33;
        this.grid.query(pool.x, pool.y, pool.r, this.near);
        for (const e of this.near.slice()) this.damage(e, pool.w.s.damage, pool.w);
        this.hitProps(pool.x, pool.y, pool.r);
      }
    }
    this.pools = this.pools.filter((pool) => pool.life > 0);
  }

  updateOrbit(w, dt) {
    const s = w.s, p = this.player;
    if (w.active <= 0) {
      w.timer -= dt;
      if (w.timer <= 0) { w.active = s.duration; this.sfx('tomes'); }
      w.books = 0;
      return;
    }
    w.active -= dt;
    if (w.active <= 0) { w.timer = s.cooldown; w.books = 0; return; }
    w.angle += dt * 3.1 * s.speed;
    w.books = s.amount;
    const R = 62 * s.area, br = 9 * Math.sqrt(s.area);
    for (let i = 0; i < s.amount; i++) {
      const a = w.angle + (i / s.amount) * TAU;
      const bx = p.x + Math.cos(a) * R, by = p.y - 8 + Math.sin(a) * R;
      this.grid.query(bx, by, br, this.near);
      for (const e of this.near.slice()) {
        if (!e.hits) e.hits = new Map();
        const last = e.hits.get(w.id) ?? -9;
        if (this.time - last < 0.45) continue;
        e.hits.set(w.id, this.time);
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
        this.damage(e, s.damage, w, dx / d, dy / d);
      }
      this.hitProps(bx, by, br);
    }
  }

  // -------------------------------------------------------------------------
  // Pickups and the breakable braziers and coffins
  // -------------------------------------------------------------------------
  drop(type, x, y, value = 1) {
    const sprite = type === 'gem' ? gemSprite(value) : type === 'gold' ? (value >= 5 ? 'gold-2' : 'gold-1') : type;
    this.drops.push({ type, x, y, value, sprite, mag: false, v: 0, bob: this.rng() * TAU, age: 0 });
    if (type === 'gem' && this.drops.length > MAX_GEMS) this.mergeGems();
  }

  /** Too many gems on the floor: the oldest fuse into one big gem where the first lay. */
  mergeGems() {
    const gems = this.drops.filter((d) => d.type === 'gem' && !d.mag);
    if (gems.length < 60) return;
    const old = gems.slice(0, 60);
    const value = old.reduce((n, g) => n + g.value, 0);
    const keep = new Set(old);
    this.drops = this.drops.filter((d) => !keep.has(d));
    this.drops.push({ type: 'gem', x: old[0].x, y: old[0].y, value, sprite: 'gem-4', mag: false, v: 0, bob: 0, age: 0 });
  }

  updateDrops(dt) {
    const p = this.player;
    const reach = BASE_PICKUP * this.stats.magnet;
    for (const d of this.drops) {
      d.age += dt;
      const dx = p.x - d.x, dy = p.y - 6 - d.y, dist = Math.hypot(dx, dy) || 1;
      if (!d.mag && d.type !== 'chest' && dist < reach) d.mag = true;
      if (d.mag) {
        d.v = Math.min(520, d.v + 900 * dt);
        d.x += (dx / dist) * d.v * dt;
        d.y += (dy / dist) * d.v * dt;
      }
      if (dist < p.r + (d.type === 'chest' ? 14 : 8)) this.collect(d);
    }
    this.drops = this.drops.filter((d) => !d.taken && Math.hypot(d.x - p.x, d.y - p.y) < 2600);
  }

  collect(d) {
    if (this.demo) { d.taken = true; return; }
    d.taken = true;
    const p = this.player;
    switch (d.type) {
      case 'gem': {
        const ups = gainXp(p, d.value * this.stats.growth);
        this.sfx('gem');
        if (ups) { this.pendingLevels += ups; this.sfx('levelup'); this.effect('fx-burst', p.x, p.y - 12, { life: 0.5, scale: 2.4, alpha: 0.8 }); }
        break;
      }
      case 'gold': this.gold += d.value; this.sfx('gold'); this.text(d.x, d.y - 10, `+${d.value}`, '#ffd76a'); break;
      case 'roast': this.heal(30); this.sfx('heal'); break;
      case 'lodestar':
        for (const g of this.drops) if (g.type === 'gem') g.mag = true;
        this.sfx('vacuum');
        break;
      case 'chest': this.pendingChests++; this.sfx('chest'); break;
      default:
    }
  }

  updateProps(dt) {
    const p = this.player;
    this.propT -= dt;
    if (this.propT <= 0 && this.props.length < 7) {
      this.propT = 4 + this.rng() * 4;
      const R = Math.hypot(this.vw, this.vh) / 2 + 40 + this.rng() * 260;
      const a = this.rng() * TAU;
      this.props.push({ type: this.rng() < 0.6 ? 'brazier' : 'coffin', x: p.x + Math.cos(a) * R, y: p.y + Math.sin(a) * R, r: 9, phase: this.rng() * 8 });
    }
    this.props = this.props.filter((o) => !o.broken && Math.hypot(o.x - p.x, o.y - p.y) < 1500);
  }

  hitProps(x, y, r) {
    for (const o of this.props) {
      if (o.broken || Math.hypot(o.x - x, o.y - y) > r + o.r) continue;
      o.broken = true;
      this.sfx('break');
      this.effect('fx-necro', o.x, o.y - 10, { frames: 3, life: 0.35, alpha: 0.6 });
      if (this.demo) continue;
      const roll = this.rng();
      if (roll < 0.5) this.drop('gold', o.x, o.y, roll < 0.15 ? 10 : 3);
      else if (roll < 0.85) this.drop('roast', o.x, o.y);
      else this.drop('lodestar', o.x, o.y);
    }
  }

  // -------------------------------------------------------------------------
  // Effects and floating text
  // -------------------------------------------------------------------------
  effect(sprite, x, y, { frames = 0, life = 0.4, scale = 1, alpha = 1 } = {}) {
    if (this.effects.length > 140) return;
    this.effects.push({ sprite, x, y, frames, life, max: life, scale, alpha });
  }

  text(x, y, str, color = '#fff', size = 1) {
    this.texts.push({ x, y, str, color, life: 0.7, size });
  }

  updateEffects(dt) {
    for (const f of this.effects) f.life -= dt;
    this.effects = this.effects.filter((f) => f.life > 0);
    for (const t of this.texts) { t.life -= dt; t.y -= 24 * dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
    this.shake = Math.max(0, this.shake - dt * 20);
  }

  // -------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------
  /** Draw a sprite with its feet (bottom of its opaque box) at x, y, in world space. */
  draw(id, x, y, { scale = 1, flip = false, variant = null, alpha = 1, rot = 0, center = false } = {}) {
    const d = this.sprites?.get(id, variant);
    if (!d) return;
    const [bx, by, bw, bh] = this.sprites.box(id);
    const ctx = this.ctx, Z = this.zoom;
    const ox = center ? bx + bw / 2 : bx + bw / 2;
    const oy = center ? by + bh / 2 : by + bh;
    const sx = (flip ? -1 : 1) * scale * Z, sy = scale * Z;
    const tx = (x - this.vx0) * Z, ty = (y - this.vy0) * Z;
    if (rot) {
      const c = Math.cos(rot), s = Math.sin(rot);
      ctx.setTransform(c * sx, s * sx, -s * sy, c * sy, tx, ty);
    } else ctx.setTransform(sx, 0, 0, sy, Math.round(tx), Math.round(ty));
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(d.src, d.sx, d.sy, d.sw, d.sh, -ox, -oy, d.sw, d.sh);
    if (alpha !== 1) ctx.globalAlpha = 1;
  }

  world() { this.ctx.setTransform(this.zoom, 0, 0, this.zoom, -this.vx0 * this.zoom, -this.vy0 * this.zoom); }

  render() {
    const ctx = this.ctx;
    if (!ctx || !ctx.setTransform || !this.sprites) return;
    const p = this.player, Z = this.zoom;
    const quake = this.calm ? 0 : this.shake;
    const shx = quake ? (this.rng() - 0.5) * quake : 0, shy = quake ? (this.rng() - 0.5) * quake : 0;
    const camX = this.demo ? p.x : this.cam.x, camY = this.demo ? p.y : this.cam.y;
    this.vx0 = Math.round((camX - this.vw / 2 + shx) * Z) / Z;
    this.vy0 = Math.round((camY - this.vh / 2 + shy) * Z) / Z;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#07060a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawFloor();
    for (const d of this.decals) this.draw(d.id, d.x, d.y + 8, { scale: d.scale, alpha: 0.75 });
    this.drawPools();
    this.drawDecor();
    for (const o of this.props) {
      if (o.type === 'brazier') this.draw(`brazier.${Math.floor(this.time * 10 + o.phase) % 8}`, o.x, o.y, { scale: 0.9 });
      else this.draw('coffin', o.x, o.y, { scale: 0.9 });
    }
    this.drawDrops();
    this.drawAura();
    this.drawShadows();
    this.drawActors();
    this.drawProjectiles();
    this.drawSlashes();
    this.drawStrikes();
    for (const f of this.effects) {
      const k = 1 - f.life / f.max;
      const id = f.frames ? `${f.sprite}.${Math.min(f.frames - 1, Math.floor(k * f.frames))}` : f.sprite;
      this.draw(id, f.x, f.y, { scale: f.scale * (f.frames ? 1 : 0.6 + k * 0.6), alpha: f.alpha * (1 - k * 0.6), center: true });
    }
    this.drawShots();
    this.drawTexts();
    this.drawOverlay();
  }

  drawFloor() {
    const x0 = Math.floor(this.vx0 / TILE), y0 = Math.floor(this.vy0 / TILE);
    const x1 = Math.ceil((this.vx0 + this.vw) / TILE), y1 = Math.ceil((this.vy0 + this.vh) / TILE);
    const c = this.corruption;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const h = hash2(tx, ty);
        const v = h < 0.55 ? 0 : h < 0.75 ? 1 : h < 0.9 ? 2 : 3;
        this.tile(`floor.${v}`, tx * TILE, ty * TILE, 1);
        // Corruption seeps in as blotches that spread and deepen as it grows.
        if (c > 0) {
          const seep = noise(tx / 4.5, ty / 4.5) * 0.75 + hash2(tx * 7 + 3, ty * 13 + 5) * 0.25;
          const a = Math.min(1, (c * 1.25 - seep) * 2.5);
          if (a > 0.04) this.tile(`hell.${(h * 4) | 0}`, tx * TILE, ty * TILE, a * 0.85);
        }
      }
    }
  }

  tile(id, x, y, alpha) {
    const d = this.sprites.get(id);
    if (!d) return;
    const Z = this.zoom, ctx = this.ctx;
    ctx.setTransform(Z, 0, 0, Z, Math.round((x - this.vx0) * Z), Math.round((y - this.vy0) * Z));
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(d.src, d.sx, d.sy, d.sw, d.sh, 0, 0, TILE, TILE);
    if (alpha !== 1) ctx.globalAlpha = 1;
  }

  drawDecor() {
    const C = 224;
    const x0 = Math.floor((this.vx0 - 64) / C), y0 = Math.floor((this.vy0 - 64) / C);
    const x1 = Math.floor((this.vx0 + this.vw + 64) / C), y1 = Math.floor((this.vy0 + this.vh + 64) / C);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const h = hash2(cx * 31 + 7, cy * 17 + 3);
        if (h > 0.38 || (Math.abs(cx) < 1 && Math.abs(cy) < 1)) continue;
        const id = DECOR[Math.floor(hash2(cx, cy * 3 + 1) * DECOR.length)];
        const x = cx * C + 30 + hash2(cx + 5, cy) * (C - 60), y = cy * C + 40 + hash2(cx, cy + 9) * (C - 60);
        this.draw(id, x, y, { alpha: 0.9 });
      }
    }
  }

  drawPools() {
    const ctx = this.ctx;
    for (const pool of this.pools) {
      const k = pool.life / pool.max;
      const evolved = pool.w.def.evolved;
      this.world();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(pool.x, pool.y, 0, pool.x, pool.y, pool.r * 1.2);
      g.addColorStop(0, evolved ? 'rgba(120,200,255,.35)' : 'rgba(90,150,255,.3)');
      g.addColorStop(1, 'rgba(40,80,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(pool.x, pool.y, pool.r * 1.2, pool.r * 0.8, 0, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      const frames = evolved ? 2 : 3;
      const id = `${evolved ? 'fx-font' : 'fx-holy'}.${Math.floor(this.time * 8 + pool.x) % frames}`;
      this.draw(id, pool.x, pool.y, { scale: (pool.r * 2) / 28, alpha: Math.min(1, k * 3) * 0.9, center: true });
    }
  }

  drawDrops() {
    for (const d of this.drops) {
      const bob = d.type === 'chest' ? 0 : Math.sin(this.time * 4 + d.bob) * 1.5;
      if (d.type === 'chest') {
        this.world();
        const ctx = this.ctx;
        const g = ctx.createRadialGradient(d.x, d.y - 10, 0, d.x, d.y - 10, 30);
        g.addColorStop(0, `rgba(255,215,110,${0.35 + Math.sin(this.time * 5) * 0.12})`);
        g.addColorStop(1, 'rgba(255,215,110,0)');
        ctx.fillStyle = g;
        ctx.fillRect(d.x - 30, d.y - 40, 60, 60);
      }
      const scale = d.type === 'gem' ? (d.value >= 20 ? 0.75 : 0.55) : d.type === 'chest' ? 1 : 0.7;
      this.draw(d.sprite, d.x, d.y + bob, { scale });
    }
  }

  drawAura() {
    const aura = this.weapons.find((w) => w.def.kind === 'aura');
    if (!aura) return;
    const p = this.player, ctx = this.ctx;
    const R = 46 * aura.s.area;
    aura.pulse = Math.max(0, (aura.pulse || 0) - 0.06);
    const evolved = aura.def.evolved;
    this.world();
    const g = ctx.createRadialGradient(p.x, p.y - 6, R * 0.2, p.x, p.y - 6, R);
    g.addColorStop(0, 'rgba(255,240,190,0)');
    g.addColorStop(0.75, `rgba(255,226,140,${0.08 + aura.pulse * 0.12})`);
    g.addColorStop(1, evolved ? 'rgba(255,250,220,.32)' : 'rgba(255,220,130,.22)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 6, R, 0, TAU);
    ctx.fill();
    this.draw('fx-halo', p.x, p.y - 6, { scale: (R * 2) / 30, alpha: 0.25 + aura.pulse * 0.4, center: true, rot: this.time * 0.6 });
  }

  drawShadows() {
    const ctx = this.ctx;
    this.world();
    ctx.fillStyle = 'rgba(0,0,0,.38)';
    ctx.beginPath();
    const shadow = (x, y, w) => { ctx.moveTo(x + w, y); ctx.ellipse(x, y, w, w * 0.38, 0, 0, TAU); };
    const p = this.player;
    shadow(p.x, p.y, 7);
    for (const e of this.enemies) {
      if (e.dead) continue;
      shadow(e.x, e.y, e.r * 0.8 * (e.def.fly ? 0.7 : 1) * (e.boss ? 1.2 : 1));
    }
    ctx.fill();
  }

  drawActors() {
    const p = this.player;
    const list = this.enemies.filter((e) => !e.dead);
    list.push(p);
    list.sort((a, b) => a.y - b.y);
    const t = this.time;
    for (const a of list) {
      if (a === p) { this.drawPlayer(); continue; }
      const e = a;
      const lift = e.def.fly ? 6 + Math.sin(t * 6 + e.phase) * 2.5 : Math.abs(Math.sin(t * 8 + e.phase)) * 1.5;
      const flip = (e.vx >= 0 ? 1 : -1) !== e.face;
      const variant = e.tint;
      if (e.boss || e.elite) {
        const k = e.boss ? 1 : 0.6;
        this.draw(`fx-necro.${Math.floor(t * 6 + e.phase) % 3}`, e.x, e.y - 10 * e.scale, { scale: e.scale * 1.1 * k, alpha: 0.45, center: true });
      }
      this.draw(e.def.sprite, e.x, e.y - lift, { scale: e.scale, flip, variant, alpha: e.def.ghost ? 0.72 : 1 });
      // A hit flashes the sprite pale for an instant, over its own colors rather than replacing them.
      if (e.flash > 0) this.draw(e.def.sprite, e.x, e.y - lift, { scale: e.scale, flip, variant: 'flash', alpha: Math.min(0.6, e.flash * 6) });
    }
  }

  drawPlayer() {
    const p = this.player, ctx = this.ctx;
    if (this.over && !this.won) return;
    const bob = p.moving ? Math.abs(Math.sin(p.walk)) * 2 : Math.sin(this.time * 2) * 0.5;
    this.draw(this.char.sprite, p.x, p.y - bob, { flip: p.facing < 0, variant: p.hurt > 0 ? 'crimson' : null });
    if (this.demo) return;
    // Health under the feet.
    this.world();
    const w = 20, k = Math.max(0, p.hp / this.stats.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,.7)';
    ctx.fillRect(p.x - w / 2 - 1, p.y + 3, w + 2, 4);
    ctx.fillStyle = k > 0.35 ? '#d8343f' : '#ff6a3d';
    ctx.fillRect(p.x - w / 2, p.y + 4, w * k, 2);
  }

  drawProjectiles() {
    const ctx = this.ctx;
    for (const pr of this.projectiles) {
      if (pr.delay > 0) continue;
      if (pr.kind === 'flask') {
        const arc = Math.sin(Math.PI * Math.min(1, pr.t)) * 30;
        this.draw('w-water', pr.x, pr.y - arc, { rot: pr.rot, center: true, scale: 0.8 });
        continue;
      }
      const id = pr.frames ? `${pr.sprite}.${Math.floor(pr.age * 14) % pr.frames}` : pr.sprite;
      if (pr.sprite === 'fx-dart' || pr.sprite === 'fx-flame') {
        this.world();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, pr.r * 2.4);
        g.addColorStop(0, pr.sprite === 'fx-dart' ? 'rgba(220,140,255,.55)' : 'rgba(255,150,60,.5)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(pr.x - pr.r * 2.4, pr.y - pr.r * 2.4, pr.r * 4.8, pr.r * 4.8);
        ctx.globalCompositeOperation = 'source-over';
      }
      this.draw(id, pr.x, pr.y, { rot: pr.rot, center: true, scale: pr.scale });
    }
    // The tomes in orbit.
    const p = this.player;
    for (const w of this.weapons) {
      if (!w.books) continue;
      const R = 62 * w.s.area;
      for (let i = 0; i < w.books; i++) {
        const a = w.angle + (i / w.books) * TAU;
        this.draw(WEAPONS[w.id].icon, p.x + Math.cos(a) * R, p.y - 8 + Math.sin(a) * R, { center: true, scale: 0.8 * Math.sqrt(w.s.area) });
      }
    }
  }

  drawSlashes() {
    const ctx = this.ctx;
    for (const sl of this.slashes) {
      if (!sl.done) continue;
      const k = 1 - sl.life / sl.w.s.duration;
      const evolved = sl.w.def.evolved;
      this.world();
      ctx.save();
      ctx.translate(sl.cx, sl.cy);
      ctx.scale(sl.side, 1);
      const w = sl.w2, h = sl.h2;
      ctx.globalAlpha = 1 - k;
      ctx.lineCap = 'round';
      const sweep = Math.min(1, k * 2.5);
      ctx.beginPath();
      ctx.moveTo(-w / 2, h * 0.15);
      ctx.quadraticCurveTo(0, -h * 0.9, -w / 2 + w * sweep, h * 0.1);
      ctx.strokeStyle = evolved ? 'rgba(255,60,80,.95)' : 'rgba(255,245,230,.95)';
      ctx.lineWidth = h * 0.42;
      ctx.stroke();
      ctx.strokeStyle = evolved ? 'rgba(120,0,20,.9)' : 'rgba(200,160,120,.8)';
      ctx.lineWidth = h * 0.14;
      ctx.stroke();
      ctx.restore();
    }
  }

  drawStrikes() {
    const ctx = this.ctx;
    for (const st of this.strikes) {
      if (!st.done || !st.path) continue;
      const a = st.life / 0.22;
      this.world();
      ctx.lineJoin = 'round';
      for (const [width, color] of [[7, `rgba(120,200,255,${0.35 * a})`], [2.5, `rgba(240,250,255,${a})`]]) {
        ctx.beginPath();
        ctx.moveTo(st.path[0], st.path[1]);
        for (let i = 2; i < st.path.length; i += 2) ctx.lineTo(st.path[i], st.path[i + 1]);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(st.x, st.y, 0, st.x, st.y, st.r * 1.4);
      g.addColorStop(0, `rgba(180,230,255,${0.6 * a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(st.x - st.r * 1.4, st.y - st.r * 1.4, st.r * 2.8, st.r * 2.8);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  drawShots() {
    const ctx = this.ctx;
    if (!this.shots.length) return;
    this.world();
    for (const s of this.shots) {
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 2);
      g.addColorStop(0, 'rgba(230,140,255,.95)');
      g.addColorStop(0.5, 'rgba(120,20,160,.7)');
      g.addColorStop(1, 'rgba(40,0,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 2, 0, TAU);
      ctx.fill();
    }
  }

  drawTexts() {
    const ctx = this.ctx;
    this.world();
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.life * 3);
      ctx.font = `700 ${Math.round(8 * t.size)}px Inter, system-ui, sans-serif`;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(0,0,0,.8)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  /** Torchlight around the survivor, darkness at the edges, tinted crimson as corruption grows. */
  drawOverlay() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const p = this.player;
    const c = Math.round(this.corruption * 6) / 6;
    const low = !this.demo && p.hp / this.stats.maxHp < 0.3;
    const key = `${W}x${H}:${c}:${low}`;
    if (this.vignetteKey !== key) {
      this.vignetteKey = key;
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.22, W / 2, H / 2, Math.hypot(W, H) * 0.55);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.6, `rgba(${Math.round(20 + 60 * c)},0,${Math.round(10 + 25 * c)},${0.25 + 0.15 * c})`);
      g.addColorStop(1, low ? 'rgba(120,0,10,.82)' : `rgba(${Math.round(8 + 50 * c)},0,${Math.round(6 + 30 * c)},${0.72 + 0.1 * c})`);
      this.vignette = g;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.vignette) {
      ctx.fillStyle = this.vignette;
      ctx.fillRect(0, 0, W, H);
    }
    if (p.hurt > 0) {
      ctx.fillStyle = `rgba(200,0,20,${p.hurt * 0.6})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
}
