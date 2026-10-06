// Client-side behaviour: theme, sheets, command-palette search, library filters,
// the immersive document viewer (panels, share, fullscreen, contents), and the
// "Jump back in" list of recently opened documents.
// Pages stay fully usable without JavaScript.

const ROOT = document.documentElement.dataset.root || './';
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const body = document.body;

let fusePromise;
const loadFuse = () => (fusePromise ||= import('./vendor-fuse.min.mjs').then((m) => m.default));
let indexPromise;
const loadIndex = () => (indexPromise ||= fetch(ROOT + 'api/search-index.json').then((r) => {
  if (!r.ok) throw new Error(r.status);
  return r.json();
}));

// Keep rule cites like 404(b) or §1.7 together as one search token.
const TOKENS = /[\p{L}\p{M}\p{N}_()§.]+/gu;

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const store = {
  get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

// ---------- Theme ----------
function currentTheme() {
  const set = document.documentElement.dataset.theme;
  if (set) return set;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
$$('[data-theme-toggle]').forEach((btn) => btn.addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch { /* storage unavailable */ }
}));

// ---------- Scenery: an optional lo-fi scene (snow, blossoms, koi…) ----------
// Remembered per browser. The drawing code (ambience.js) only loads once a scene is on.
// The document viewer has no menu and skips it, so nothing drifts over a document being studied.
const amb = $('[data-amb]');
if (amb) {
  const trigger = $('.amb-trigger', amb);
  const menu = $('.amb-menu', amb);
  const choices = $$('[data-amb-set]', amb);
  const names = choices.map((b) => b.dataset.ambSet).filter(Boolean);
  let scenery = null;

  const apply = (name) => {
    if (!names.includes(name)) name = '';
    const html = document.documentElement;
    if (name) html.dataset.ambience = name; else delete html.dataset.ambience;
    choices.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.ambSet === name)));
    if (name) {
      scenery ||= import('./ambience.js').then((m) => m.createAmbience());
      // Only play it if it's still the choice once the module has loaded.
      scenery.then((s) => { if (html.dataset.ambience === name) s.play(name); }).catch(() => {});
    } else {
      scenery?.then((s) => s.stop()).catch(() => {});
    }
  };
  const setOpen = (open, { refocus = false } = {}) => {
    if (open === !menu.hidden) return;
    menu.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (open) (choices.find((b) => b.getAttribute('aria-checked') === 'true') || choices[0]).focus({ preventScroll: true });
    else if (refocus) trigger.focus({ preventScroll: true });
  };

  trigger.addEventListener('click', () => setOpen(menu.hidden));
  choices.forEach((b) => b.addEventListener('click', () => {
    const name = b.dataset.ambSet;
    try { if (name) localStorage.setItem('ambience', name); else localStorage.removeItem('ambience'); } catch { /* storage unavailable */ }
    apply(name);
  }));
  amb.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) { e.stopPropagation(); setOpen(false, { refocus: true }); return; }
    const i = choices.indexOf(document.activeElement);
    if (i < 0) {
      if (e.target === trigger && e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); }
      return;
    }
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    const to = step ? (i + step + choices.length) % choices.length : e.key === 'Home' ? 0 : e.key === 'End' ? choices.length - 1 : -1;
    if (to >= 0) { e.preventDefault(); choices[to].focus(); }
  });
  document.addEventListener('pointerdown', (e) => { if (!amb.contains(e.target)) setOpen(false); });
  amb.addEventListener('focusout', (e) => { if (e.relatedTarget && !amb.contains(e.relatedTarget)) setOpen(false); });
  // Follow a change made in another tab.
  window.addEventListener('storage', (e) => { if (e.key === 'ambience') apply(e.newValue || ''); });

  amb.hidden = false;
  apply(document.documentElement.dataset.ambience || '');
}

// ---------- Home: light header once the dark hero scrolls away ----------
const hero = $('.hero');
if (hero && 'IntersectionObserver' in window) {
  new IntersectionObserver(([en]) => body.classList.toggle('past-hero', !en.isIntersecting), { rootMargin: '-70px 0px 0px 0px' }).observe(hero);
}

