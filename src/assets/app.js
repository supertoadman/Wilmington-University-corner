// Client-side behaviour: theme, mobile menu, command-palette search, library
// filters, copy/print/fullscreen buttons, and reader table-of-contents tracking.
// Everything degrades gracefully: pages are fully usable without JavaScript.

const ROOT = document.documentElement.dataset.root || './';
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

let fusePromise;
const loadFuse = () => (fusePromise ||= import('./vendor-fuse.min.mjs').then((m) => m.default));

// Keep rule cites like 404(b) or §1.7 together as one search token.
const TOKENS = /[\p{L}\p{M}\p{N}_()§.]+/gu;

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

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

// ---------- Mobile menu ----------
const menuBtn = $('[data-menu-toggle]');
menuBtn?.addEventListener('click', () => {
  const open = document.body.classList.toggle('menu-open');
  menuBtn.setAttribute('aria-expanded', String(open));
});

// ---------- Copy / print / fullscreen ----------
async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  const label = btn.querySelector('span');
  if (label) {
    const prev = label.textContent;
    label.textContent = 'Copied!';
    btn.classList.add('is-done');
    setTimeout(() => { label.textContent = prev; btn.classList.remove('is-done'); }, 1600);
  }
}
$$('[data-copy-link]').forEach((b) => b.addEventListener('click', () => copyText(location.href.split('#')[0], b)));
$$('[data-copy-code]').forEach((b) => b.addEventListener('click', () => copyText(b.closest('.code-block').querySelector('code').innerText, b)));
$$('[data-print]').forEach((b) => b.addEventListener('click', () => print()));
$$('[data-fullscreen]').forEach((b) => b.addEventListener('click', () => {
  const v = b.closest('[data-viewer]');
  if (document.fullscreenElement) document.exitFullscreen();
  else if (v.requestFullscreen) v.requestFullscreen();
  else window.open(v.querySelector('iframe').src, '_blank');
}));

// ---------- Command palette ----------
const palette = $('#palette');
const pInput = $('#palette-input');
const pResults = $('#palette-results');
let index = null;
let fuse = null;
let selected = 0;
let lastFocus = null;

async function ensureIndex() {
  if (index) return;
  try {
    const [Fuse, data] = await Promise.all([loadFuse(), fetch(ROOT + 'api/search-index.json').then((r) => r.json())]);
    index = data;
    fuse = new Fuse(index, {
      keys: [{ name: 'title', weight: 3 }, { name: 'tags', weight: 2 }, { name: 'subject', weight: 1.5 }, { name: 'type', weight: 1.5 }, { name: 'description', weight: 1 }, { name: 'headings', weight: .8 }],
      threshold: 0.38, ignoreLocation: true, useTokenSearch: true, tokenize: TOKENS,
    });
  } catch (e) {
    index = [];
    pResults.innerHTML = '<li class="pr-empty">Search is unavailable offline. Browse the <a href="' + ROOT + 'library/">library</a> instead.</li>';
  }
}

