// Crypt Survivors (/survivors/): the screens around the world. The setup checklist (built by
// survivors() in src/templates.mjs, the same course + set picker as Shuffle mode), the level-up
// question, the boon and corruption cards, the HUD, chests, pause, and the end-of-run review.
// Questions come from play/data/ (scripts/game.mjs), so every practice set the site can read is here.

import { World } from './engine.js';
import { Sprites } from './sprites.js';
import { Sound } from './audio.js';
import { CHARACTERS, WEAPONS, PASSIVES, CORRUPTIONS, RUN_SECONDS, WEAPON_MAX, CORRUPTION_MAX } from './defs.js';
import {
  rollUpgrades, rollCorruptions, applyOffer, eligibleEvolutions, levelText, selectQuestions, QuestionDeck,
  LETTERS, fmtTime, corruptionLevel,
} from './logic.js';
import { record } from '../assets/answer-log.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paras = (s) => esc(s).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
const ROOT = document.documentElement.dataset.root || '../';
const DATA = new URL(`${ROOT}play/data/`, location.href);
const KEY = 'survivors-mode.v1';
// The reference popup (assets/refs.js, loaded by the page): the courses with an index, and its panel.
const REFS = document.querySelector('script[data-cards][data-courses]');
const REF_COURSES = new Set(REFS?.dataset.courses.split(/\s+/) || []);
const refsPanel = () => document.querySelector('.rx-panel:not([hidden])');
const closeRefs = () => refsPanel()?.querySelector('.rx-close')?.click();
/** Fetch the picked courses' reference indexes early, so cites are linked by the first level-up. */
function warmRefs(courses) {
  if (!REFS) return;
  for (const slug of courses) {
    if (REF_COURSES.has(slug)) fetch(new URL(`assets/refs/${slug}.json${REFS.dataset.v ? `?v=${REFS.dataset.v}` : ''}`, new URL(REFS.dataset.root || ROOT, location.href))).catch(() => {});
  }
}
const STRIKE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><path d="M4 12h16"/></svg>';

// ---------------------------------------------------------------------------
// Saved on this device: the picked sets, options, survivor, sound, best run, and missed questions.
// ---------------------------------------------------------------------------
const blank = () => ({ sets: [], shuffled: true, missedOnly: false, pacing: 'wrong', endless: false, character: 'advocate', muted: false, missed: {}, best: null });
let saved = blank();
try { saved = { ...blank(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* storage unavailable */ }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* private mode */ } };

// ---------------------------------------------------------------------------
// The world, its art and its sound
// ---------------------------------------------------------------------------
const canvas = $('#sv-world');
const sprites = new Sprites();
const sound = new Sound();
sound.muted = !!saved.muted;
const world = new World(canvas, {
  onLevelUp: () => openQuestion(),
  onChest: () => openChest(),
  onDeath: () => setTimeout(() => finish('fallen'), 1100),
  onVictory: () => setTimeout(() => finish('dawn'), 900),
  onBoss: (def) => banner(`${def.name} rises`, 'boss'),
  onBossDown: (def) => banner(`${def.name} is destroyed · claim the reliquary`, 'good'),
  onEvent: (kind, name) => banner(kind === 'ring' ? `${name}s close in from every side` : `A swarm of ${name.toLowerCase()}s`, 'warn'),
});
world.setSound(sound);
// Screen shake is decoration; leave it out for anyone who asks for less motion.
world.calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

let screen = 'setup';
let run = null;
let modal = null; // 'ask' | 'chest' | null
const keys = new Set();

function show(name) {
  screen = name;
  $$('.sv-screen').forEach((s) => { s.hidden = s.id !== name; });
  $('#hud').hidden = !['play', 'pause'].includes(name);
  document.body.dataset.screen = name;
  if (name !== 'play') $('#boss').hidden = true;
}

// ---------------------------------------------------------------------------
// Setup: the course + practice set checklist, survivor, and options
// ---------------------------------------------------------------------------
const setup = $('#setup');
const boxes = $$('input[data-set]', setup);
const counts = () => {
  const chosen = boxes.filter((b) => b.checked);
  const qs = chosen.reduce((n, b) => n + (saved.missedOnly ? missedIn(b.value) : +b.dataset.count), 0);
  return { sets: chosen.length, qs };
};
const missedIn = (key) => Object.keys(saved.missed).filter((id) => id.startsWith(`${key}/`)).length;

function syncSetup() {
  const { sets, qs } = counts();
  const picked = $('#picked');
  picked.textContent = sets
    ? `${sets} ${sets === 1 ? 'set' : 'sets'} · ${qs.toLocaleString('en-US')} ${saved.missedOnly ? 'missed ' : ''}${qs === 1 ? 'question' : 'questions'}`
    : 'No sets selected';
  $('#begin').disabled = !sets || !qs;
  $('#begin-note').textContent = sets && !qs && saved.missedOnly ? 'No missed questions in these sets yet.' : '';
  $$('[data-course-all]', setup).forEach((btn) => {
    const mine = boxes.filter((b) => b.dataset.course === btn.dataset.courseAll);
    btn.textContent = mine.every((b) => b.checked) ? 'Clear' : 'Select all';
  });
  boxes.forEach((b) => {
    const m = missedIn(b.value);
    const note = b.closest('label').querySelector('[data-missed]');
    if (note) note.textContent = m ? ` · ${m} missed before` : '';
  });
}

