// Sanctum Run: screens, the question gates, scoring and corruption. engine.js runs the world.

import { loadPack, preload, imageUrl, audio } from './assets.js';
import { Engine, artFor } from './engine.js';
import { loadIndex, buildSession, store } from './quiz.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROOT = document.documentElement.dataset.root || '../';
const site = (url) => ROOT + url;

const CHARACTERS = [
  { id: 'socrates', name: 'Socrates', title: 'The Defiant Questioner' },
  { id: 'plato', name: 'Plato', title: 'The Architect of Ideals' },
  { id: 'aristotle', name: 'Aristotle', title: 'The Relentless Seeker' },
];
const SPACING = { frequent: 70, standard: 105, sparse: 150 };
const LETTERS = 'ABCDEF';

const canvas = $('#world');
const engine = new Engine(canvas, {
  onGate: (gate) => openGate(gate),
  onFallen: () => showFallen(),
  onRealm: (realm) => setRealm(realm),
  onEvent: (e) => hudPulse(e),
});

let index = null;
let pack = null;
let screen = 'title';
let paused = false;
let run = null; // the current run: questions, cursor, results
const settings = {
  courses: new Set(), sets: {}, character: 'socrates', spacing: 'standard', pace: 'standard', shuffled: true, missedOnly: false,
  ...store.settings.base,
};
settings.courses = new Set(store.settings.courses || []);
settings.sets = store.settings.sets || {};

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------
function show(name) {
  screen = name;
  $$('.g-screen').forEach((s) => { s.hidden = s.id !== name; });
  $('.g-hud').hidden = !['play', 'pause'].includes(name);
  document.body.dataset.screen = name;
  const first = $(`#${name} [autofocus], #${name} .g-btn-primary`);
  first?.focus({ preventScroll: true });
}

function setRealm(realm) {
  const changed = document.body.dataset.realm !== realm;
  document.body.dataset.realm = realm;
  if (!run || run.finished) return;
  audio.mix(realm === 'corrupt' ? { 'corrupt-music-loop': 0.8 } : { 'divine-music-loop': 0.7 }, 2.4);
  if (changed) setTimeout(() => engine.say(realm === 'corrupt' ? 'The sanctum falls · laurels count double' : 'The light returns', realm === 'corrupt' ? '#ff9aa4' : '#f9dfa0'), 700);
}

// ---------------------------------------------------------------------------
// Title: the world runs itself behind the menu.
// ---------------------------------------------------------------------------
async function boot() {
  $('#best').textContent = store.best ? `Best score ${store.best.toLocaleString()}` : '';
  try {
    [index, pack] = await Promise.all([loadIndex(), loadPack()]);
  } catch {
    $('#title-status').textContent = 'The game data could not be loaded. Check your connection and reload.';
    return;
  }
  const total = index.courses.reduce((n, c) => n + c.sets.reduce((m, s) => m + s.count, 0), 0);
  $('#title-status').textContent = `${total.toLocaleString()} questions from ${index.courses.length} courses`;
  $('#start').disabled = false;

  const params = new URLSearchParams(location.search);
  const wanted = params.get('course');
  if (wanted && index.courses.some((c) => c.slug === wanted)) settings.courses = new Set([wanted]);
  settings.courses = new Set([...settings.courses].filter((c) => index.courses.some((x) => x.slug === c)));
  if (!settings.courses.size) settings.courses.add(index.courses[0].slug);
  buildSetup();
  if (wanted) show('setup');

  const art = await preload(artFor('socrates'));
  engine.setArt(art, pack.palettes);
  engine.reset({ character: 'socrates', demo: true });
  document.body.classList.add('is-live');
  loop.last = performance.now();
  requestAnimationFrame(loop);
}

function loop(now) {
  const dt = (now - loop.last) / 1000;
  loop.last = now;
  if (!paused) engine.update(dt);
  engine.render();
  if (run) hud();
  requestAnimationFrame(loop);
}