// ---------- Home: dust motes drifting through the hero's beam of light ----------
// Motes glow brighter inside the beam. Paused while the hero is off screen or the tab is hidden.
const dust = $('.hero-dust');
const beam = $('.hero-beam');
if (dust && beam && 'ResizeObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const ctx = dust.getContext('2d');
  const tilt = 28 * Math.PI / 180; // matches .hero-beam's rotate(28deg)
  const dx = -Math.sin(tilt), dy = Math.cos(tilt); // unit vector down the beam
  // One soft speck of light, drawn once and stamped for every mote.
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 32;
  const sctx = sprite.getContext('2d');
  const glow = sctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  glow.addColorStop(0, 'rgba(255, 247, 226, 1)');
  glow.addColorStop(.25, 'rgba(244, 214, 150, .55)');
  glow.addColorStop(1, 'rgba(236, 202, 134, 0)');
  sctx.fillStyle = glow;
  sctx.fillRect(0, 0, 32, 32);

  let w = 0, h = 0, ox = 0, oy = 0, half = 1, len = 1, raf = 0, last = 0, onScreen = true;
  const motes = [];
  const spawn = (anywhere) => ({
    x: Math.random() * w, y: anywhere ? Math.random() * h : h + 12,
    r: 1.4 + Math.random() ** 2.2 * 4, // glow radius, px
    vx: (Math.random() - .5) * 8, vy: -(5 + Math.random() * 12), // px per second: a slow rise
    a: .25 + Math.random() * .6, ph: Math.random() * 6.28, sp: .5 + Math.random() * 1.4,
  });
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = dust.clientWidth; h = dust.clientHeight;
    dust.width = Math.round(w * dpr); dust.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ox = beam.offsetLeft + beam.offsetWidth / 2; oy = beam.offsetTop;
    half = beam.offsetWidth / 2; len = beam.offsetHeight * .8;
    const n = Math.round(Math.min(80, w * h / 12000));
    while (motes.length < n) motes.push(spawn(true));
    motes.length = n;
  };
  const frame = (now) => {
    const dt = Math.min((now - last) / 1000, .05);
    last = now;
    ctx.clearRect(0, 0, w, h);
    for (const m of motes) {
      m.ph += m.sp * dt;
      m.x += (m.vx + Math.sin(m.ph * .7) * 6) * dt;
      m.y += m.vy * dt;
      if (m.y < -12 || m.x < -12 || m.x > w + 12) Object.assign(m, spawn(false));
      const px = m.x - ox, py = m.y - oy;
      const across = (px * dy - py * dx) / half;
      const down = (px * dx + py * dy) / len;
      const lit = Math.exp(-across * across * 1.6) * Math.min(1, Math.max(0, 1 - down));
      const s = m.r * (1 + lit * .6);
      ctx.globalAlpha = Math.min(1, m.a * (.3 + 1.1 * lit) * (.6 + .4 * Math.sin(m.ph * 2)));
      ctx.drawImage(sprite, m.x - s, m.y - s, s * 2, s * 2);
    }
    raf = requestAnimationFrame(frame);
  };
  const run = () => {
    const go = onScreen && !document.hidden;
    if (go && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    else if (!go && raf) { cancelAnimationFrame(raf); raf = 0; }
  };
  new ResizeObserver(resize).observe(dust);
  new IntersectionObserver(([en]) => { onScreen = en.isIntersecting; run(); }).observe(hero);
  document.addEventListener('visibilitychange', run);
}

// ---------- Home: the hero grid warms to gold around the pointer ----------
const lamp = $('.hero-lamp');
if (lamp && matchMedia('(hover: hover) and (pointer: fine)').matches) {
  let pt = null;
  hero.addEventListener('pointermove', (e) => {
    if (!pt) requestAnimationFrame(() => {
      const r = hero.getBoundingClientRect();
      lamp.style.setProperty('--mx', `${pt[0] - r.left}px`);
      lamp.style.setProperty('--my', `${pt[1] - r.top}px`);
      pt = null;
    });
    pt = [e.clientX, e.clientY];
    hero.classList.add('is-lit');
  });
  hero.addEventListener('pointerleave', () => hero.classList.remove('is-lit'));
}

// ---------- Toast ----------
const toastEl = $('.toast');
let toastTimer;
function toast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 1800);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
}

