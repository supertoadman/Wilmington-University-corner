// Crypt Survivors: what's in the game. Characters, weapons and their evolutions, passive relics,
// corruptions (the debuffs a wrong answer brings), enemies, bosses and the waves of the run.
// Sprite names are ids in the atlas (Assets/survivors/tiles/, CC0 tiles from crawl/tiles).
// Pure data, so tests (tests/survivors.test.mjs) can import it without a browser.

export const RUN_SECONDS = 15 * 60;
export const MAX_WEAPONS = 6;
export const MAX_PASSIVES = 6;
export const WEAPON_MAX = 8;
export const CORRUPTION_MAX = 5;

/** Base stats every survivor starts from; character mods add to these. */
export const BASE_STATS = {
  maxHp: 100, armor: 0, regen: 0, move: 1, might: 1, area: 1, speed: 1, cooldown: 1, amount: 0,
  duration: 1, magnet: 1, growth: 1, damageTaken: 1, enemySpeed: 1, spawnRate: 1, chip: 0,
};

export const CHARACTERS = [
  { id: 'advocate', name: 'The Advocate', sprite: 'hero-advocate', weapon: 'whip', perk: '+10% damage', blurb: 'Cracks a whip across the crypt floor.', mods: { might: 0.1 } },
  { id: 'scholar', name: 'The Scholar', sprite: 'hero-scholar', weapon: 'wand', perk: '−10% cooldown', blurb: 'Hurls arcane bolts at the nearest foe.', mods: { cooldown: -0.1 } },
  { id: 'bailiff', name: 'The Bailiff', sprite: 'hero-bailiff', weapon: 'axe', perk: '+1 armor, +20 max HP', blurb: 'Throws heavy axes in high arcs.', mods: { armor: 1, maxHp: 20 } },
  { id: 'paladin', name: 'The Paladin', sprite: 'hero-paladin', weapon: 'aura', perk: '+0.4 HP/s', blurb: 'A sanctuary aura sears whatever comes near.', mods: { regen: 0.4 } },
];