function remember() {
  saved.sets = boxes.filter((b) => b.checked).map((b) => b.value);
  persist();
}

function initSetup() {
  // ?course=<slug> (from a course page) picks every set in that course.
  const wanted = new URLSearchParams(location.search).get('course');
  const courseBoxes = wanted ? boxes.filter((b) => b.dataset.course === wanted) : [];
  if (courseBoxes.length) {
    boxes.forEach((b) => { b.checked = b.dataset.course === wanted; });
    remember();
    $(`[data-course-group="${CSS.escape(wanted)}"]`)?.scrollIntoView({ block: 'center' });
  } else boxes.forEach((b) => { b.checked = saved.sets.includes(b.value); });

  $$('[data-course-all]', setup).forEach((btn) => btn.addEventListener('click', () => {
    const mine = boxes.filter((b) => b.dataset.course === btn.dataset.courseAll);
    const on = !mine.every((b) => b.checked);
    mine.forEach((b) => { b.checked = on; });
    syncSetup(); remember();
  }));
  boxes.forEach((b) => b.addEventListener('change', () => { syncSetup(); remember(); }));

  const toggle = (id, key, after) => {
    const el = $(id);
    el.checked = !!saved[key];
    el.addEventListener('change', () => { saved[key] = el.checked; persist(); after?.(); });
  };
  toggle('#opt-shuffle', 'shuffled');
  toggle('#opt-missed', 'missedOnly', syncSetup);
  toggle('#opt-endless', 'endless');
  $$('input[name="pacing"]').forEach((r) => {
    r.checked = r.value === saved.pacing;
    r.addEventListener('change', () => { if (r.checked) { saved.pacing = r.value; persist(); } });
  });
  $('#begin').addEventListener('click', () => begin());
  syncSetup();
}

function renderCharacters() {
  const host = $('#chars');
  host.innerHTML = CHARACTERS.map((c) => {
    const w = WEAPONS[c.weapon];
    return `<button type="button" class="sv-char" data-char="${c.id}" aria-pressed="${saved.character === c.id}">
      <span class="sv-char-art"><img src="${sprites.url(c.sprite)}" alt="" width="64" height="64"></span>
      <span class="sv-char-text"><strong>${esc(c.name)}</strong><small>${esc(c.blurb)}</small>
      <span class="sv-char-kit"><img src="${sprites.url(w.icon)}" alt="" width="24" height="24"> ${esc(w.name)} · ${esc(c.perk)}</span></span>
    </button>`;
  }).join('');
  $$('[data-char]', host).forEach((b) => b.addEventListener('click', () => {
    saved.character = b.dataset.char;
    persist();
    sound.play('click');
    $$('[data-char]', host).forEach((x) => x.setAttribute('aria-pressed', x === b));
  }));
}

// ---------------------------------------------------------------------------
// Questions: the picked sets' JSON, fetched once each
// ---------------------------------------------------------------------------
let index = null;
const cache = new Map();
const getJson = (rel) => {
  if (!cache.has(rel)) cache.set(rel, fetch(new URL(rel, DATA)).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }));
  return cache.get(rel);
};

async function loadQuestions(keys) {
  index = index || await getJson('index.json');
  const groups = await Promise.all(keys.map(async (key) => {
    const [c, s] = key.split('/');
    const course = index.courses.find((x) => x.slug === c);
    const set = course?.sets.find((x) => x.slug === s);
    if (!set) return [];
    const qs = await getJson(`${key}.json`);
    return qs.map((q, k) => ({
      ...q,
      id: `${key}/${k}`,
      course,
      set,
      review: q.s != null && course.sections[q.s] ? { title: course.sections[q.s][0], url: course.sections[q.s][1] } : course.outline,
    }));
  }));
  return groups.flat();
}

// ---------------------------------------------------------------------------
// A run
// ---------------------------------------------------------------------------
async function begin(only = null) {
  const keysWanted = only
    ? [...new Set([...only].map((id) => id.split('/').slice(0, 2).join('/')))]
    : boxes.filter((b) => b.checked).map((b) => b.value);
  if (!keysWanted.length) return;
  show('loading');
  $('#load-status').textContent = 'Gathering your questions…';
  let questions;
  try {
    const all = await loadQuestions(keysWanted);
    questions = selectQuestions(all, { missedOnly: !only && saved.missedOnly, isMissed: (id) => !!saved.missed[id], only });
  } catch {
    $('#load-status').textContent = "Couldn't load those sets. Check your connection and try again.";
    setTimeout(() => show('setup'), 2400);
    return;
  }
  if (!questions.length) { show('setup'); return; }
  warmRefs(new Set(questions.map((q) => q.course.slug)));
  wake();
  run = {
    deck: new QuestionDeck(questions, { shuffled: saved.shuffled }),
    pool: questions.length,
    results: [],
    streak: 0,
    bestStreak: 0,
    pacing: saved.pacing,
    only,
    keys: keysWanted,
    finished: false,
  };
  world.reset({ character: saved.character, endless: saved.endless });
  world.resize();
  sound.setCorruption(0);
  sound.startMusic();
  show('play');
  hudVersion = -1;
  paused = false;
  modal = null;
  $('#hint').hidden = false;
  clearTimeout(begin.hint);
  begin.hint = setTimeout(() => { $('#hint').hidden = true; }, 7000);
}