// ---------- Sheets (mobile subject picker) ----------
let lastFocus = null;
function openSheet(id) {
  const sheet = document.getElementById(id);
  if (!sheet) return;
  lastFocus = document.activeElement;
  sheet.hidden = false;
  body.style.overflow = 'hidden';
  $('a, button', $('.sheet-list', sheet) || sheet)?.focus({ preventScroll: true });
}
function closeSheets() {
  const open = $$('.sheet').filter((s) => !s.hidden);
  if (!open.length) return;
  open.forEach((s) => { s.hidden = true; });
  body.style.overflow = '';
  lastFocus?.focus?.({ preventScroll: true });
}
$$('[data-sheet-open]').forEach((b) => b.addEventListener('click', () => openSheet(b.dataset.sheetOpen)));
$$('[data-sheet-close]').forEach((b) => b.addEventListener('click', closeSheets));

// ---------- Desktop subjects menu ----------
const subnav = $('[data-subnav]');
if (subnav) {
  const trigger = $('.subnav-trigger', subnav);
  const panel = $('.subnav-panel', subnav);
  const items = $$('.subnav-item', subnav);
  const home = items.find((a) => a.hasAttribute('aria-current')) || items[0];
  let hoverTimer;
  const show = (item) => {
    if (!item || item.hasAttribute('data-active')) return;
    items.forEach((a) => a.toggleAttribute('data-active', a === item));
    $$('[data-subnav-pane]', subnav).forEach((p) => p.toggleAttribute('data-active', p.dataset.subnavPane === item.dataset.subnavKey));
  };
  const setOpen = (open, { refocus = false } = {}) => {
    if (open === !panel.hidden) return;
    if (open) show(home);
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (!open && refocus) trigger.focus({ preventScroll: true });
  };
  trigger.addEventListener('click', () => setOpen(panel.hidden));
  items.forEach((a) => {
    // A short delay so cutting diagonally across the list to the preview doesn't switch it.
    a.addEventListener('pointerenter', () => { clearTimeout(hoverTimer); hoverTimer = setTimeout(() => show(a), 80); });
    a.addEventListener('pointerleave', () => clearTimeout(hoverTimer));
    a.addEventListener('focus', () => show(a));
  });
  subnav.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) { e.stopPropagation(); setOpen(false, { refocus: true }); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const i = items.indexOf(document.activeElement);
    if (e.target === trigger && e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      $('.subnav-item[data-active]', subnav)?.focus();
    } else if (i >= 0) {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    }
  });
  document.addEventListener('pointerdown', (e) => { if (!subnav.contains(e.target)) setOpen(false); });
  subnav.addEventListener('focusout', (e) => { if (e.relatedTarget && !subnav.contains(e.relatedTarget)) setOpen(false); });
}

// ---------- Command palette ----------
const palette = $('#palette');
const pInput = $('#palette-input');
const pResults = $('#palette-results');
let index = null;
let fuse = null;
let selected = 0;

async function ensureIndex() {
  if (index) return;
  try {
    const [Fuse, data] = await Promise.all([loadFuse(), loadIndex()]);
    index = data;
    fuse = new Fuse(index, {
      keys: [{ name: 'title', weight: 3 }, { name: 'tags', weight: 2 }, { name: 'subject', weight: 1.5 }, { name: 'type', weight: 1.5 }, { name: 'description', weight: 1 }, { name: 'headings', weight: .8 }],
      threshold: 0.38, ignoreLocation: true, useTokenSearch: true, tokenize: TOKENS,
    });
  } catch {
    index = [];
    pResults.innerHTML = '<li class="pr-empty">Search is unavailable right now. Browse the <a href="' + ROOT + 'library/">library</a> instead.</li>';
  }
}

function renderResults() {
  if (!index || !fuse) return;
  const q = pInput.value.trim();
  const items = q ? fuse.search(q, { limit: 12 }).map((r) => r.item) : index.slice(0, 12);
  selected = 0;
  if (!items.length) {
    pResults.innerHTML = `<li class="pr-empty">No results for “${escapeHtml(q)}”.</li>`;
    return;
  }
  pResults.innerHTML = (q ? '' : '<li class="pr-group" role="presentation">All documents</li>') + items.map((it, i) => `
    <li role="option" aria-selected="${i === 0}">
      <a href="${ROOT}${it.url}">
        <span class="tile" style="--accent:${it.accent}">${it.svg || ''}</span>
        <span class="pr-text"><span class="pr-title">${escapeHtml(it.title)}</span><span class="pr-sub">${escapeHtml(it.subject)} · ${escapeHtml(it.type)}</span></span>
      </a>
    </li>`).join('');
}