// ---------------------------------------------------------------------------
// Weapons. `base` is level 1; `levels[i]` is what level i + 2 adds. Damage, cooldown (seconds),
// area (× base size), amount (projectiles), speed (× base), duration (seconds), pierce (hits).
// A weapon at WEAPON_MAX with its `evolve.with` passive owned can evolve into `evolve.into`.
// ---------------------------------------------------------------------------
export const WEAPONS = {
  whip: {
    name: 'Whip', icon: 'w-whip', kind: 'whip', desc: 'Lashes horizontally in the direction you face. Ignores armor of the dead.',
    base: { damage: 10, cooldown: 1.35, area: 1, amount: 1, duration: 0.22, knockback: 1 },
    levels: [{ amount: 1 }, { damage: 5 }, { damage: 5, area: 0.1 }, { damage: 5 }, { damage: 5, area: 0.1 }, { damage: 5 }, { damage: 5 }],
    evolve: { with: 'heart', into: 'scourge' },
  },
  wand: {
    name: 'Magic Wand', icon: 'w-wand', kind: 'bolt', desc: 'Fires an arcane bolt at the nearest enemy.',
    base: { damage: 10, cooldown: 1.2, amount: 1, speed: 1, pierce: 1, area: 1 },
    levels: [{ amount: 1 }, { cooldown: -0.2 }, { amount: 1 }, { damage: 10 }, { amount: 1 }, { pierce: 1 }, { damage: 10 }],
    evolve: { with: 'quill', into: 'sceptre' },
  },
  axe: {
    name: 'Throwing Axe', icon: 'w-axe', kind: 'axe', desc: 'High-damage axes tossed in an arc. Passes through several foes.',
    base: { damage: 20, cooldown: 2.0, amount: 1, speed: 1, pierce: 3, area: 1 },
    levels: [{ amount: 1 }, { damage: 10 }, { pierce: 2 }, { amount: 1 }, { damage: 10 }, { pierce: 2 }, { damage: 10 }],
    evolve: { with: 'candle', into: 'crescent' },
  },
  cross: {
    name: 'Cross', icon: 'w-cross', kind: 'cross', desc: 'A blessed chakram flies at the nearest foe and returns like a boomerang.',
    base: { damage: 14, cooldown: 2.0, amount: 1, speed: 1, pierce: Infinity, area: 1 },
    levels: [{ damage: 10 }, { area: 0.1 }, { amount: 1 }, { damage: 10 }, { speed: 0.25 }, { amount: 1 }, { damage: 10 }],
    evolve: { with: 'bracer', into: 'covenant' },
  },
  aura: {
    name: 'Sanctuary Aura', icon: 'w-aura', kind: 'aura', desc: 'A ring of holy light burns and repels everything close by.',
    base: { damage: 6, cooldown: 0.9, area: 1, knockback: 0.8 },
    levels: [{ area: 0.2, damage: 2 }, { cooldown: -0.1, damage: 1 }, { area: 0.2 }, { damage: 2 }, { area: 0.2, cooldown: -0.1 }, { damage: 2 }, { area: 0.2 }],
    evolve: { with: 'armor', into: 'hallowed' },
  },
  tomes: {
    name: 'Orbiting Tomes', icon: 'w-tomes', kind: 'orbit', desc: 'Heavy books of precedent circle you, battering anything they touch.',
    base: { damage: 10, cooldown: 3.0, amount: 1, speed: 1, duration: 3, area: 1, knockback: 1 },
    levels: [{ amount: 1 }, { speed: 0.3, area: 0.25 }, { damage: 10, duration: 0.5 }, { amount: 1 }, { speed: 0.3, area: 0.25 }, { damage: 10, duration: 0.5 }, { amount: 1 }],
    evolve: { with: 'binding', into: 'codex' },
  },
  water: {
    name: 'Holy Water', icon: 'w-water', kind: 'pool', desc: 'Flasks shatter into pools of holy fire that burn the ground.',
    base: { damage: 10, cooldown: 4.5, amount: 1, area: 1, duration: 2.2 },
    levels: [{ amount: 1, area: 0.2 }, { damage: 10, duration: 0.5 }, { amount: 1, area: 0.2 }, { damage: 10, duration: 0.3 }, { amount: 1, area: 0.2 }, { damage: 5, duration: 0.3 }, { damage: 5, area: 0.2 }],
    evolve: { with: 'magnet', into: 'font' },
  },
  lightning: {
    name: 'Lightning Ring', icon: 'w-lightning', kind: 'strike', desc: 'Calls lightning down on random enemies in view.',
    base: { damage: 15, cooldown: 4.5, amount: 2, area: 1 },
    levels: [{ amount: 1 }, { area: 0.25, damage: 10 }, { amount: 1 }, { area: 0.25, damage: 20 }, { amount: 1 }, { area: 0.25, damage: 20 }, { amount: 1 }],
    evolve: { with: 'mirror', into: 'tempest' },
  },
  fire: {
    name: 'Fire Wand', icon: 'w-fire', kind: 'fireball', desc: 'Looses fireballs in random directions. Slow, but they hit hard.',
    base: { damage: 20, cooldown: 3.0, amount: 3, speed: 1, pierce: 1, area: 1 },
    levels: [{ damage: 10 }, { damage: 10, speed: 0.2 }, { damage: 10 }, { damage: 10, speed: 0.2 }, { damage: 10 }, { damage: 10, speed: 0.2 }, { damage: 10 }],
    evolve: { with: 'might', into: 'inferno' },
  },

  // Evolutions: one level, stronger in every way.
  scourge: { evolved: true, from: 'whip', name: 'Scourge of Atonement', icon: 'e-whip', kind: 'whip', desc: 'Lashes both ways at once; critical hits heal you.', base: { damage: 45, cooldown: 1.1, area: 1.35, amount: 2, duration: 0.22, knockback: 1.2, crit: 0.3, lifesteal: 1 } },
  sceptre: { evolved: true, from: 'wand', name: 'Sceptre of Verdicts', icon: 'e-wand', kind: 'bolt', desc: 'A ceaseless stream of piercing judgments.', base: { damage: 30, cooldown: 0.16, amount: 1, speed: 1.3, pierce: 2, area: 1.2 } },
  crescent: { evolved: true, from: 'axe', name: "Reaper's Crescent", icon: 'e-axe', kind: 'spiral', desc: 'Scythes spiral out in every direction, through everything.', base: { damage: 60, cooldown: 1.7, amount: 9, speed: 1.2, pierce: Infinity, area: 1.5 } },
  covenant: { evolved: true, from: 'cross', name: 'Blade of the Covenant', icon: 'e-cross', kind: 'cross', desc: 'Swords that return, cutting deep with critical strikes.', base: { damage: 40, cooldown: 1.5, amount: 2, speed: 1.4, pierce: Infinity, area: 1.4, crit: 0.25 } },
  hallowed: { evolved: true, from: 'aura', name: 'Hallowed Ground', icon: 'e-aura', kind: 'aura', desc: 'A vast holy ring. Each foe it destroys mends you.', base: { damage: 16, cooldown: 0.6, area: 2.0, knockback: 1.2, heal: 0.5 } },
  codex: { evolved: true, from: 'tomes', name: 'Codex Eternal', icon: 'e-tomes', kind: 'orbit', desc: 'Five tomes that never stop circling.', base: { damage: 30, cooldown: 0, amount: 5, speed: 1.6, duration: Infinity, area: 1.6, knockback: 1.4 } },
  font: { evolved: true, from: 'water', name: 'Font of Mercy', icon: 'e-water', kind: 'pool', desc: 'Great pools that follow you and keep growing.', base: { damage: 30, cooldown: 3.5, amount: 4, area: 1.8, duration: 4, seek: 1 } },
  tempest: { evolved: true, from: 'lightning', name: 'Tempest Ring', icon: 'e-lightning', kind: 'strike', desc: 'Every bolt strikes twice.', base: { damage: 65, cooldown: 3.2, amount: 7, area: 1.8, double: 1 } },
  inferno: { evolved: true, from: 'fire', name: 'Inferno Brand', icon: 'e-fire', kind: 'fireball', desc: 'Huge fireballs that burn through every foe.', base: { damage: 100, cooldown: 2.4, amount: 4, speed: 1.1, pierce: Infinity, area: 2.2 } },
};