// The first tap anywhere starts the sound (browsers won't before a gesture).
const wake = () => {
  if (audio.ready) return;
  audio.init();
  audio.setMuted(!!store.settings.muted);
  syncSound();
  audio.mix(run ? { 'divine-music-loop': 0.7 } : { 'menu-music': 0.6 }, 1.5);
  audio.prefetch(['jump', 'land', 'collect-laurel', 'damage', 'divine-slide', 'divine-turn-whoosh', 'divine-footsteps', 'divine-ui-click', 'enter-corrupt', 'enter-divine']);
};
addEventListener('pointerdown', wake, { capture: true });
addEventListener('keydown', wake, { capture: true });

function click() { audio.play(`${document.body.dataset.realm || 'divine'}-ui-click`, { volume: 0.5 }); }

// ---------------------------------------------------------------------------
// Setup: courses, their practice sets, the runner, and how the run feels.
// ---------------------------------------------------------------------------
function totalPicked() {
  let n = 0;
  for (const c of index.courses) {
    if (!settings.courses.has(c.slug)) continue;
    for (const s of c.sets) if (setOn(c.slug, s.slug)) n += settings.missedOnly ? store.missedIn(c.slug, s.slug) : s.count;
  }
  return n;
}
const setOn = (c, s) => settings.sets[c]?.[s] !== false;

function buildSetup() {
  const courses = $('#courses');
  courses.innerHTML = index.courses.map((c) => {
    const n = c.sets.reduce((m, s) => m + s.count, 0);
    const g = c.guardian || 'michael';
    return `<button type="button" class="g-course" data-course="${esc(c.slug)}" aria-pressed="${settings.courses.has(c.slug)}" style="--accent:${esc(c.accent)}">
      <span class="g-course-art" style="--d:url('${imageUrl(`divine-guardian-${g}`)}');--c:url('${imageUrl(`corrupt-guardian-${g}`)}')"></span>
      <span class="g-course-text"><strong>${esc(c.title)}</strong><small>${c.sets.length} ${c.sets.length === 1 ? 'set' : 'sets'} · ${n.toLocaleString()} questions</small></span>
      <span class="g-check" aria-hidden="true"></span>
    </button>`;
  }).join('');
  $$('[data-course]', courses).forEach((b) => b.addEventListener('click', () => {
    click();
    const slug = b.dataset.course;
    if (settings.courses.has(slug)) settings.courses.delete(slug); else settings.courses.add(slug);
    b.setAttribute('aria-pressed', settings.courses.has(slug));
    renderSets();
  }));

  $('#characters').innerHTML = CHARACTERS.map((ch) => `<button type="button" class="g-char" data-char="${ch.id}" aria-pressed="${settings.character === ch.id}">
      <span class="g-char-art" style="--d:url('${imageUrl(`divine-${ch.id}-moves`)}');--c:url('${imageUrl(`corrupt-${ch.id}-moves`)}')"></span>
      <strong>${ch.name}</strong><small>${ch.title}</small></button>`).join('');
  $$('[data-char]').forEach((b) => b.addEventListener('click', () => {
    click();
    settings.character = b.dataset.char;
    $$('[data-char]').forEach((x) => x.setAttribute('aria-pressed', x === b));
  }));

  for (const [name, key] of [['spacing', 'spacing'], ['pace', 'pace']]) {
    $$(`[data-${name}]`).forEach((b) => {
      b.setAttribute('aria-pressed', settings[key] === b.dataset[name]);
      b.addEventListener('click', () => { click(); settings[key] = b.dataset[name]; $$(`[data-${name}]`).forEach((x) => x.setAttribute('aria-pressed', x === b)); });
    });
  }
  const order = $('#shuffled');
  order.checked = settings.shuffled;
  order.addEventListener('change', () => { settings.shuffled = order.checked; });
  const missed = $('#missed-only');
  missed.checked = settings.missedOnly;
  missed.addEventListener('change', () => { settings.missedOnly = missed.checked; renderSets(); });
  renderSets();
}