let paused = false;
function pause(on) {
  if (screen !== 'play' && screen !== 'pause') return;
  if (modal) return;
  paused = on;
  show(on ? 'pause' : 'play');
  if (on) renderPause();
  sound.duck(on);
  keys.clear();
}

// ---------------------------------------------------------------------------
// The level-up question
// ---------------------------------------------------------------------------
let ask = null; // { q, order, picked, stage, offers, out: Set }

function openQuestion() {
  const q = run.deck.next();
  modal = 'ask';
  keys.clear();
  sound.duck(true);
  if (!q) { ask = { q: null, stage: 'cards', right: true, opened: performance.now() }; $('#ask-question').hidden = true; $('#ask-verdict').hidden = true; $('#ask').hidden = false; showCards(); return; }
  ask = { q, order: q.order.slice(), picked: null, stage: 'question', out: new Set(), opened: performance.now() };
  const dlg = $('#ask');
  $('#ask-kicker').textContent = `Level ${world.player.level} · Answer to claim your boon`;
  const card = $('#ask-card');
  card.style.setProperty('--accent', q.course.accent);
  // The reference popup reads the card's course; a course without an index gets no Look up button.
  card.dataset.course = q.course.slug;
  if (!REF_COURSES.has(q.course.slug)) card.querySelector('.rx-look')?.remove();
  const pre = q.pre ? `<details class="sv-pre"><summary>Show the question this varies</summary>${paras(q.pre)}</details>` : '';
  $('#ask-source').innerHTML = `${esc(q.course.title)} · ${esc(q.set.title)}${q.n != null ? ` · Q${esc(q.n)}<span class="qn" hidden>Q${esc(q.n)}</span>` : ''}`;
  $('#ask-question').innerHTML = `${q.topic ? `<p class="sv-topic">${esc(q.topic)}</p>` : ''}${pre}<div class="sv-stem stem">${paras(q.q)}</div>
    <ol class="sv-choices">${ask.order.map((orig, i) => `<li class="sv-row"><button type="button" class="sv-opt" data-orig="${orig}"><b>${LETTERS[i]}</b><span>${esc(q.o[orig])}</span></button><button type="button" class="sv-x" data-strike="${orig}" aria-pressed="false" aria-label="Cross out choice ${LETTERS[i]}" title="Cross out">${STRIKE}</button></li>`).join('')}</ol>
    <p class="sv-keys hint">Keys <kbd>1</kbd>–<kbd>${ask.order.length}</kbd> or <kbd>A</kbd>–<kbd>${LETTERS[ask.order.length - 1]}</kbd> to answer</p>`;
  $$('.sv-opt', dlg).forEach((b) => b.addEventListener('click', () => answer(+b.dataset.orig)));
  $$('[data-strike]', dlg).forEach((x) => x.addEventListener('click', () => strike(+x.dataset.strike)));
  $('#ask-question').hidden = false;
  $('#ask-verdict').hidden = true;
  $('#ask-cards').hidden = true;
  $('#ask-continue').hidden = true;
  dlg.hidden = false;
  document.body.classList.add('is-asking');
  $('#ask-card').scrollTop = 0;
  // Focus the card, not choice A, so a stray Space or Enter can't answer.
  setTimeout(() => $('#ask-card').focus({ preventScroll: true }), 30);
}

function strike(orig) {
  if (!ask || ask.picked !== null) return;
  if (ask.out.has(orig)) ask.out.delete(orig); else ask.out.add(orig);
  const on = ask.out.has(orig);
  $(`.sv-opt[data-orig="${orig}"]`).classList.toggle('out', on);
  $(`[data-strike="${orig}"]`).setAttribute('aria-pressed', on);
}

function answer(orig) {
  if (!ask || ask.picked !== null || ask.stage !== 'question') return;
  const q = ask.q;
  ask.picked = orig;
  const right = orig === q.a;
  ask.right = right;
  if (right) delete saved.missed[q.id]; else saved.missed[q.id] = 1;
  persist();
  record({ set: `${q.course.slug}/${q.set.slug}`, n: q.n, topic: q.topic, right, from: 'survivors' }); // Your stats
  run.results.push({ q, picked: orig, right, order: ask.order.slice(), level: world.player.level, time: world.time });
  if (right) { run.streak++; run.bestStreak = Math.max(run.bestStreak, run.streak); } else run.streak = 0;
  $$('.sv-opt').forEach((b) => {
    b.disabled = true;
    const o = +b.dataset.orig;
    if (o === q.a && (right || run.pacing !== 'end')) b.classList.add('right');
    else if (o === orig) b.classList.add('wrong');
  });
  $$('.sv-x').forEach((x) => { x.hidden = true; });
  $('.sv-keys').hidden = true;
  sound.play(right ? 'right' : 'wrong');

  const v = $('#ask-verdict');
  const letter = LETTERS[ask.order.indexOf(q.a)];
  const why = explain(q, ask.order, orig);
  if (right) {
    const streak = run.streak > 1 ? ` <span class="sv-streak-chip">${run.streak} in a row</span>` : '';
    v.className = 'sv-verdict sq-why ok';
    v.innerHTML = `<p class="sv-verdict-line" tabindex="-1">Correct.${streak}</p>${run.pacing === 'end' ? '' : `<details class="sv-why"${run.pacing === 'always' ? ' open' : ''}><summary>Why?</summary>${why}</details>`}`;
    v.hidden = false;
    showCards();
  } else {
    v.className = 'sv-verdict sq-why no';
    v.innerHTML = run.pacing === 'end'
      ? '<p class="sv-verdict-line" tabindex="-1">Not quite. You\'ll see the answer in the review after the run.</p>'
      : `<p class="sv-verdict-line" tabindex="-1">Not quite. The answer is ${letter}.</p><div class="sv-why sv-why-open">${why}</div>`;
    v.hidden = false;
    ask.stage = 'review';
    $('#ask-kicker').textContent = `Level ${world.player.level} · The crypt takes its due`;
    const go = $('#ask-continue');
    go.textContent = 'Face the corruption';
    go.hidden = false;
    setTimeout(() => go.focus({ preventScroll: true }), 30);
  }
}