// ---------------------------------------------------------------------------
// Passive relics. `per` is added per level (fractions of the base stat; armor, amount and regen are flat).
// ---------------------------------------------------------------------------
export const PASSIVES = {
  might: { name: 'Tincture of Might', icon: 'p-might', max: 5, desc: '+10% damage', per: { might: 0.10 } },
  quill: { name: 'Quickened Quill', icon: 'p-tome', max: 5, desc: '−8% weapon cooldown', per: { cooldown: -0.08 } },
  candle: { name: 'Candelabrum', icon: 'p-candle', max: 5, desc: '+10% attack area', per: { area: 0.10 } },
  bracer: { name: "Archer's Bracer", icon: 'p-bracer', max: 5, desc: '+10% projectile speed', per: { speed: 0.10 } },
  mirror: { name: 'Mirror Ring', icon: 'p-duplicator', max: 2, desc: '+1 projectile for every weapon', per: { amount: 1 } },
  armor: { name: 'Breastplate', icon: 'p-armor', max: 5, desc: '+1 armor: each hit does 1 less damage', per: { armor: 1 } },
  boots: { name: "Pilgrim's Boots", icon: 'p-boots', max: 5, desc: '+10% move speed', per: { move: 0.10 } },
  magnet: { name: 'Lodestone', icon: 'p-magnet', max: 5, desc: '+25% pickup radius', per: { magnet: 0.25 } },
  heart: { name: 'Crimson Amulet', icon: 'p-heart', max: 5, desc: '+20% max HP, +0.2 HP/s', per: { maxHp: 0.20, regen: 0.2 } },
  binding: { name: 'Binding Charm', icon: 'p-binding', max: 5, desc: '+10% effect duration', per: { duration: 0.10 } },
};