function renderSets() {
  const host = $('#sets');
  const chosen = index.courses.filter((c) => settings.courses.has(c.slug));
  host.innerHTML = chosen.length ? chosen.map((c) => `<fieldset class="g-setgroup" style="--accent:${esc(c.accent)}">
      <legend>${esc(c.title)} <button type="button" class="g-link" data-all="${esc(c.slug)}">${c.sets.every((s) => setOn(c.slug, s.slug)) ? 'Clear' : 'Select all'}</button></legend>
      ${c.sets.map((s) => {
        const missed = store.missedIn(c.slug, s.slug);
        return `<label class="g-set"><input type="checkbox" data-set="${esc(c.slug)}/${esc(s.slug)}"${setOn(c.slug, s.slug) ? ' checked' : ''}>
        <span><strong>${esc(s.title)}</strong><small>${s.count} questions${missed ? ` · ${missed} missed before` : ''}</small></span></label>`;
      }).join('')}
    </fieldset>`).join('') : '<p class="g-empty">Choose at least one course above.</p>';
  $$('[data-set]', host).forEach((box) => box.addEventListener('change', () => {
    const [c, s] = box.dataset.set.split('/');
    (settings.sets[c] ||= {})[s] = box.checked;
    renderSets();
  }));
  $$('[data-all]', host).forEach((b) => b.addEventListener('click', () => {
    const c = index.courses.find((x) => x.slug === b.dataset.all);
    const on = !c.sets.every((s) => setOn(c.slug, s.slug));
    settings.sets[c.slug] = Object.fromEntries(c.sets.map((s) => [s.slug, on]));
    renderSets();
  }));
  const n = totalPicked();
  const start = $('#begin');
  start.disabled = !n;
  $('#begin-count').textContent = n ? `${n.toLocaleString()} ${n === 1 ? 'gate' : 'gates'}` : settings.missedOnly ? 'No missed questions here yet' : 'Pick a practice set';
}

function saveSettings() {
  const { courses, sets, ...base } = settings;
  store.setting('base', base);
  store.setting('courses', [...courses]);
  store.setting('sets', sets);
}

// ---------------------------------------------------------------------------
// A run
// ---------------------------------------------------------------------------
async function begin(only = null) {
  saveSettings();
  const picks = [];
  for (const c of index.courses) {
    if (!only && !settings.courses.has(c.slug)) continue;
    for (const s of c.sets) if (only ? [...only].some((id) => id.startsWith(`${c.slug}/${s.slug}/`)) : setOn(c.slug, s.slug)) picks.push({ course: c.slug, set: s.slug });
  }
  show('loading');
  const bar = $('#load-bar');
  bar.style.setProperty('--p', 0);
  let questions;
  try {
    const [qs, art] = await Promise.all([
      buildSession(picks, { shuffled: settings.shuffled, missedOnly: !only && settings.missedOnly, only }),
      preload(artFor(settings.character), (p) => bar.style.setProperty('--p', p)),
    ]);
    questions = qs;
    engine.setArt({ ...engine.img, ...art }, pack.palettes);
  } catch {
    $('#load-status').textContent = 'Something failed to load. Check your connection and try again.';
    return;
  }
  if (!questions.length) { show('setup'); return; }
  run = { questions, cursor: 0, results: [], score: 0, streak: 0, bestStreak: 0, corruption: 0, picks, finished: false };
  // Warm the courses' guardians so the first gate shows its portrait at once.
  preload([...new Set(questions.map((q) => q.course.guardian || 'michael'))].flatMap((g) => [`divine-guardian-${g}`, `corrupt-guardian-${g}`]));
  engine.reset({ character: settings.character, pace: settings.pace, gateSpacing: SPACING[settings.spacing], gates: questions.length });
  document.body.dataset.realm = 'divine';
  document.body.classList.add('is-live');
  wake();
  audio.mix({ 'divine-music-loop': 0.7 }, 1.5);
  audio.prefetch(['damage', 'divine-chaser-growl', 'corrupt-chaser-growl', 'divine-fall', 'corrupt-music-loop', 'collect-wisdom', 'activate-aegis', 'divine-shield-ending']);
  paused = false;
  show('play');
  hint();
}