/** The explanation block: per-choice rationales, the explanation, and the review links. */
function explain(q, order, picked) {
  let html = '';
  if (q.oe) {
    html += order.map((k, i) => (q.oe[k] ? `<p class="sv-rat${k === q.a ? ' key' : ''}${k === picked && k !== q.a ? ' picked' : ''}"><b>${LETTERS[i]}</b> <span>${esc(q.oe[k])}</span></p>` : '')).join('');
  }
  if (q.e) html += `<div class="sv-explain">${paras(q.e)}</div>`;
  const links = [];
  if (q.review) links.push(`<a href="${esc(ROOT + q.review.url)}" target="_blank" rel="noopener">Review: ${esc(q.review.title)}</a>`);
  links.push(`<a href="${esc(ROOT + q.set.url)}" target="_blank" rel="noopener">Open ${esc(q.set.title)}</a>`);
  return `${html}<p class="sv-links">${links.join('')}</p>`;
}

// ---------------------------------------------------------------------------
// Cards: three boons for a right answer, three corruptions for a wrong one
// ---------------------------------------------------------------------------
function cardFor(o) {
  const b = world.build;
  switch (o.kind) {
    case 'weapon': {
      const def = WEAPONS[o.id];
      return { icon: def.icon, title: def.name, tag: o.level === 1 ? 'New weapon' : `Level ${o.level}${o.level === WEAPON_MAX ? ' · max' : ''}`, text: o.level === 1 ? def.desc : levelText(o.id, o.level) };
    }
    case 'passive': {
      const def = PASSIVES[o.id];
      return { icon: def.icon, title: def.name, tag: o.level === 1 ? 'New relic' : `Level ${o.level}${o.level === def.max ? ' · max' : ''}`, text: def.desc };
    }
    case 'evolve': {
      const def = WEAPONS[o.id];
      return { icon: def.icon, title: def.name, tag: `Evolution of ${WEAPONS[o.from].name}`, text: def.desc, cls: 'evolve' };
    }
    case 'purify': {
      const c = CORRUPTIONS[o.id];
      return { icon: 'purify', title: 'Purify', tag: `${run.streak} in a row`, text: `Cleanse one stack of ${c.name} (${b.corruptions[o.id]} carried).`, cls: 'purify' };
    }
    case 'corruption': {
      const c = CORRUPTIONS[o.id];
      return { icon: c.icon, variant: 'taint', title: c.name, tag: o.level > 1 ? `Corruption · stack ${o.level}` : 'Corruption', text: c.desc, cls: 'cursed' };
    }
    case 'toll': return { icon: 'c-tithe', variant: 'taint', title: 'The Toll', tag: 'Corruption', text: 'Every curse is already upon you. Lose a third of your health instead.', cls: 'cursed' };
    case 'heal': return { icon: 'roast', title: 'Roast', tag: 'Restore', text: 'Heal 40 HP.' };
    case 'gold': return { icon: 'gold-2', title: 'Purse of gold', tag: 'Treasure', text: '+40 gold.' };
    default: return { icon: 'gold-1', title: '?', tag: '', text: '' };
  }
}

function showCards() {
  const right = ask.right;
  ask.stage = 'cards';
  ask.offers = right ? rollUpgrades(world.build, Math.random, { streak: run.streak }) : rollCorruptions(world.build);
  const host = $('#ask-cards');
  host.className = `sv-cards${right ? '' : ' cursed'}`;
  host.innerHTML = `<p class="sv-cards-head">${right ? 'Choose a boon' : 'A wrong answer corrupts you · choose your curse'}</p>
    <div class="sv-cards-row">${ask.offers.map((o, i) => {
    const c = cardFor(o);
    return `<button type="button" class="sv-pick ${c.cls || ''}" data-pick="${i}"><span class="sv-pick-key">${i + 1}</span>
      <span class="sv-pick-art"><img src="${sprites.url(c.icon, c.variant)}" alt="" width="48" height="48"></span>
      <span class="sv-pick-tag">${esc(c.tag)}</span><strong>${esc(c.title)}</strong><span class="sv-pick-text">${esc(c.text)}</span></button>`;
  }).join('')}</div>`;
  $$('[data-pick]', host).forEach((b) => b.addEventListener('click', () => choose(+b.dataset.pick)));
  host.hidden = false;
  $('#ask-continue').hidden = true;
  if (!right) {
    $('#ask-question').hidden = true;
    $('#ask-card').scrollTop = 0;
  } else host.scrollIntoView?.({ block: 'nearest' });
  setTimeout(() => $('[data-pick]', host)?.focus({ preventScroll: true }), 30);
}