// ---------------------------------------------------------------------------
// Corruptions: what a wrong answer forces on you. Each is the tainted twin of a relic; `per` multiplies
// the stat once per stack (so two stacks of −15% leave 0.85² = 72%). `chip` is HP lost per second per stack.
// ---------------------------------------------------------------------------
export const CORRUPTIONS = {
  shackles: { name: 'Leaden Shackles', icon: 'c-shackles', twin: 'boots', desc: '−15% move speed', per: { move: 0.85 } },
  hourglass: { name: 'Fractured Hourglass', icon: 'c-hourglass', twin: 'quill', desc: '+18% weapon cooldown', per: { cooldown: 1.18 } },
  rust: { name: 'Rusted Edge', icon: 'c-rust', twin: 'might', desc: '−15% damage', per: { might: 0.85 } },
  lantern: { name: 'Dimmed Lantern', icon: 'c-lantern', twin: 'candle', desc: '−20% attack area', per: { area: 0.80 } },
  shattered: { name: 'Shattered Magnet', icon: 'c-magnet', twin: 'magnet', desc: '−35% pickup radius', per: { magnet: 0.65 } },
  tithe: { name: 'Blood Tithe', icon: 'c-tithe', twin: 'heart', desc: '−15% max HP and lose 1 HP every 6 s', per: { maxHp: 0.85 }, chip: 1 / 6 },
  veil: { name: 'Thin Veil', icon: 'c-veil', twin: 'armor', desc: '+15% damage taken', per: { damageTaken: 1.15 } },
  beacon: { name: 'Fell Beacon', icon: 'c-beacon', twin: 'mirror', desc: '+20% enemy speed and spawn rate', per: { enemySpeed: 1.2, spawnRate: 1.2 } },
};

// ---------------------------------------------------------------------------
// Enemies. hp, speed (px/s), power (damage per hit), xp (gem value), r (body radius), mass (knockback
// resistance). `fly` bobs; `ghost` is translucent; `caster` throws necrotic bolts; `face` is the way
// the sprite looks in the tile (+1 right, −1 left) so it can be flipped toward the player.
// ---------------------------------------------------------------------------
export const ENEMIES = {
  bat: { name: 'Crypt Bat', sprite: 'foe-bat', hp: 6, speed: 72, power: 4, xp: 1, r: 8, mass: 0.6, fly: 1, face: 1 },
  rat: { name: 'Plague Rat', sprite: 'foe-rat', hp: 9, speed: 56, power: 5, xp: 1, r: 8, mass: 0.7, face: 1 },
  skeleton: { name: 'Skeleton', sprite: 'foe-skeleton', hp: 18, speed: 46, power: 7, xp: 1, r: 10, mass: 1, face: 1 },
  zombie: { name: 'Rotting Dead', sprite: 'foe-zombie', hp: 34, speed: 34, power: 9, xp: 2, r: 11, mass: 1.3, face: -1 },
  ghost: { name: 'Drowned Soul', sprite: 'foe-ghost', hp: 26, speed: 74, power: 8, xp: 2, r: 10, mass: 0.6, ghost: 1, fly: 1, face: 1 },
  skull: { name: 'Flying Skull', sprite: 'foe-skull', hp: 12, speed: 115, power: 6, xp: 1, r: 8, mass: 0.5, fly: 1, face: 1 },
  ghoul: { name: 'Ghoul', sprite: 'foe-ghoul', hp: 55, speed: 52, power: 10, xp: 3, r: 11, mass: 1.2, face: -1 },
  wraith: { name: 'Shadow Wraith', sprite: 'foe-wraith', hp: 90, speed: 60, power: 13, xp: 3, r: 11, mass: 1, ghost: 1, fly: 1, face: 1 },
  knight: { name: 'Bone Knight', sprite: 'foe-knight', hp: 160, speed: 44, power: 16, xp: 5, r: 11, mass: 2.2, face: 1 },
  vampire: { name: 'Vampire Thrall', sprite: 'foe-vampire', hp: 140, speed: 70, power: 15, xp: 5, r: 10, mass: 1.4, face: 1 },
  hound: { name: 'Hell Hound', sprite: 'foe-hound', hp: 90, speed: 96, power: 14, xp: 4, r: 11, mass: 1.1, face: -1 },
  gargoyle: { name: 'Gargoyle', sprite: 'foe-gargoyle', hp: 300, speed: 40, power: 20, xp: 8, r: 13, mass: 3.5, fly: 1, face: 1 },
  necromancer: { name: 'Necromancer', sprite: 'foe-necromancer', hp: 120, speed: 40, power: 12, xp: 6, r: 10, mass: 1.4, caster: 1, face: 1 },
  imp: { name: 'Crimson Imp', sprite: 'foe-imp', hp: 70, speed: 88, power: 12, xp: 4, r: 9, mass: 0.9, fly: 1, face: 1 },
  hellwing: { name: 'Hellwing', sprite: 'foe-hellwing', hp: 220, speed: 72, power: 18, xp: 8, r: 12, mass: 1.8, fly: 1, face: 1 },
  abomination: { name: 'Abomination', sprite: 'foe-abomination', hp: 600, speed: 30, power: 28, xp: 15, r: 17, mass: 6, scale: 1.5, face: -1 },
};