function moveSelection(delta) {
  const opts = $$('[role="option"]', pResults);
  if (!opts.length) return;
  selected = (selected + delta + opts.length) % opts.length;
  opts.forEach((o, i) => o.setAttribute('aria-selected', String(i === selected)));
  opts[selected].scrollIntoView({ block: 'nearest' });
}

async function openPalette() {
  if (!palette) return;
  closeSheets();
  lastFocus = document.activeElement;
  palette.hidden = false;
  body.style.overflow = 'hidden';
  pInput.value = '';
  pInput.focus();
  await ensureIndex();
  renderResults();
}
function closePalette() {
  if (!palette || palette.hidden) return;
  palette.hidden = true;
  body.style.overflow = '';
  lastFocus?.focus?.({ preventScroll: true });
}

$$('[data-open-search]').forEach((b) => b.addEventListener('click', openPalette));
$$('[data-close-search]').forEach((b) => b.addEventListener('click', closePalette));
pInput?.addEventListener('input', renderResults);
pInput?.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); }
  else if (e.key === 'Enter') {
    const a = $('[role="option"][aria-selected="true"] a', pResults);
    if (a) { e.preventDefault(); location.href = a.href; }
  }
});
$$('.search-trigger kbd, .hero-search kbd').forEach((k) => { if (/Mac|iPhone|iPad/.test(navigator.platform)) k.textContent = '⌘ K'; });

// ---------- Global keys ----------
document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if (palette && (e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); palette.hidden ? openPalette() : closePalette(); }
  else if (palette && e.key === '/' && !typing && palette.hidden) { e.preventDefault(); openPalette(); }
  else if (e.key === 'Escape') { closePalette(); closeSheets(); closePanels(); }
});

// ---------- Library / subject filters ----------
const filterRoot = $('[data-filter-root]');
if (filterRoot) {
  const list = $('[data-filter-list]');
  const original = $$('[data-doc]', list);
  const qInput = $('[data-filter-q]', filterRoot);
  const sortSel = $('[data-filter-sort]', filterRoot);
  const status = $('[data-filter-status]');
  const empty = $('[data-filter-empty]');
  const state = { q: '', subject: '', type: '', sort: 'default' };
  let matchIds = null;
  let localFuse = null;

  const params = new URLSearchParams(location.search);
  for (const k of Object.keys(state)) if (params.get(k)) state[k] = params.get(k);

  async function search() {
    if (!state.q) { matchIds = null; return; }
    if (!localFuse) {
      const Fuse = await loadFuse();
      let idx;
      try {
        idx = (await loadIndex()).map((r) => ({ id: r.id, title: r.title, text: r.description + ' ' + r.headings, badges: r.tags + ' ' + r.type + ' ' + r.subject }));
      } catch {
        idx = original.map((c) => ({ id: c.dataset.id, title: c.dataset.title, text: c.querySelector('.doc-desc')?.textContent || '', badges: c.querySelector('.doc-kicker')?.textContent || '' }));
      }
      localFuse = new Fuse(idx, { keys: [{ name: 'title', weight: 3 }, { name: 'badges', weight: 1.5 }, { name: 'text', weight: 1 }], threshold: 0.38, ignoreLocation: true, useTokenSearch: true, tokenize: TOKENS, tokenMatch: 'all' });
    }
    matchIds = localFuse.search(state.q).map((r) => r.item.id);
  }

  function apply() {
    const shown = original.filter((c) =>
      (!state.subject || c.dataset.subject === state.subject) &&
      (!state.type || c.dataset.type === state.type) &&
      (!matchIds || matchIds.includes(c.dataset.id)));
    if (matchIds && state.sort === 'default') shown.sort((a, b) => matchIds.indexOf(a.dataset.id) - matchIds.indexOf(b.dataset.id));
    else if (state.sort === 'updated') shown.sort((a, b) => b.dataset.updated.localeCompare(a.dataset.updated));
    else if (state.sort === 'title') shown.sort((a, b) => a.dataset.title.localeCompare(b.dataset.title));
    const visible = new Set(shown);
    original.forEach((c) => { c.hidden = !visible.has(c); });
    shown.forEach((c) => list.append(c));

    $$('[data-filter-subject]', filterRoot).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filterSubject === state.subject)));
    $$('[data-filter-type]', filterRoot).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filterType === state.type)));
    // Keep the active chip visible inside its horizontally scrolling row.
    $$('.chip[aria-pressed="true"]', filterRoot).forEach((c) => {
      const row = c.parentElement;
      row.scrollTo({ left: c.offsetLeft - (row.clientWidth - c.offsetWidth) / 2, behavior: 'smooth' });
    });
    const filtered = state.q || state.subject || state.type;
    status.textContent = filtered ? `Showing ${shown.length} of ${original.length} documents` : `${original.length} documents`;
    empty.hidden = shown.length > 0;

    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(state)) if (v && !(k === 'sort' && v === 'default')) p.set(k, v);
    history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
  }

  const update = async () => { await search(); apply(); };
  let t;
  qInput.value = state.q;
  sortSel.value = state.sort;
  qInput.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = qInput.value.trim(); update(); }, 120); });
  qInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') qInput.blur(); });
  sortSel.addEventListener('change', () => { state.sort = sortSel.value; apply(); });
  filterRoot.addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter-subject],[data-filter-type]');
    if (!b) return;
    if ('filterSubject' in b.dataset) state.subject = b.dataset.filterSubject;
    else state.type = b.dataset.filterType;
    apply();
  });
  $('[data-filter-reset]')?.addEventListener('click', () => {
    Object.assign(state, { q: '', subject: '', type: '', sort: 'default' });
    qInput.value = ''; sortSel.value = 'default';
    update();
  });
  update();
}