function choose(i) {
  if (!ask || ask.stage !== 'cards') return;
  const o = ask.offers[i];
  if (!o) return;
  ask.stage = 'done';
  const p = world.player;
  switch (o.kind) {
    case 'heal': world.heal(40); sound.play('heal'); break;
    case 'gold': world.addGold(40); sound.play('gold'); break;
    case 'toll': p.hp = Math.max(1, p.hp - world.stats.maxHp / 3); sound.play('corrupt'); break;
    default: applyOffer(world.build, o); world.syncBuild();
  }
  if (o.kind === 'corruption' || o.kind === 'toll') {
    sound.play('corrupt');
    flash('corrupt');
    banner(o.kind === 'toll' ? 'The toll is paid in blood' : `Corrupted · ${CORRUPTIONS[o.id].name}`, 'bad');
  } else if (o.kind === 'purify') {
    sound.play('purify');
    flash('purify');
    banner(`Purified · ${CORRUPTIONS[o.id].name} loosens its grip`, 'good');
  } else if (o.kind === 'evolve') {
    sound.play('chest');
    banner(`${WEAPONS[o.id].name} awakens`, 'good');
  } else sound.play('pick');
  sound.setCorruption(corruptionLevel(world.build));
  closeAsk();
  world.levelResolved();
  world.clearAround(26);
}