export const BOSSES = {
  vampireLord: { name: 'The Vampire Lord', sprite: 'boss-vampire-lord', hp: 2600, speed: 62, power: 22, xp: 60, r: 18, mass: 30, scale: 2.2, dash: 1, face: 1 },
  boneDragon: { name: 'The Bone Dragon', sprite: 'boss-bone-dragon', hp: 6500, speed: 46, power: 30, xp: 120, r: 26, mass: 60, scale: 2.8, face: -1 },
  lich: { name: 'The Ancient Lich', sprite: 'boss-lich', hp: 9500, speed: 40, power: 26, xp: 180, r: 20, mass: 50, scale: 2.4, caster: 2, face: 1 },
  balrug: { name: 'The Pit Fiend', sprite: 'boss-balrug', hp: 16000, speed: 56, power: 38, xp: 260, r: 26, mass: 80, scale: 2.8, dash: 1, face: 1 },
  reaper: { name: 'The Reaper', sprite: 'boss-reaper', hp: 42000, speed: 72, power: 60, xp: 600, r: 24, mass: 200, scale: 3, dash: 1, caster: 2, final: 1, face: 1 },
};

// ---------------------------------------------------------------------------
// The run, minute by minute: which foes come (weights), how many at once, how fast. Bosses and
// swarm events at fixed times. After 15:00 (endless) the last five minutes repeat, harder each lap.
// ---------------------------------------------------------------------------
export const WAVES = [
  { foes: { bat: 3, rat: 2 }, alive: 30, every: 0.5 },
  { foes: { rat: 3, skeleton: 2, bat: 2 }, alive: 50, every: 0.4 },
  { foes: { skeleton: 3, zombie: 2, bat: 2 }, alive: 70, every: 0.33 },
  { foes: { zombie: 3, ghost: 2, skeleton: 2 }, alive: 90, every: 0.3 },
  { foes: { ghoul: 3, ghost: 2, skull: 2 }, alive: 110, every: 0.27 },
  { foes: { ghoul: 2, wraith: 2, knight: 1, skeleton: 2 }, alive: 130, every: 0.24 },
  { foes: { knight: 2, vampire: 2, hound: 1, ghoul: 2 }, alive: 150, every: 0.22 },
  { foes: { vampire: 2, hound: 2, wraith: 2 }, alive: 170, every: 0.2 },
  { foes: { gargoyle: 1, imp: 3, knight: 2 }, alive: 190, every: 0.18 },
  { foes: { necromancer: 1, imp: 3, vampire: 2, hound: 1 }, alive: 210, every: 0.17 },
  { foes: { hellwing: 2, gargoyle: 1, imp: 3 }, alive: 240, every: 0.16 },
  { foes: { hellwing: 2, abomination: 1, vampire: 2 }, alive: 270, every: 0.15 },
  { foes: { abomination: 1, hellwing: 2, necromancer: 1, wraith: 2 }, alive: 300, every: 0.14 },
  { foes: { abomination: 2, hellwing: 2, gargoyle: 2, imp: 2 }, alive: 330, every: 0.12 },
  { foes: { abomination: 2, hellwing: 3, gargoyle: 2, necromancer: 1, knight: 2 }, alive: 350, every: 0.1 },
];

/**
 * [second, kind, what]: a boss every three minutes, swarms between, and the Reaper for the last
 * minute. Surviving to 15:00 wins the run; in endless mode the last five minutes loop, harder each
 * lap, with a boss every three minutes and the Reaper every fifth.
 */
export const EVENTS = [
  [75, 'swarm', 'bat'],
  [180, 'boss', 'vampireLord'],
  [270, 'ring', 'skull'],
  [360, 'boss', 'boneDragon'],
  [450, 'swarm', 'ghost'],
  [540, 'boss', 'lich'],
  [630, 'ring', 'imp'],
  [720, 'boss', 'balrug'],
  [780, 'swarm', 'hound'],
  [840, 'boss', 'reaper'],
];
export const ENDLESS_BOSSES = ['vampireLord', 'boneDragon', 'lich', 'balrug', 'reaper'];