function hint() {
  const h = $('#controls-hint');
  h.hidden = false;
  clearTimeout(hint.t);
  hint.t = setTimeout(() => { h.hidden = true; }, 6000);
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------
let gateQ = null;
let answered = null;

function openGate() {
  const q = run.questions[run.cursor];
  if (!q) { finish(true); return; }
  gateQ = q;
  answered = null;
  const dlg = $('#gate');
  const g = q.course.guardian || 'michael';
  $('#gate-guardian').style.setProperty('--d', `url('${imageUrl(`divine-guardian-${g}`)}')`);
  $('#gate-guardian').style.setProperty('--c', `url('${imageUrl(`corrupt-guardian-${g}`)}')`);
  $('#gate-guardian').dataset.fallen = engine.realm === 'corrupt';
  $('#gate-kicker').textContent = `Gate ${run.cursor + 1} of ${run.questions.length} · ${q.course.title}`;
  $('#gate-set').textContent = [q.setTitle, q.topic].filter(Boolean).join(' · ');
  const paras = (s) => esc(s).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  // A variation needs the facts it changes: shown outright for "Same facts", else one tap away.
  const pre = q.pre ? (/^same facts/i.test(q.q)
    ? `<blockquote class="g-pre"><span>The original facts</span>${paras(q.pre)}</blockquote>`
    : `<details class="g-pre"><summary>Show the question this varies</summary>${paras(q.pre)}</details>`) : '';
  $('#gate-stem').innerHTML = pre + paras(q.q);
  $('#gate-options').innerHTML = q.order.map((orig, i) => `<li><button type="button" class="g-opt" data-orig="${orig}"><b>${LETTERS[i]}</b><span>${esc(q.o[orig])}</span></button></li>`).join('');
  $$('.g-opt', dlg).forEach((b) => b.addEventListener('click', () => answer(+b.dataset.orig)));
  $('#gate-result').hidden = true;
  $('#gate-continue').hidden = true;
  const ins = $('#gate-insight');
  ins.hidden = !engine.stats.insight;
  ins.disabled = false;
  $('#gate-insight-n').textContent = engine.stats.insight;
  dlg.hidden = false;
  dlg.scrollTop = 0;
  $('.g-gate-card', dlg).scrollTop = 0;
  document.body.classList.add('is-asking');
  audio.play(`${engine.realm}-ui-click`, { volume: 0.4 });
  setTimeout(() => $('.g-opt', dlg)?.focus({ preventScroll: true }), 50);
}

function useInsight() {
  if (!gateQ || answered !== null || engine.stats.insight <= 0) return;
  const wrong = $$('.g-opt:not(.is-struck)').filter((b) => +b.dataset.orig !== gateQ.a);
  if (wrong.length <= 1) return;
  const b = wrong[Math.floor(Math.random() * wrong.length)];
  b.classList.add('is-struck');
  b.disabled = true;
  engine.stats.insight--;
  $('#gate-insight-n').textContent = engine.stats.insight;
  $('#gate-insight').hidden = !engine.stats.insight;
  audio.play('collect-wisdom', { volume: 0.5 });
}

function answer(orig) {
  if (answered !== null) return;
  answered = orig;
  const q = gateQ;
  const right = orig === q.a;
  store.mark(q.id, right);
  run.results.push({ q, picked: orig, right });
  $$('.g-opt').forEach((b) => {
    b.disabled = true;
    const o = +b.dataset.orig;
    if (o === q.a) b.classList.add('is-right');
    else if (o === orig) b.classList.add('is-wrong');
  });

  let verdict;
  let line;
  if (right) {
    run.streak++;
    run.bestStreak = Math.max(run.bestStreak, run.streak);
    const mult = 1 + 0.25 * Math.min(run.streak - 1, 8);
    const pts = Math.round(100 * mult);
    run.score += pts;
    const before = engine.corruption;
    engine.setCorruption(engine.corruption - (run.streak >= 3 ? 24 : 14));
    verdict = 'The gate opens.';
    line = `+${pts}${mult > 1 ? ` · streak ×${mult.toFixed(2).replace(/\.?0+$/, '')}` : ''}${before > 0 ? ' · corruption recedes' : ''}`;
    run.reward = [`+${pts}`];
    // Every fifth answer in a row earns the aegis.
    if (run.streak % 5 === 0) {
      engine.r.shield = true;
      line += ' · divine favor: the aegis is yours';
      run.reward.push(`${run.streak} in a row · Aegis`);
    } else if (run.streak >= 3) run.reward.push(`${run.streak} in a row`);
    audio.play('collect-wisdom', { volume: 0.7 });
  } else {
    run.streak = 0;
    const next = engine.corruption + 34;
    if (next >= 100) {
      // Fully consumed: the Fallen take a heart, and the corruption eases off a little.
      engine.setCorruption(72);
      engine.r.hearts--;
      engine.chaser.lunge = 3;
      engine.flash = { color: '120,10,25', t: 0, d: 0.6 };
      audio.play('damage', { volume: 0.8 });
      verdict = 'The Fallen seize you.';
      line = 'Corruption overflowed and cost you a heart.';
    } else {
      engine.setCorruption(next);
      verdict = engine.realm === 'corrupt' && next < 84 ? 'The sanctum falls.' : 'The Fallen stir.';
      line = 'Corruption spreads.';
    }
    audio.play(`${engine.realm}-chaser-growl`, { volume: 0.6 });
  }
  $('#gate-guardian').dataset.fallen = !right || engine.realm === 'corrupt';

  // Explanation: the chosen choice's own reasoning when the set has it, then the answer's.
  const parts = [];
  const why = (s) => esc(s.replace(/^(Correct|Right|Yes)[.!:]\s*/i, ''));
  if (!right && q.oe?.[orig]) parts.push(`<p><strong>Your choice:</strong> ${why(q.oe[orig])}</p>`);
  if (q.oe?.[q.a]) parts.push(`<p><strong>${right ? 'Why it’s right' : 'Why the answer is right'}:</strong> ${why(q.oe[q.a])}</p>`);
  if (q.e) parts.push(...esc(q.e).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`));
  const review = q.review ? `<a class="g-review" href="${esc(site(q.review.url))}" target="_blank" rel="noopener"><span>Review in the outline</span><strong>${esc(q.review.title)}</strong></a>` : '';
  const res = $('#gate-result');
  res.className = `g-result ${right ? 'is-right' : 'is-wrong'}`;
  res.innerHTML = `<p class="g-verdict">${verdict}</p><p class="g-verdict-sub">${esc(line)}</p>
    ${right ? '' : `<p class="g-answer">Answer: <strong>${LETTERS[q.order.indexOf(q.a)]}.</strong> ${esc(q.o[q.a])}</p>`}
    ${parts.length ? `<div class="g-explain">${parts.join('')}</div>` : ''}
    ${!right ? review : ''}
    <p class="g-links">${right && review ? review : ''}<a href="${esc(site(q.setUrl))}" target="_blank" rel="noopener">Open ${esc(q.setTitle)}</a></p>`;
  res.hidden = false;
  $('#gate-insight').hidden = true;
  const cont = $('#gate-continue');
  cont.hidden = false;
  cont.textContent = run.cursor + 1 >= run.questions.length ? 'Approach the temple' : 'Run on';
  setTimeout(() => { cont.focus({ preventScroll: true }); res.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 60);
}

function closeGate() {
  if (answered === null) return;
  const right = answered === gateQ.a;
  $('#gate').hidden = true;
  document.body.classList.remove('is-asking');
  run.cursor++;
  gateQ = null;
  answered = null;
  engine.resolveGate(right);
  if (right) (run.reward || []).forEach((t, i) => setTimeout(() => engine.say(t, '#f9dfa0'), i * 450));
  run.reward = null;
  if (engine.r.hearts <= 0) { engine.caught(); return; }
  if (run.cursor >= run.questions.length) setTimeout(() => finish(true), 900);
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
function hud() {
  const s = engine.stats;
  const r = engine.r;
  const set = (id, v) => { const el = $(id); if (el.textContent !== String(v)) el.textContent = v; };
  set('#hud-score', (run.score + s.score).toLocaleString());
  set('#hud-laurels', s.laurels);
  set('#hud-insight', s.insight);
  set('#hud-gate', `${Math.min(run.cursor + 1, run.questions.length)} / ${run.questions.length}`);
  set('#hud-streak', run.streak > 1 ? `Streak ${run.streak}` : '');
  $$('.g-heart').forEach((h, i) => h.classList.toggle('is-lost', i >= r.hearts));
  $('.g-hud').classList.toggle('has-shield', r.shield);
  const c = Math.round(engine.corruption);
  const meter = $('#hud-corruption');
  meter.style.setProperty('--c', c / 100);
  meter.setAttribute('aria-valuenow', c);
  set('#hud-realm', engine.realm === 'corrupt' ? 'Fallen' : c >= 25 ? 'Tainted' : 'Divine');
}

function hudPulse(e) {
  const el = { laurel: '#hud-laurels', wisdom: '#hud-insight', hit: '.g-hearts', aegis: '.g-hearts', shield: '.g-hearts' }[e];
  if (!el) return;
  const node = $(el);
  node.classList.remove('pulse');
  void node.offsetWidth;
  node.classList.add('pulse');
}

// ---------------------------------------------------------------------------
// Pause, fall, finish
// ---------------------------------------------------------------------------
function pause(on) {
  if (!run || screen === 'summary' || screen === 'fallen') return;
  if (on && screen !== 'play') return;
  paused = on;
  if (on) { show('pause'); $('#gate').inert = true; } else { show('play'); $('#gate').inert = false; }
}

function showFallen() {
  const s = engine.stats;
  const done = run.results.length;
  $('#fallen-stats').innerHTML = `${done} of ${run.questions.length} gates answered · ${run.results.filter((x) => x.right).length} right · ${(run.score + s.score).toLocaleString()} points`;
  show('fallen');
}

function rise() {
  engine.revive();
  engine.setCorruption(Math.min(engine.corruption, 45));
  run.score = Math.round(run.score * 0.9);
  show('play');
}

function finish(complete) {
  if (!run || run.finished) return;
  run.finished = true;
  if (complete) { engine.mode = 'done'; engine.changeRealm('divine'); engine.corruption = 0; }
  paused = false;
  $('#gate').hidden = true;
  document.body.classList.remove('is-asking');
  const s = engine.stats;
  const total = run.score + s.score;
  const best = store.recordScore(total);
  const right = run.results.filter((x) => x.right).length;
  const n = run.results.length;
  const missed = run.results.filter((x) => !x.right);
  $('#summary-title').textContent = complete ? 'You ascend.' : 'The run ends.';
  $('#summary-lede').textContent = complete
    ? `Every gate answered${missed.length ? '. The ones that tainted you are below, with where to review them.' : ', and not one tainted you.'}`
    : n ? 'Here is how far you got, and what to review.' : 'No gates answered this time.';
  $('#summary-stats').innerHTML = [
    ['Score', total.toLocaleString() + (best ? ' · new best' : '')],
    ['Right', n ? `${right} of ${n} (${Math.round((right / n) * 100)}%)` : '—'],
    ['Best streak', run.bestStreak],
    ['Laurels', s.laurels],
    ['Distance', `${Math.round(s.distance * 3)} m`],
    ['Falls', s.falls],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  $('#summary-missed').innerHTML = missed.length ? `<h3>Review these ${missed.length}</h3><ol>${missed.map(({ q, picked }) => `<li>
      <p class="g-miss-q">${esc(q.q.length > 260 ? `${q.q.slice(0, 257)}…` : q.q)}</p>
      <p class="g-miss-a"><span class="is-wrong">You: ${esc(q.o[picked])}</span><span class="is-right">Answer: ${esc(q.o[q.a])}</span></p>
      <p class="g-miss-links">${q.review ? `<a href="${esc(site(q.review.url))}" target="_blank" rel="noopener">Review: ${esc(q.review.title)}</a>` : ''}<a href="${esc(site(q.setUrl))}" target="_blank" rel="noopener">${esc(q.setTitle)}</a></p>
    </li>`).join('')}</ol>` : '';
  $('#retry-missed').hidden = !missed.length;
  run.missedIds = new Set(missed.map((x) => x.q.id));
  audio.mix({ 'menu-music': 0.6 }, 2);
  show('summary');
  setRealm('divine');
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const KEYS = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'jump', w: 'jump', W: 'jump', ' ': 'jump', ArrowDown: 'slide', s: 'slide', S: 'slide' };
addEventListener('keydown', (e) => {
  if (!$('#gate').hidden && screen === 'play') {
    const i = '1234ABCDabcd'.indexOf(e.key);
    if (answered === null && i >= 0 && !e.metaKey && !e.ctrlKey) {
      const b = $$('.g-opt')[i % 4];
      if (b && !b.disabled) { e.preventDefault(); b.click(); }
      return;
    }
    if (answered !== null && (e.key === 'Enter' || e.key === ' ') && document.activeElement?.tagName !== 'A') { e.preventDefault(); closeGate(); }
    return;
  }
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (screen === 'play') pause(true); else if (screen === 'pause') pause(false); return; }
  if (screen !== 'play' || paused) return;
  const a = KEYS[e.key];
  if (a) { e.preventDefault(); if (!e.repeat) engine.input(a); }
});

// Swipes (and a tap to jump) anywhere on the world.
let touch = null;
canvas.addEventListener('pointerdown', (e) => { touch = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointermove', (e) => {
  if (!touch || screen !== 'play') return;
  const dx = e.clientX - touch.x;
  const dy = e.clientY - touch.y;
  if (Math.hypot(dx, dy) < 28) return;
  engine.input(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'jump' : 'slide');
  touch = null;
});
canvas.addEventListener('pointerup', () => {
  if (touch && screen === 'play' && performance.now() - touch.t < 250) engine.input('jump');
  touch = null;
});

document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'play' && $('#gate').hidden) pause(true); });
addEventListener('resize', () => engine.resize());

function syncSound() {
  const muted = audio.muted;
  $$('[data-sound]').forEach((b) => { b.setAttribute('aria-pressed', !muted); b.querySelector('span').textContent = muted ? 'Sound off' : 'Sound on'; });
}

// Buttons
$('#start').addEventListener('click', () => { click(); show('setup'); });
$('#howto-open').addEventListener('click', () => { click(); $('#howto').hidden = false; $('#howto-close').focus(); });
$('#howto-close').addEventListener('click', () => { $('#howto').hidden = true; $('#howto-open').focus(); });
$('#setup-back').addEventListener('click', () => { click(); show('title'); });
$('#begin').addEventListener('click', () => { click(); begin(); });
$('#gate-insight').addEventListener('click', useInsight);
$('#gate-continue').addEventListener('click', closeGate);
$('#pause-btn').addEventListener('click', () => pause(true));
$('#resume').addEventListener('click', () => pause(false));
$('#quit').addEventListener('click', () => finish(false));
$('#rise').addEventListener('click', () => { click(); rise(); });
$('#give-up').addEventListener('click', () => finish(false));
$('#retry-missed').addEventListener('click', () => { click(); begin(run.missedIds); });
$('#new-run').addEventListener('click', () => { click(); run = null; renderSets(); engine.reset({ character: settings.character, demo: true }); show('setup'); });
$$('[data-sound]').forEach((b) => b.addEventListener('click', () => {
  wake();
  audio.setMuted(!audio.muted);
  store.setting('muted', audio.muted);
  syncSound();
}));

// ?debug exposes the engine for testing (window.sanctum.engine.autoplay = true plays for you).
if (new URLSearchParams(location.search).has('debug')) window.sanctum = { engine, get run() { return run; } };

boot();