function closeAsk() {
  closeRefs();
  $('#ask').hidden = true;
  document.body.classList.remove('is-asking');
  modal = null;
  ask = null;
  sound.duck(false);
  hudVersion = -1;
  canvas.focus?.({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Chests: a boss's reliquary levels what you carry, or evolves a weapon that's ready
// ---------------------------------------------------------------------------
function openChest() {
  modal = 'chest';
  keys.clear();
  sound.duck(true);
  const b = world.build;
  const roll = Math.random();
  const n = roll < 0.1 ? 5 : roll < 0.35 ? 3 : 1;
  const got = [];
  for (let i = 0; i < n; i++) {
    const evo = eligibleEvolutions(b)[0];
    let o = evo;
    if (!o) {
      const owned = rollUpgrades(b, Math.random, { count: 6 }).filter((x) => (x.kind === 'weapon' || x.kind === 'passive') && x.level > 1);
      o = owned[0] || { kind: 'gold' };
    }
    if (o.kind === 'gold') world.addGold(30); else { applyOffer(b, o); world.syncBuild(); }
    got.push(o);
  }
  const gold = 15 + Math.floor(Math.random() * 30);
  world.addGold(gold);
  $('#chest-list').innerHTML = got.map((o) => {
    const c = cardFor(o);
    return `<li class="${c.cls || ''}"><img src="${sprites.url(c.icon)}" alt="" width="40" height="40"><span><strong>${esc(c.title)}</strong><small>${esc(c.tag)}${o.kind === 'gold' ? '' : ` · ${esc(c.text)}`}</small></span></li>`;
  }).join('') + `<li><img src="${sprites.url('gold-2')}" alt="" width="40" height="40"><span><strong>+${gold} gold</strong><small>Treasure</small></span></li>`;
  $('#chest-title').textContent = n >= 5 ? 'A reliquary overflowing' : n >= 3 ? 'A generous reliquary' : 'A reliquary';
  $('#chest').hidden = false;
  document.body.classList.add('is-asking');
  sound.play('chest');
  setTimeout(() => $('#chest-go').focus({ preventScroll: true }), 30);
}

function closeChest() {
  if (modal !== 'chest') return;
  $('#chest').hidden = true;
  document.body.classList.remove('is-asking');
  modal = null;
  sound.duck(false);
  hudVersion = -1;
  world.chestResolved();
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
let hudVersion = -1;
let lastHud = {};
function hud() {
  const p = world.player;
  const need = world.xpNeeded;
  const xp = $('#hud-xp');
  xp.style.setProperty('--p', Math.min(1, p.xp / need));
  setText('#hud-level', `Lv ${p.level}`);
  setText('#hud-time', fmtTime(world.time));
  setText('#hud-kills', world.kills.toLocaleString('en-US'));
  setText('#hud-gold', world.gold.toLocaleString('en-US'));
  setText('#hud-hp', `${Math.ceil(p.hp)} / ${world.stats.maxHp}`);
  setText('#hud-streak', run.streak >= 2 ? `${run.streak} in a row` : '');
  const boss = world.bosses.find((e) => !e.dead);
  const bossEl = $('#boss');
  bossEl.hidden = !boss;
  if (boss) {
    setText('#boss-name', boss.def.name);
    $('#boss-bar').style.transform = `scaleX(${Math.max(0, boss.hp / boss.maxHp)})`;
  }
  const v = JSON.stringify([world.build.weapons, world.build.passives, world.build.corruptions]);
  if (v !== hudVersion) {
    hudVersion = v;
    renderSlots();
  }
}
function setText(sel, text) {
  if (lastHud[sel] === text) return;
  lastHud[sel] = text;
  $(sel).textContent = text;
}

function renderSlots() {
  const b = world.build;
  $('#hud-weapons').innerHTML = b.weapons.map((w) => {
    const def = WEAPONS[w.id];
    return `<li title="${esc(def.name)}${def.evolved ? '' : ` · level ${w.level}`}"><img src="${sprites.url(def.icon)}" alt="${esc(def.name)}"><b>${def.evolved ? '★' : w.level}</b></li>`;
  }).join('');
  $('#hud-passives').innerHTML = Object.entries(b.passives).map(([id, lv]) => {
    const def = PASSIVES[id];
    return `<li title="${esc(def.name)} · level ${lv}: ${esc(def.desc)}"><img src="${sprites.url(def.icon)}" alt="${esc(def.name)}"><b>${lv}</b></li>`;
  }).join('');
  const cs = Object.entries(b.corruptions);
  const tray = $('#hud-corruptions');
  tray.hidden = !cs.length;
  $('ul', tray).innerHTML = cs.map(([id, n]) => {
    const c = CORRUPTIONS[id];
    return `<li title="${esc(c.name)} ×${n}: ${esc(c.desc)} per stack"><img src="${sprites.url(c.icon, 'taint')}" alt="${esc(c.name)}"><b>${n}</b><span class="sr-only">${esc(c.name)}, ${n} ${n === 1 ? 'stack' : 'stacks'}: ${esc(c.desc)}</span></li>`;
  }).join('');
  document.body.dataset.corruption = Math.round(corruptionLevel(b) * 6);
}

let bannerT = 0;
function banner(text, tone = '') {
  const el = $('#banner');
  el.textContent = text;
  el.dataset.tone = tone;
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
  clearTimeout(bannerT);
  bannerT = setTimeout(() => el.classList.remove('on'), 3200);
}

function flash(kind) {
  const el = $('.sv-veil');
  el.dataset.flash = kind;
  setTimeout(() => { if (el.dataset.flash === kind) delete el.dataset.flash; }, 700);
}

// ---------------------------------------------------------------------------
// Pause and the end of a run
// ---------------------------------------------------------------------------
function buildList(b, withLevels = true) {
  const weapons = b.weapons.map((w) => {
    const def = WEAPONS[w.id];
    const dmg = Math.round(world.damageBy[w.id] || 0);
    return `<li><img src="${sprites.url(def.icon)}" alt=""><span><strong>${esc(def.name)}</strong><small>${def.evolved ? 'Evolved' : `Level ${w.level}`}${withLevels && dmg ? ` · ${dmg.toLocaleString('en-US')} damage` : ''}</small></span></li>`;
  }).join('');
  const passives = Object.entries(b.passives).map(([id, lv]) => `<li><img src="${sprites.url(PASSIVES[id].icon)}" alt=""><span><strong>${esc(PASSIVES[id].name)}</strong><small>Level ${lv} · ${esc(PASSIVES[id].desc)}</small></span></li>`).join('');
  return { weapons, passives };
}

function corruptionList(map, label = 'stack') {
  return Object.entries(map).map(([id, n]) => `<li class="cursed"><img src="${sprites.url(CORRUPTIONS[id].icon, 'taint')}" alt=""><span><strong>${esc(CORRUPTIONS[id].name)}</strong><small>×${n} ${n === 1 ? label : `${label}s`} · ${esc(CORRUPTIONS[id].desc)} each</small></span></li>`).join('');
}

function renderPause() {
  const b = world.build;
  const { weapons, passives } = buildList(b);
  const s = world.stats;
  const pct = (v) => `${v >= 1 ? '+' : '−'}${Math.abs(Math.round((v - 1) * 100))}%`;
  $('#pause-build').innerHTML = `<div><h3>Weapons</h3><ul class="sv-list">${weapons}</ul></div>
    <div><h3>Relics</h3><ul class="sv-list">${passives || '<li class="sv-none">None yet</li>'}</ul></div>
    <div><h3>Corruptions</h3><ul class="sv-list">${corruptionList(b.corruptions) || '<li class="sv-none">None. Your soul is clean.</li>'}</ul></div>
    <div><h3>Stats</h3><dl class="sv-stats-mini">
      <dt>Damage</dt><dd>${pct(s.might)}</dd><dt>Cooldown</dt><dd>${pct(s.cooldown)}</dd><dt>Area</dt><dd>${pct(s.area)}</dd>
      <dt>Move speed</dt><dd>${pct(s.move)}</dd><dt>Pickup radius</dt><dd>${pct(s.magnet)}</dd><dt>Max HP</dt><dd>${s.maxHp}</dd>
      <dt>Armor</dt><dd>${s.armor}</dd><dt>Damage taken</dt><dd>${pct(s.damageTaken)}</dd><dt>Enemy speed</dt><dd>${pct(s.enemySpeed)}</dd></dl></div>`;
  $('#pause-sub').textContent = `${fmtTime(world.time)} survived · level ${world.player.level} · ${world.kills.toLocaleString('en-US')} destroyed`;
}

function finish(how) {
  if (!run || run.finished) return;
  run.finished = true;
  paused = true;
  modal = null;
  $('#ask').hidden = true;
  $('#chest').hidden = true;
  document.body.classList.remove('is-asking');
  sound.duck(true);
  const results = run.results;
  const right = results.filter((r) => r.right).length;
  const t = world.time;
  const best = saved.best || { time: 0, level: 0, kills: 0 };
  const isBest = t > best.time;
  saved.best = { time: Math.max(best.time, t), level: Math.max(best.level, world.player.level), kills: Math.max(best.kills, world.kills) };
  persist();

  const titles = {
    dawn: ['Dawn breaks.', `You held the crypt for ${RUN_SECONDS / 60} minutes. The dead return to their graves.`],
    fallen: ['The crypt claims you.', 'Your light goes out among the dead. Review what you missed and rise again.'],
    quit: ['You leave the crypt.', 'The run is over. Here is how it went.'],
  };
  const [title, lede] = titles[how] || titles.quit;
  $('#summary-title').textContent = title;
  $('#summary-lede').textContent = `${lede}${isBest && t > 30 ? ' A new longest survival.' : ''}`;
  document.body.dataset.outcome = how;
  const stat = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  $('#summary-stats').innerHTML = [
    stat('Survived', fmtTime(t)),
    stat('Level', world.player.level),
    stat('Destroyed', world.kills.toLocaleString('en-US')),
    stat('Accuracy', results.length ? `${Math.round((right / results.length) * 100)}% <small>${right} / ${results.length}</small>` : '—'),
    stat('Peak streak', run.bestStreak),
    stat('Gold', world.gold.toLocaleString('en-US')),
    stat('Bosses slain', world.bossesSlain),
  ].join('');
  const b = world.build;
  const { weapons, passives } = buildList(b);
  $('#summary-build').innerHTML = `<div><h3>Your build</h3><ul class="sv-list">${weapons}${passives}</ul></div>
    <div><h3>Corruptions endured</h3><ul class="sv-list">${corruptionList(b.taken, 'time') || '<li class="sv-none">None. Every answer held.</li>'}</ul>${b.purified ? `<p class="sv-note">${b.purified} purified by answer streaks.</p>` : ''}</div>`;

  // Missed questions, once each, in the order they were asked.
  const seen = new Set();
  const missed = results.filter((r) => !r.right && !seen.has(r.q.id) && seen.add(r.q.id));
  run.missedIds = new Set(missed.map((r) => r.q.id));
  const m = $('#summary-missed');
  m.innerHTML = missed.length
    ? `<h3>Missed questions <span>${missed.length}</span></h3><ol class="sv-review">${missed.map((r) => {
      const q = r.q;
      const L = (k) => LETTERS[r.order.indexOf(k)];
      return `<li class="sv-qcard" data-course="${esc(q.course.slug)}" style="--accent:${esc(q.course.accent)}"><p class="sv-review-src meta">${esc(q.course.title)} · ${esc(q.set.title)}${q.n != null ? ` · Q${q.n}` : ''}</p>
        ${q.pre ? `<details class="sv-pre"><summary>Show the question this varies</summary>${paras(q.pre)}</details>` : ''}
        <details class="sv-review-q"><summary>${esc(q.q.split(/\n{2,}/).pop().slice(0, 220))}${q.q.length > 220 ? '…' : ''}</summary><div class="stem">${paras(q.q)}</div></details>
        <p class="sv-ans no"><b>${L(r.picked)}</b> Your answer: ${esc(q.o[r.picked])}</p>
        <p class="sv-ans ok"><b>${L(q.a)}</b> Correct: ${esc(q.o[q.a])}</p>
        ${explain(q, r.order, r.picked)}</li>`;
    }).join('')}</ol>`
    : results.length ? '<p class="sv-note">No missed questions. Flawless.</p>' : '';
  $('#retry-missed').hidden = !missed.length;
  show('summary');
  $('#summary').scrollTop = 0;
  setTimeout(() => $('#summary .sv-btn-primary:not([hidden])')?.focus({ preventScroll: true }), 50);
}

// ---------------------------------------------------------------------------
// Input: keys, and a floating joystick for touch (or a mouse drag)
// ---------------------------------------------------------------------------
const MOVE = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] };
const stick = { id: null, x: 0, y: 0, dx: 0, dy: 0 };

function steer() {
  let x = 0, y = 0;
  for (const k of keys) { const v = MOVE[k]; if (v) { x += v[0]; y += v[1]; } }
  if (stick.id !== null) { x += stick.dx; y += stick.dy; }
  world.input.x = Math.max(-1, Math.min(1, x));
  world.input.y = Math.max(-1, Math.min(1, y));
}

addEventListener('keydown', (e) => {
  wake();
  const k = e.key.toLowerCase();
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (k === 'escape' && refsPanel()) { e.preventDefault(); closeRefs(); return; }
  if (modal === 'ask' && ask) {
    // A key held down for movement when the question opens must not answer it.
    if (e.repeat || performance.now() - ask.opened < 350) { if (k.length === 1 || k === 'enter') e.preventDefault(); return; }
    if (ask.stage === 'question') {
      const n = /^[1-6]$/.test(k) ? +k - 1 : 'abcdef'.indexOf(k);
      if (n >= 0 && n < ask.order.length) { e.preventDefault(); answer(ask.order[n]); }
    } else if (ask.stage === 'review' && (k === 'enter' || k === ' ')) { e.preventDefault(); showCards(); } else if (ask.stage === 'cards' && /^[1-3]$/.test(k)) { e.preventDefault(); choose(+k - 1); }
    return;
  }
  if (modal === 'chest') { if (!e.repeat && (k === 'enter' || k === ' ' || k === 'escape')) { e.preventDefault(); closeChest(); } return; }
  if (screen === 'play' || screen === 'pause') {
    if (k === 'escape' || k === 'p') { e.preventDefault(); pause(screen === 'play'); return; }
    if (screen === 'play' && MOVE[k]) { e.preventDefault(); keys.add(k); steer(); }
  }
});
addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); steer(); });
addEventListener('blur', () => { keys.clear(); steer(); if (screen === 'play' && !modal && run && !run.finished) pause(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'play' && !modal && run && !run.finished) pause(true); });