// ---------- Recently opened ("Jump back in") ----------
const RECENT_KEY = 'recent-docs';
if (body.dataset.recent) {
  try {
    const rec = JSON.parse(body.dataset.recent);
    const list = store.get(RECENT_KEY, []).filter((r) => r.id !== rec.id);
    store.set(RECENT_KEY, [{ ...rec, at: Date.now() }, ...list].slice(0, 8));
  } catch { /* ignore malformed data */ }
}
const recentSection = $('#recently-opened');
if (recentSection) {
  const items = store.get(RECENT_KEY, []);
  if (items.length) {
    const list = $('[data-recent-list]', recentSection);
    // Stored items carry the icon from when they were opened; prefer the current one for their type.
    let typeIcons = {};
    try { typeIcons = JSON.parse(list.dataset.typeIcons || '{}'); } catch { /* keep stored icons */ }
    list.innerHTML = items.map((r) => `
      <li><a href="${ROOT}${escapeHtml(r.url)}" style="--accent:${escapeHtml(r.accent)}">
        <span class="tile">${typeIcons[r.type] || r.svg || ''}</span>
        <span class="t"><strong>${escapeHtml(r.title)}</strong><small>${escapeHtml(r.subject)} · ${escapeHtml(r.type)}</small></span>
      </a></li>`).join('');
    recentSection.hidden = false;
  }
}

// ---------- Document viewer ----------
const viewer = $('.viewer-app');
const wide = () => matchMedia('(min-width: 1101px)').matches;
function syncPanelButtons() {
  $$('[data-panel-toggle]').forEach((b) => b.setAttribute('aria-expanded', String(body.classList.contains(`${b.dataset.panelToggle}-open`))));
  $('#info-panel')?.setAttribute('aria-hidden', String(!body.classList.contains('info-open')));
}
function closePanels() {
  if (!viewer) return;
  body.classList.remove('info-open');
  if (!wide()) body.classList.remove('toc-open');
  syncPanelButtons();
}