function renderResults() {
  if (!index) return;
  const q = pInput.value.trim();
  const items = q ? fuse.search(q, { limit: 12 }).map((r) => r.item) : index.slice(0, 12);
  selected = 0;
  if (!items.length) {
    pResults.innerHTML = `<li class="pr-empty">No results for “${escapeHtml(q)}”.</li>`;
    return;
  }
  pResults.innerHTML = (q ? '' : '<li class="pr-group" role="presentation">All documents</li>') + items.map((it, i) => `
    <li role="option" aria-selected="${i === 0}" data-i="${i}">
      <a href="${ROOT}${it.url}">
        <span class="doc-icon" style="--accent:${it.accent}">${it.svg || ''}</span>
        <span class="pr-text"><span class="pr-title">${escapeHtml(it.title)}</span><span class="pr-sub">${escapeHtml(it.subject)} · ${escapeHtml(it.type)} · ${escapeHtml(it.description)}</span></span>
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
  lastFocus = document.activeElement;
  palette.hidden = false;
  document.body.style.overflow = 'hidden';
  pInput.value = '';
  pInput.focus();
  await ensureIndex();
  renderResults();
}
function closePalette() {
  palette.hidden = true;
  document.body.style.overflow = '';
  lastFocus?.focus?.();
}

$$('[data-open-search]').forEach((b) => b.addEventListener('click', openPalette));
$$('[data-close-search]').forEach((b) => b.addEventListener('click', closePalette));
pInput?.addEventListener('input', renderResults);
pInput?.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); }
  else if (e.key === 'Enter') {
    const a = $(`[role="option"][aria-selected="true"] a`, pResults);
    if (a) { e.preventDefault(); location.href = a.href; }
  }
});
document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); palette.hidden ? openPalette() : closePalette(); }
  else if (e.key === '/' && !typing && palette.hidden) { e.preventDefault(); openPalette(); }
  else if (e.key === 'Escape' && !palette.hidden) closePalette();
});
$$('.search-trigger kbd, .hero-search kbd').forEach((k) => { if (/Mac|iPhone|iPad/.test(navigator.platform)) k.textContent = '⌘ K'; });

// ---------- Library / subject filters ----------
const filterRoot = $('[data-filter-root]');
if (filterRoot) {
  const list = $('[data-filter-list]');
  const cards = $$('[data-doc]', list);
  const original = [...cards];
  const qInput = $('[data-filter-q]', filterRoot);
  const sortSel = $('[data-filter-sort]', filterRoot);
  const status = $('[data-filter-status]');
  const empty = $('[data-filter-empty]');
  const state = { q: '', subject: '', type: '', sort: 'default' };
  let matchIds = null;
  let localFuse = null;

  const params = new URLSearchParams(location.search);
  for (const k of ['q', 'subject', 'type', 'sort']) if (params.get(k)) state[k] = params.get(k);

  const records = cards.map((c) => ({
    id: c.dataset.id,
    title: c.dataset.title,
    text: c.querySelector('.doc-desc')?.textContent || '',
    badges: c.querySelector('.doc-badges')?.textContent || '',
  }));

  async function search() {
    if (!state.q) { matchIds = null; return; }
    if (!localFuse) {
      const Fuse = await loadFuse();
      let idx = records;
      try {
        const remote = await fetch(ROOT + 'api/search-index.json').then((r) => r.json());
        idx = remote.map((r) => ({ id: r.id, title: r.title, text: r.description + ' ' + r.headings, badges: r.tags + ' ' + r.type + ' ' + r.subject }));
      } catch { /* fall back to card text */ }
      localFuse = new Fuse(idx, { keys: [{ name: 'title', weight: 3 }, { name: 'badges', weight: 1.5 }, { name: 'text', weight: 1 }], threshold: 0.38, ignoreLocation: true, useTokenSearch: true, tokenize: TOKENS, tokenMatch: 'all' });
    }
    matchIds = localFuse.search(state.q).map((r) => r.item.id);
  }

  function apply() {
    let shown = original.filter((c) =>
      (!state.subject || c.dataset.subject === state.subject) &&
      (!state.type || c.dataset.type === state.type) &&
      (!matchIds || matchIds.includes(c.dataset.id)));
    if (matchIds && state.sort === 'default') shown.sort((a, b) => matchIds.indexOf(a.dataset.id) - matchIds.indexOf(b.dataset.id));
    else if (state.sort === 'updated') shown.sort((a, b) => b.dataset.updated.localeCompare(a.dataset.updated));
    else if (state.sort === 'title') shown.sort((a, b) => a.dataset.title.localeCompare(b.dataset.title));
    const visible = new Set(shown);
    original.forEach((c) => { c.hidden = !visible.has(c); });
    shown.forEach((c) => list.append(c));
    original.filter((c) => !visible.has(c)).forEach((c) => list.append(c));

    $$('[data-filter-subject]', filterRoot).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filterSubject === state.subject)));
    $$('[data-filter-type]', filterRoot).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filterType === state.type)));
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

// ---------- Reader TOC: highlight current section ----------
const tocLinks = $$('.reader-toc a');
if (tocLinks.length && 'IntersectionObserver' in window) {
  const map = new Map(tocLinks.map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
  const obs = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) {
        tocLinks.forEach((a) => a.classList.remove('is-active'));
        map.get(en.target.id)?.classList.add('is-active');
      }
    }
  }, { rootMargin: '-80px 0px -70% 0px' });
  map.forEach((_, id) => { const el = document.getElementById(id); if (el) obs.observe(el); });
}