const stickEl = $('#stick');
canvas.addEventListener('pointerdown', (e) => {
  wake();
  if (screen !== 'play' || modal || stick.id !== null) return;
  stick.id = e.pointerId;
  stick.x = e.clientX; stick.y = e.clientY;
  stick.dx = 0; stick.dy = 0;
  canvas.setPointerCapture?.(e.pointerId);
  stickEl.hidden = false;
  stickEl.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  stickEl.firstElementChild.style.transform = 'translate(-50%, -50%)';
  e.preventDefault();
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== stick.id) return;
  const R = 44;
  let dx = e.clientX - stick.x, dy = e.clientY - stick.y;
  const d = Math.hypot(dx, dy);
  if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
  stick.dx = dx / R; stick.dy = dy / R;
  if (Math.hypot(stick.dx, stick.dy) < 0.15) { stick.dx = 0; stick.dy = 0; }
  stickEl.firstElementChild.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  steer();
});
const release = (e) => {
  if (e.pointerId !== stick.id) return;
  stick.id = null; stick.dx = 0; stick.dy = 0;
  stickEl.hidden = true;
  steer();
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

// The first gesture starts the sound (browsers won't before one).
function wake() {
  if (sound.ready) { sound.init(); return; }
  sound.init();
  syncSound();
  if (run && !run.finished) sound.startMusic();
}
addEventListener('pointerdown', wake, { capture: true });

function syncSound() {
  $$('[data-sound]').forEach((b) => {
    b.setAttribute('aria-pressed', !sound.muted);
    b.setAttribute('aria-label', sound.muted ? 'Sound off' : 'Sound on');
    b.dataset.muted = sound.muted;
    const label = $('span', b);
    if (label) label.textContent = sound.muted ? 'Sound off' : 'Sound on';
  });
}
$$('[data-sound]').forEach((b) => b.addEventListener('click', () => {
  wake();
  sound.setMuted(!sound.muted);
  saved.muted = sound.muted;
  persist();
  syncSound();
}));

// Buttons
$('#pause-btn').addEventListener('click', () => pause(true));
$('#resume').addEventListener('click', () => pause(false));
$('#quit').addEventListener('click', () => { pause(false); finish('quit'); });
$('#ask-continue').addEventListener('click', () => { if (ask?.stage === 'review') showCards(); });
$('#chest-go').addEventListener('click', closeChest);
$('#retry-missed').addEventListener('click', () => { closeRefs(); begin(run.missedIds); });
$('#new-run').addEventListener('click', () => { closeRefs(); begin(run.only); });
$('#change-sets').addEventListener('click', () => {
  closeRefs();
  run = null;
  world.reset({ demo: true, character: saved.character });
  sound.duck(false);
  sound.setCorruption(0);
  show('setup');
  syncSetup();
});
addEventListener('resize', () => world.resize());

// ---------------------------------------------------------------------------
// The loop: the world runs behind the setup screen as a demo, and for real during a run.
// ---------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const live = screen === 'play' && !paused && !modal;
  if (live || screen === 'setup' || screen === 'loading') world.update(dt);
  else if (run?.finished) world.update(dt * 0.3);
  world.render();
  if (run && (screen === 'play' || screen === 'pause')) hud();
  requestAnimationFrame(frame);
}

async function boot() {
  initSetup();
  syncSound();
  try {
    const pack = await (await fetch(new URL('./pack/pack.json', import.meta.url))).json();
    sound.setPack(pack);
    await sprites.load(pack);
  } catch {
    $('#begin-note').textContent = 'The game art could not be loaded. Check your connection and reload.';
  }
  world.setSprites(sprites);
  renderCharacters();
  document.body.classList.add('is-live');
  requestAnimationFrame((t) => { last = t; frame(t); });
}

// ?debug exposes the internals for testing and tinkering.
if (new URLSearchParams(location.search).has('debug')) {
  window.survivors = { world, sound, sprites, get run() { return run; }, get ask() { return ask; }, begin, answer, choose, finish };
}

boot();