if (viewer) {
  // Contents open by default on wide screens.
  if ($('#toc-panel') && wide()) body.classList.add('toc-open');
  syncPanelButtons();

  $$('[data-panel-toggle]').forEach((b) => b.addEventListener('click', () => {
    const name = b.dataset.panelToggle;
    const cls = `${name}-open`;
    const opening = !body.classList.contains(cls);
    if (name === 'info' && !wide()) body.classList.remove('toc-open');
    if (name === 'toc') body.classList.remove('info-open');
    body.classList.toggle(cls, opening);
    syncPanelButtons();
    if (opening && name === 'info') $('#info-panel .icon-btn')?.focus({ preventScroll: true });
  }));
  $$('[data-panel-close]').forEach((b) => b.addEventListener('click', closePanels));

  // Close the contents sheet after jumping to a section on small screens.
  $$('.toc a').forEach((a) => a.addEventListener('click', () => {
    if (!wide()) { body.classList.remove('toc-open'); syncPanelButtons(); }
  }));

  // Swipe down to dismiss bottom sheets on phones.
  for (const panel of $$('.vpanel, .vtoc')) {
    let startY = null;
    panel.addEventListener('touchstart', (e) => {
      const scroller = $('.vpanel-body, .toc', panel);
      startY = scroller && scroller.scrollTop > 0 ? null : e.touches[0].clientY;
    }, { passive: true });
    panel.addEventListener('touchend', (e) => {
      if (startY !== null && e.changedTouches[0].clientY - startY > 80) closePanels();
      startY = null;
    }, { passive: true });
  }

  const frame = $('.vframe');
  if (frame) {
    const done = () => $('.vframe-wrap')?.classList.add('is-loaded');
    // Keep the embedded document's light/dark theme in step with the site's toggle.
    const syncTheme = () => {
      try {
        const d = frame.contentDocument?.documentElement;
        if (!d) return;
        const t = document.documentElement.dataset.theme;
        if (t) d.dataset.theme = t; else delete d.dataset.theme;
      } catch { /* cross-origin document */ }
    };
    frame.addEventListener('load', syncTheme);
    new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    frame.addEventListener('load', done);
    setTimeout(done, 6000);
  }

  $$('[data-share]').forEach((b) => b.addEventListener('click', async () => {
    const url = location.href.split('#')[0];
    const title = $('.vbar-title h1')?.textContent || document.title;
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    await copyText(url);
    toast('Link copied');
  }));

  $$('[data-fullscreen]').forEach((b) => b.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (viewer.requestFullscreen) viewer.requestFullscreen().catch(() => window.open(frame.src, '_blank'));
    else window.open(frame.src, '_blank');
  }));
  $$('[data-print]').forEach((b) => b.addEventListener('click', () => print()));

  // Highlight the current section in the contents list.
  const scrollRoot = $('[data-scroll-root]');
  const tocLinks = $$('.toc a');
  if (scrollRoot && tocLinks.length && 'IntersectionObserver' in window) {
    const map = new Map(tocLinks.map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
    const obs = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        tocLinks.forEach((a) => a.classList.remove('is-active'));
        const link = map.get(en.target.id);
        if (link) { link.classList.add('is-active'); link.scrollIntoView({ block: 'nearest' }); }
      }
    }, { root: scrollRoot, rootMargin: '0px 0px -75% 0px' });
    map.forEach((_, id) => { const el = document.getElementById(id); if (el) obs.observe(el); });
  }
}

// ---------- Share your work (submission form) ----------
const submitForm = $('#submit-form');
if (submitForm) {
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  // Locally, the preview server provides a test endpoint that saves to .submissions/.
  const endpoint = submitForm.dataset.endpoint || (isLocal ? ROOT + '__local/submit' : '');
  const maxBytes = Number(submitForm.dataset.maxBytes) || 20 * 1048576;
  const allowed = ['.docx', '.pdf', '.html', '.htm', '.md', '.txt'];
  const openedAt = performance.now();

  const fileInput = $('[data-file-input]', submitForm);
  const dropzone = $('[data-dropzone]', submitForm);
  const titleInput = $('[data-title]', submitForm);
  const subjectSel = $('[data-subject]', submitForm);
  const newSubject = $('[data-new-subject]', submitForm);
  const errorBox = $('[data-form-error]', submitForm);
  const submitBtn = $('[data-submit]', submitForm);
  const success = $('[data-submit-success]');
  let titleTouched = false;

  if (!endpoint) {
    $('[data-submit-closed]').hidden = false;
    submitBtn.disabled = true;
  }

  const fmt = (b) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);
  const showError = (msg, el) => {
    errorBox.textContent = msg;
    errorBox.hidden = false;
    (el || errorBox).scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus?.({ preventScroll: true });
  };
  const clearErrors = () => {
    errorBox.hidden = true;
    $$('.is-invalid', submitForm).forEach((e) => e.classList.remove('is-invalid'));
  };

  // Turn "civ_pro-outline_v2.docx" into "Civ pro outline v2" as a starting title.
  const titleFrom = (name) => {
    const t = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
  };

  function setFile(file) {
    clearErrors();
    if (!file) {
      fileInput.value = '';
      dropzone.classList.remove('has-file');
      $('.dropzone-empty', dropzone).hidden = false;
      $('.dropzone-file', dropzone).hidden = true;
      return;
    }
    const ext = (file.name.match(/\.[^.]+$/)?.[0] || '').toLowerCase();
    if (!allowed.includes(ext)) { setFile(null); showError(`That file type isn't supported. Please choose a Word, PDF, HTML, Markdown, or text file.`); return; }
    if (file.size > maxBytes) { setFile(null); showError(`That file is ${fmt(file.size)}. The limit is ${fmt(maxBytes)}.`); return; }
    dropzone.classList.add('has-file');
    $('.dropzone-empty', dropzone).hidden = true;
    $('.dropzone-file', dropzone).hidden = false;
    $('[data-file-name]', dropzone).textContent = file.name;
    $('[data-file-size]', dropzone).textContent = `${fmt(file.size)} · ready to upload`;
    if (!titleTouched || !titleInput.value) titleInput.value = titleFrom(file.name);
  }

  fileInput.addEventListener('change', () => setFile(fileInput.files[0]));
  $('[data-file-clear]', dropzone).addEventListener('click', (e) => { e.preventDefault(); setFile(null); });
  ['dragenter', 'dragover'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((ev) => dropzone.addEventListener(ev, () => dropzone.classList.remove('is-over')));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    setFile(file);
  });
  titleInput.addEventListener('input', () => { titleTouched = true; });
  subjectSel.addEventListener('change', () => {
    newSubject.hidden = subjectSel.value !== '__new__';
    if (!newSubject.hidden) $('input', newSubject).focus();
  });
  $$('[data-count]', submitForm).forEach((ta) => {
    const out = $('[data-count-out]', ta.closest('.field'));
    ta.addEventListener('input', () => { out.textContent = ta.value.length; });
  });

  function validateForm() {
    clearErrors();
    const file = fileInput.files[0];
    if (!file) { dropzone.classList.add('is-invalid'); return showError('Please choose a file to upload.', dropzone), false; }
    if (!subjectSel.value) { subjectSel.classList.add('is-invalid'); return showError('Please choose a subject.', subjectSel), false; }
    const ns = $('input', newSubject);
    if (subjectSel.value === '__new__' && ns.value.trim().length < 2) { ns.classList.add('is-invalid'); return showError('Please enter a name for the new subject.', ns), false; }
    if (titleInput.value.trim().length < 3) { titleInput.classList.add('is-invalid'); return showError('Please give your document a title.', titleInput), false; }
    const contributor = submitForm.elements.contributor;
    if (/@/.test(contributor.value)) { contributor.classList.add('is-invalid'); return showError("Please use a name or initials, not an email address.", contributor), false; }
    const unchecked = $$('.check input', submitForm).filter((c) => !c.checked);
    if (unchecked.length) { unchecked.forEach((c) => c.closest('.check').classList.add('is-invalid')); return showError('Please tick all three confirmations.', unchecked[0]), false; }
    return true;
  }

  function setBusy(busy, label) {
    submitBtn.disabled = busy;
    submitBtn.innerHTML = busy ? `<span class="spinner"></span> <span>${label}</span>` : submitBtn.dataset.idle;
  }
  submitBtn.dataset.idle = submitBtn.innerHTML;

  submitForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!endpoint || !validateForm()) return;
    const data = new FormData(submitForm);
    data.set('elapsedMs', String(Math.round(performance.now() - openedAt)));

    // XHR rather than fetch so we can show upload progress for big files.
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setBusy(true, `Uploading… ${Math.round((ev.loaded / ev.total) * 100)}%`); };
    xhr.upload.onload = () => setBusy(true, 'Finishing up…');
    xhr.onload = () => {
      const res = xhr.response || {};
      if (xhr.status >= 200 && xhr.status < 300 && res.ok) {
        submitForm.hidden = true;
        $('[data-reference]', success).textContent = res.reference;
        success.hidden = false;
        success.focus();
        success.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        setBusy(false);
        showError(res.error || 'Something went wrong. Please try again in a few minutes.');
      }
    };
    xhr.onerror = () => { setBusy(false); showError("We couldn't reach the server. Check your connection and try again."); };
    setBusy(true, 'Uploading…');
    xhr.send(data);
  });

  $('[data-submit-another]')?.addEventListener('click', () => {
    submitForm.reset();
    setFile(null);
    titleTouched = false;
    newSubject.hidden = true;
    setBusy(false);
    success.hidden = true;
    submitForm.hidden = false;
    submitForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
