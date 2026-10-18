// HTML templates for every page type. Pure functions: (ctx, data) => string.
// All internal links are relative to the current page (via `root`), so the site
// works under any base path: GitHub Pages project URL, custom domain, or localhost.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Icons: the site's own solid set (src/icons, drawn by scripts/icons), inlined at
// build time. Names it doesn't cover fall back to Lucide outlines (class "line").
// ---------------------------------------------------------------------------
const iconCache = new Map();

export function icon(name, cls = '') {
  // Statue heads (the document types) are painted by CSS from assets/statues/<name>.webp.
  if (name.startsWith('statue-')) return `<span class="icon statue ${name}${cls ? ` ${cls}` : ''}" aria-hidden="true"></span>`;
  if (!iconCache.has(name)) {
    let file = path.join(ROOT, 'src', 'icons', `${name}.svg`);
    let line = false;
    if (!fs.existsSync(file)) {
      file = path.join(ROOT, 'node_modules', 'lucide-static', 'icons', `${name}.svg`);
      line = fs.existsSync(file);
      if (!line) file = path.join(ROOT, 'src', 'icons', 'file-text.svg');
    }
    const svg = fs.readFileSync(file, 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s*xmlns="[^"]*"/, '')
      .replace(/\s*class="[^"]*"/, '')
      .replace(/\s*width="24"\s*height="24"/, '')
      .replace('<svg', `<svg class="icon${line ? ' line' : ''}" aria-hidden="true" focusable="false"`)
      .replace(/\n\s*/g, ' ')
      .trim();
    iconCache.set(name, svg);
  }
  const svg = iconCache.get(name);
  return cls ? svg.replace('class="icon', `class="icon ${cls}`) : svg;
}

// Gold-leaf paints for the logo and icons: bright on dark grounds, antique on light ones.
const GILT_DEFS = '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>'
  + '<linearGradient id="gilt" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#fff3c8"/><stop offset=".24" stop-color="#f1cf74"/><stop offset=".5" stop-color="#c99630"/><stop offset=".64" stop-color="#e8c167"/><stop offset=".82" stop-color="#b98a2c"/><stop offset="1" stop-color="#8e6420"/></linearGradient>'
  + '<linearGradient id="gilt-deep" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#d9ac4c"/><stop offset=".45" stop-color="#a87b22"/><stop offset=".62" stop-color="#c39437"/><stop offset="1" stop-color="#7a5414"/></linearGradient>'
  + '</defs></svg>';

// Site logo: the young Socrates head (styles.css paints it from assets/statues/socrates.webp).
const LOGO = '<span class="logo" aria-hidden="true"></span>';

// Structured outlines stand between two marble archangels (their fallen counterparts at night).
// styles.css paints them from assets/archangels; app.js turns to the next pair at each section.
// Each outline starts the cycle of seven at its own figure, which also stands in its masthead.
const NAVE = '<div class="nave" aria-hidden="true"><span class="nave-fig nave-l"></span><span class="nave-fig nave-r"></span></div>';
const angelFor = (id) => [...id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 7, 0);

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
export const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmtSize = (b) => (b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtShortDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
// Wrap each word so the home headline can rise in one word at a time (see .hero-title .w).
const riseWords = (html) => html.split(' ').map((w, i) => `<span class="w" style="--i:${i}">${w}</span>`).join(' ');

const FONTS = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..600&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
function head(ctx, { root, title, description, canonical = '', extraHead = '', jsonld = null }) {
  const { config } = ctx;
  const fullTitle = title ? `${title} · ${config.shortTitle}` : config.title;
  const desc = description || config.tagline;
  const url = config.url + canonical;
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(config.title)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(config.url)}assets/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#f7f5f0" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0d1117" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${esc(config.shortTitle)}">
<link rel="icon" href="${root}assets/favicon.ico" sizes="32x32">
<link rel="icon" href="${root}assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${root}assets/apple-touch-icon.png">
<link rel="alternate" type="application/json" title="Catalog (JSON)" href="${root}api/catalog.json">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="${root}assets/styles.css">
<script>(function(){var d=document.documentElement;d.dataset.theme='dark';try{var t=localStorage.getItem('theme'),a=localStorage.getItem('ambience')||'off';if(t)d.dataset.theme=t;if(a!=='off')d.dataset.ambience=a;}catch(e){}})();</script>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
${extraHead}`;
}

const themeButton = (cls = 'icon-btn') =>
  `<button class="${cls}" type="button" data-theme-toggle aria-label="Toggle dark mode">${icon('moon', 'theme-moon')}${icon('sun', 'theme-sun')}</button>`;

// Optional scenery drifting across the pages (drawn by assets/ambience.js; the ids match its scenes).
const AMBIENCE = [
  { id: 'snow', label: 'Snowfall', icon: 'snowflake', accent: '#5f7fae' },
  { id: 'sakura', label: 'Cherry blossoms', icon: 'blossom', accent: '#b24a6e' },
  { id: 'koi', label: 'Koi pond', icon: 'koi', accent: '#21706b' },
  { id: 'fireflies', label: 'Fireflies', icon: 'firefly', accent: '#55682a' },
  { id: 'rain', label: 'Rain', icon: 'rain', accent: '#2f4b68' },
  { id: 'leaves', label: 'Autumn leaves', icon: 'leaf', accent: '#a4561f' },
];
// Hidden until app.js wires it up, so it never shows as a dead button without JavaScript.
const ambienceControl = (cls = 'icon-btn') => `<div class="amb" data-amb hidden>
        <button class="${cls} amb-trigger" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="amb-menu" aria-label="Background effects" title="Background effects">${icon('sparkles', 'amb-ico amb-ico-off')}${AMBIENCE.map((a) => icon(a.icon, `amb-ico amb-ico-${a.id}`)).join('')}<span class="amb-trigger-label">Effects</span></button>
        <div class="amb-menu" id="amb-menu" role="menu" aria-labelledby="amb-title" hidden>
          <div class="amb-head">
            <p class="amb-title" id="amb-title">Effects</p>
            <button class="amb-off" type="button" role="menuitemradio" aria-checked="true" data-amb-set="">Off</button>
          </div>
          <p class="amb-sub">A quiet lo-fi scene drifting across the pages.</p>
          <div class="amb-grid">
            ${AMBIENCE.map((a) => `<button class="amb-option" type="button" role="menuitemradio" aria-checked="false" data-amb-set="${a.id}"><span class="tile" style="--accent:${a.accent}">${icon(a.icon)}</span><span class="amb-label">${a.label}</span></button>`).join('')}
          </div>
        </div>
      </div>`;

function layout(ctx, { root, title, description, body, active = '', canonical = '', extraHead = '', jsonld = null, bodyClass = '' }) {
  const { config, subjects, docs } = ctx;
  return `<!doctype html>
<html lang="en" data-root="${root}">
<head>
${head(ctx, { root, title, description, canonical, extraHead, jsonld })}
</head>
<body class="${bodyClass}">
${GILT_DEFS}
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="${root}" aria-label="${esc(config.title)} home">
      <span class="brand-mark" aria-hidden="true">${LOGO}</span>
      <span class="brand-text"><span class="brand-name">${esc(config.shortTitle)}</span><span class="brand-sub">Study Library</span></span>
    </a>
    <nav class="main-nav" aria-label="Main">
      ${subjectMenu(ctx, root, active)}
      <a href="${root}library/"${active === 'library' ? ' aria-current="page"' : ''}>Library</a>
    </nav>
    <div class="header-actions">
      <button class="search-trigger" type="button" data-open-search aria-label="Search all documents">
        ${icon('search')}<span class="search-trigger-label">Search documents</span><kbd>Ctrl K</kbd>
      </button>
      <a class="btn btn-share" href="${root}contribute/"${active === 'contribute' ? ' aria-current="page"' : ''}>${icon('upload')}<span>Share your work</span></a>
      ${ambienceControl('icon-btn amb-labeled')}
      ${themeButton()}
    </div>
  </div>
  ${active === 'home' ? `<nav class="course-nav" aria-label="Shortcuts"><div class="container course-nav-inner"><a href="#courses">${icon('layout-grid')} Courses <small>${subjects.length}</small></a><a href="${root}library/?type=practice">${icon('list-checks')} Practice questions <small>${docs.filter((d) => d.type === 'practice').length}</small></a><a href="#recent-h">${icon('clock')} Recently updated</a><a class="course-nav-all" href="${root}files/all-study-materials.zip" download>${icon('download')} Download everything</a></div></nav>` : ''}
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="container footer-inner">
    <div class="footer-brand">
      <a class="brand" href="${root}"><span class="brand-mark" aria-hidden="true">${LOGO}</span><span class="brand-name">${esc(config.title)}</span></a>
      <p class="footer-note">${esc(config.disclaimer)}</p>
    </div>
    <nav class="footer-links" aria-label="Footer">
      <a href="${root}library/">All documents</a>
      ${subjects.map((s) => `<a href="${root}subjects/${s.slug}/">${esc(s.title)}</a>`).join('')}
      <a href="${root}contribute/">Share your work</a>
      <a href="${root}files/all-study-materials.zip" download>Download everything</a>
    </nav>
  </div>
  <div class="container footer-bottom">${plural(docs.length, 'document')} · Updated ${fmtDate(ctx.generatedAt)}</div>
</footer>

<nav class="tabbar" aria-label="Quick navigation">
  <a href="${root}"${active === 'home' ? ' aria-current="page"' : ''}>${icon('house')}<span>Home</span></a>
  <button type="button" data-sheet-open="subjects-sheet"${subjects.some((s) => s.slug === active) ? ' aria-current="page"' : ''}>${icon('layout-grid')}<span>Courses</span></button>
  <button type="button" data-open-search>${icon('search')}<span>Search</span></button>
  <a href="${root}library/"${active === 'library' ? ' aria-current="page"' : ''}>${icon('library')}<span>Library</span></a>
  <a href="${root}contribute/"${active === 'contribute' ? ' aria-current="page"' : ''}>${icon('upload')}<span>Share</span></a>
</nav>

<div class="sheet" id="subjects-sheet" hidden>
  <div class="sheet-scrim" data-sheet-close></div>
  <div class="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="subjects-sheet-title">
    <div class="sheet-grab" aria-hidden="true"></div>
    <div class="sheet-head"><h2 id="subjects-sheet-title">Courses</h2><button class="icon-btn" type="button" data-sheet-close aria-label="Close">${icon('x')}</button></div>
    <ul class="sheet-list">
      ${subjects.map((s) => `<li><a class="sheet-item" href="${root}subjects/${s.slug}/" style="--accent:${s.accent}"><span class="tile">${icon(s.icon)}</span><span class="sheet-item-text"><strong>${esc(s.title)}</strong><small>${plural(s.documents.length, 'document')}</small></span>${icon('chevron-right', 'chev')}</a></li>`).join('')}
      <li><a class="sheet-item" href="${root}library/"><span class="tile">${icon('library')}</span><span class="sheet-item-text"><strong>All documents</strong><small>Search and filter everything</small></span>${icon('chevron-right', 'chev')}</a></li>
    </ul>
  </div>
</div>
${palette()}
<script type="module" src="${root}assets/app.js"></script>
</body>
</html>`;
}

const palette = () => `<div class="palette" id="palette" hidden>
  <div class="palette-backdrop" data-close-search></div>
  <div class="palette-panel" role="dialog" aria-modal="true" aria-label="Search documents">
    <div class="palette-input-row">
      ${icon('search')}
      <input id="palette-input" type="search" placeholder="Search outlines, rules, practice sets…" autocomplete="off" spellcheck="false" aria-controls="palette-results" enterkeyhint="go">
      <button type="button" class="palette-close" data-close-search>Cancel</button>
    </div>
    <ul class="palette-results" id="palette-results" role="listbox"></ul>
    <div class="palette-footer"><span><kbd>↑</kbd><kbd>↓</kbd> to move</span><span><kbd>Enter</kbd> to open</span><span><kbd>Esc</kbd> to close</span></div>
  </div>
</div>`;

// Desktop "Subjects" menu: the course list on the left, a preview of the highlighted
// course (description + documents) on the right. Phones use the tab bar's sheet instead.
function subjectMenu(ctx, root, active) {
  const { subjects, docs, TYPES, P } = ctx;
  const current = subjects.find((s) => s.slug === active);
  const shown = current || subjects[0];
  const preview = (s) => {
    const list = s.documents.slice(0, 6);
    return `<div class="subnav-preview" data-subnav-pane="${esc(s.slug)}" style="--accent:${s.accent}"${s === shown ? ' data-active' : ''}>
            <p class="subnav-stats">${subjectStats(s).map(esc).join(' · ')}</p>
            <p class="subnav-title">${esc(s.title)}</p>
            <p class="subnav-desc">${esc(s.description)}</p>
            ${list.length ? `<ul class="subnav-docs">${list.map((d) => `<li><a href="${root}${P.doc(d)}"><span class="tile">${icon(TYPES[d.type].icon)}</span><span class="subnav-doc-text"><strong>${esc(d.title)}</strong><small>${esc(TYPES[d.type].label)}</small></span></a></li>`).join('')}</ul>` : ''}
            <div class="subnav-foot"><a class="link-arrow" href="${root}${P.subject(s)}">${s.documents.length > list.length ? `See all ${s.documents.length} in` : 'Go to'} ${esc(s.title)} ${icon('arrow-right')}</a></div>
          </div>`;
  };
  return `<div class="subnav" data-subnav>
        <button class="subnav-trigger" type="button" aria-expanded="false" aria-controls="subnav-panel"${current ? ' aria-current="page"' : ''}>Courses${icon('chevron-down', 'subnav-caret')}</button>
        <div class="subnav-panel" id="subnav-panel" hidden>
          <div class="subnav-side">
            <p class="subnav-label">Courses <span>${subjects.length}</span></p>
            <ul class="subnav-list">
              ${subjects.map((s) => `<li><a class="subnav-item" href="${root}${P.subject(s)}" data-subnav-key="${esc(s.slug)}" style="--accent:${s.accent}"${s === shown ? ' data-active' : ''}${s === current ? ' aria-current="page"' : ''}><span class="subnav-icon">${icon(s.icon)}</span><span class="subnav-item-text"><strong>${esc(s.title)}</strong><small>${plural(s.documents.length, 'document')}</small></span>${icon('chevron-right', 'chev')}</a></li>`).join('\n              ')}
            </ul>
            <a class="subnav-all" href="${root}library/">${icon('library')}<span>All documents</span><span class="count">${docs.length}</span></a>
          </div>
          <div class="subnav-previews">${subjects.map(preview).join('')}</div>
        </div>
      </div>`;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------
const subjectStats = (s) => {
  const practice = s.documents.filter((d) => d.type === 'practice').length;
  const q = s.documents.reduce((n, d) => n + (d.questions || 0), 0);
  return [plural(s.documents.length, 'document'), practice ? plural(practice, 'practice set') : null, q ? `${q}+ questions` : null].filter(Boolean);
};

function docCard(ctx, root, d, { showSubject = false } = {}) {
  const { TYPES, P } = ctx;
  const t = TYPES[d.type];
  const meta = [d.format.label, fmtSize(d.size), d.questions ? `${d.questions} questions` : null, d.contributor ? `Shared by ${d.contributor}` : null, `Updated ${fmtShortDate(d.updated)}`].filter(Boolean);
  return `<article class="doc-card" style="--accent:${d.subject.accent}" data-doc data-id="${esc(d.id)}" data-subject="${esc(d.subject.slug)}" data-type="${esc(d.type)}" data-updated="${esc(d.updated)}" data-title="${esc(d.title)}">
  <div class="doc-card-art" aria-hidden="true"><span class="medal">${icon(t.icon)}</span></div>
  <div class="doc-card-body">
    <p class="doc-kicker"><span>${esc(t.label)}</span>${showSubject ? `<span class="doc-kicker-subject">${esc(d.subject.title)}</span>` : ''}</p>
    <h3 class="doc-title"><a class="stretched" href="${root}${P.doc(d)}">${esc(d.title)}</a></h3>
    <p class="doc-desc">${esc(d.description)}</p>
    <p class="doc-meta">${meta.map((m) => `<span>${esc(m)}</span>`).join('')}</p>
  </div>
  <div class="doc-card-actions">
    <span class="doc-open" aria-hidden="true">Open ${icon('arrow-right')}</span>
    <a class="dl-btn" href="${root}${P.file(d)}" download="${esc(d.filename)}" aria-label="Download ${esc(d.title)} (${esc(d.format.label)}, ${fmtSize(d.size)})" title="Download">${icon('download')}</a>
  </div>
</article>`;
}

function docRow(ctx, root, d, extra = '') {
  const t = ctx.TYPES[d.type];
  return `<li><a class="doc-row" href="${root}${ctx.P.doc(d)}" style="--accent:${d.subject.accent}"${extra}>
    <span class="tile">${icon(t.icon)}</span>
    <span class="doc-row-text"><strong>${esc(d.title)}</strong><small>${esc(t.label)}${d.questions ? ` · ${d.questions} questions` : ''}</small></span>
    ${icon('chevron-right', 'chev')}
  </a></li>`;
}

function subjectPanel(ctx, root, s) {
  const shown = s.documents.slice(0, 6);
  const stats = subjectStats(s);
  return `<article class="subject-panel" style="--accent:${s.accent}">
  <a class="subject-panel-head" href="${root}subjects/${s.slug}/">
    <span class="subject-panel-icon">${icon(s.icon)}</span>
    <span class="subject-panel-title">
      <span class="h">${esc(s.title)}</span>
      <span class="s">${stats.map(esc).join(' · ')}</span>
    </span>
    <span class="round-arrow" aria-hidden="true">${icon('arrow-up-right')}</span>
  </a>
  <p class="subject-panel-desc">${esc(s.description)}</p>
  ${Object.entries(ctx.TYPES).filter(([type]) => shown.some(d => d.type === type)).map(([type, meta]) => `<div class="subject-group"><h3>${esc(meta.plural)} <span>${shown.filter(d => d.type === type).length}</span></h3><ul class="doc-rows">${shown.filter(d => d.type === type).map(d => docRow(ctx, root, d)).join('')}</ul></div>`).join('')}
  ${!s.documents.length ? '<p class="preview-count">No documents yet.</p>' : shown.length < s.documents.length ? `<p class="preview-count">Showing ${shown.length} of ${s.documents.length} documents</p>` : ''}
  <a class="subject-panel-more" href="${root}subjects/${s.slug}/">${shown.length < s.documents.length ? `View all ${s.documents.length} documents` : 'Open the course page'} ${icon('arrow-right')}</a>
</article>`;
}

// The way into Sanctum Run, under the course browser: a philosopher and his fallen self.
function playBand(ctx, root) {
  const { game } = ctx;
  const sets = game.courses.reduce((n, c) => n + c.sets.length, 0);
  const sheet = (realm) => `${root}play/pack/textures/${realm}/characters/${realm}-socrates-moves.webp`;
  return `<a class="play-band" href="${root}play/">
    <span class="play-band-art" aria-hidden="true"><span class="play-fig play-fig-divine" style="background-image:url('${sheet('divine')}')"></span><span class="play-fig play-fig-corrupt" style="background-image:url('${sheet('corrupt')}')"></span></span>
    <span class="play-band-text">
      <span class="kicker">Study game · New</span>
      <span class="play-band-title">Sanctum <em>Run</em></span>
      <span class="play-band-desc">Run the sanctuary as Socrates, Plato or Aristotle while your practice questions wait at every gate. Pick your courses and sets. Miss one and the sanctum falls, the Fallen close in, and the gate points you to the outline section to review.</span>
      <span class="play-band-meta">${game.total.toLocaleString('en-US')} questions · ${plural(sets, 'practice set')} · ${plural(game.courses.length, 'course')}</span>
    </span>
    <span class="btn btn-gold play-band-cta">${icon('play')} Play</span>
  </a>`;
}

const breadcrumbs = (root, items) => `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>
  <li><a href="${root}">Home</a></li>
  ${items.map(([href, label], i) => i === items.length - 1
    ? `<li aria-current="page">${esc(label)}</li>`
    : `<li><a href="${root}${href}">${esc(label)}</a></li>`).join('')}
</ol></nav>`;

function filterBar(ctx, docs, { subjectFilter }) {
  const { TYPES, subjects } = ctx;
  const types = Object.keys(TYPES).filter((t) => docs.some((d) => d.type === t));
  return `<div class="filter-bar" data-filter-root>
  <div class="filter-row">
    <label class="filter-search">
      ${icon('search')}
      <input type="search" data-filter-q placeholder="Filter by title, rule, or topic…" aria-label="Filter documents" enterkeyhint="search">
    </label>
    <label class="filter-sort">
      <span class="sr-only">Sort</span>
      ${icon('arrow-up-down')}
      <select data-filter-sort aria-label="Sort documents">
        <option value="default">Recommended</option>
        <option value="updated">Recently updated</option>
        <option value="title">Title A–Z</option>
      </select>
    </label>
  </div>
  ${subjectFilter ? `<div class="chip-scroll" role="group" aria-label="Subject">
    <button type="button" class="chip" data-filter-subject="" aria-pressed="true">All courses</button>
    ${subjects.filter((s) => s.documents.length).map((s) => `<button type="button" class="chip" data-filter-subject="${esc(s.slug)}" aria-pressed="false" style="--accent:${s.accent}"><span class="dot"></span>${esc(s.title)}</button>`).join('')}
  </div>` : ''}
  <div class="chip-scroll" role="group" aria-label="Type">
    <button type="button" class="chip" data-filter-type="" aria-pressed="true">All types</button>
    ${types.map((t) => `<button type="button" class="chip" data-filter-type="${t}" aria-pressed="false">${icon(TYPES[t].icon)} ${esc(TYPES[t].plural)}</button>`).join('')}
  </div>
</div>
<p class="filter-status" data-filter-status aria-live="polite"></p>`;
}

const emptyState = () => `<div class="empty-state" data-filter-empty hidden>${icon('search-x')}<p>No documents match those filters.</p><button class="btn btn-ghost" type="button" data-filter-reset>Clear filters</button></div>`;

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------
export function home(ctx) {
  const root = './';
  const { config, subjects, docs } = ctx;
  const totalQ = docs.reduce((n, d) => n + (d.questions || 0), 0);
  const recent = [...docs].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 6);
  const body = `
<section class="hero reading-room" aria-labelledby="cover-title">
  <div class="container cover-grid">
    <div class="cover-copy">
      <p class="cover-eyebrow"><span></span> The law school study library</p>
      <h1 id="cover-title">Your courses.<br>Your <em>study library.</em></h1>
      <p class="cover-lede">Outlines, rule charts, flashcards, and practice—all in one place.</p>
      <p class="cover-description">Search for a topic or browse every document by course below.</p>
      <button class="cover-search hero-search" type="button" data-open-search>
        ${icon('search')}<span>Search: try “404(b)” or “conflicts”</span><kbd>Ctrl K</kbd>
      </button>
      <div class="cover-actions"><a href="#courses">Browse the courses ${icon('arrow-right')}</a><span>Open in your browser. Keep a copy.</span></div>
    </div>
    <figure class="cover-art" aria-hidden="true">
      <span class="cover-wing cover-wing-l"></span>
      <span class="cover-arch"></span>
      <img src="${root}assets/statues/socrates-lg.webp" alt="" width="640" height="640" fetchpriority="high">
      <span class="cover-wing cover-wing-r"></span>
    </figure>
  </div>
  <div class="container cover-bottom"><p>Built by students.<br><strong>Shared for the next one.</strong></p><ul><li><strong>${subjects.length}</strong> ${subjects.length === 1 ? 'course' : 'courses'}</li><li><strong>${docs.length}</strong> documents</li>${totalQ ? `<li><strong>${totalQ.toLocaleString('en-US')}+</strong> practice questions</li>` : ''}</ul><a href="${root}library/">Enter the library ${icon('arrow-up-right')}</a></div>
</section>

<section class="container cover-courses" id="courses" aria-labelledby="courses-h">
  <div class="section-head"><div><p class="kicker">Browse the complete collection</p><h2 id="courses-h" class="section-title">Choose a course. Find your materials.</h2></div><a class="link-arrow" href="${root}library/">Search &amp; filter all ${docs.length} documents ${icon('arrow-right')}</a></div>
  <nav class="format-shortcuts" aria-label="Browse by document type"><span>Browse by format</span>${Object.entries(ctx.TYPES).filter(([type]) => docs.some(d => d.type === type)).map(([type, meta]) => `<a href="${root}library/?type=${type}">${icon(meta.icon)}${esc(meta.plural)} <small>${docs.filter(d => d.type === type).length}</small></a>`).join('')}</nav>
  <div class="course-browser" data-course-browser>
    <div class="course-directory"><label class="course-find" hidden data-course-find>Find a course<input type="search" placeholder="Search course names…" data-course-query></label><p class="directory-count" data-course-count>${subjects.length} courses</p><div class="course-options">${subjects.map(s => `<a class="course-option" href="${root}${ctx.P.subject(s)}" data-course-choice="${esc(s.slug)}" data-course-name="${esc(s.title)}" title="${esc(s.title)}">${icon(s.icon)}<span><span class="course-name">${esc(s.title)}</span><small>${plural(s.documents.length, 'document')}</small></span>${icon('chevron-right')}</a>`).join('')}</div><p hidden data-course-empty>No courses match. Try another name.</p></div>
    <div class="course-preview comprehensive-subjects" id="course-preview" tabindex="-1"><p class="course-preview-intro">Select a course to preview its materials, or open its full collection.</p>${subjects.map(s => `<div data-course-panel="${esc(s.slug)}" hidden>${subjectPanel(ctx, root, s)}</div>`).join('')}</div>
  </div>
  ${ctx.game?.total ? playBand(ctx, root) : ''}
</section>

<section class="section container" id="recently-opened" hidden aria-labelledby="ro-h">
  <div class="section-head">
    <div><p class="kicker">Pick up where you left off</p><h2 id="ro-h" class="section-title">Jump back in</h2></div>
  </div>
  <ul class="recent-strip" data-recent-list data-type-icons="${esc(JSON.stringify(Object.fromEntries(Object.values(ctx.TYPES).map((t) => [t.label, icon(t.icon)]))))}"></ul>
</section>

<section class="section container" aria-labelledby="recent-h">
  <div class="section-head">
    <div><p class="kicker">Fresh</p><h2 id="recent-h" class="section-title">Recently updated</h2></div>
    <a class="link-arrow" href="${root}library/?sort=updated">See all ${icon('arrow-right')}</a>
  </div>
  <div class="doc-grid">${recent.map((d) => docCard(ctx, root, d, { showSubject: true })).join('')}</div>
</section>

<section class="section container">
  <div class="share-band">
    <div class="share-band-text">
      <p class="kicker">Built by students, for students</p>
      <h2>Made something that helped you study?</h2>
      <p>Share your outline, flowchart, or practice set with everyone. Upload it in a minute, no account needed. Every submission is reviewed before it goes live.</p>
    </div>
    <a class="btn btn-gold" href="${root}contribute/">${icon('upload')} Share your work</a>
  </div>
</section>

<section class="section container">
  <div class="download-band">
    <div class="download-band-icon">${icon('package')}</div>
    <div class="download-band-text">
      <h2>Take it all offline</h2>
      <p>Every document in one ZIP: ${plural(docs.length, 'file')}, ${fmtSize(ctx.allZipSize)}. The HTML practice tools work offline in any browser.</p>
    </div>
    <a class="btn btn-primary" href="${root}files/all-study-materials.zip" download>${icon('download')} Download everything</a>
  </div>
</section>`;
  return layout(ctx, {
    root, title: '', body, active: 'home', bodyClass: 'page-home',
    jsonld: { '@context': 'https://schema.org', '@type': 'WebSite', name: config.title, url: config.url, description: config.tagline },
  });
}

export function library(ctx) {
  const root = '../';
  const { docs } = ctx;
  const body = `
<section class="page-head container">
  ${breadcrumbs(root, [['library/', 'Library']])}
  <h1 class="page-title">Library</h1>
  <p class="page-lede">Every document across every subject. Filter by subject or type, or search for a rule, case, or topic.</p>
</section>
<section class="container section-tight">
  ${filterBar(ctx, docs, { subjectFilter: true })}
  <div class="doc-grid" data-filter-list>${docs.map((d) => docCard(ctx, root, d, { showSubject: true })).join('')}</div>
  ${emptyState()}
</section>`;
  return layout(ctx, { root, title: 'Library', description: 'Browse every study document: outlines, rule charts, flowcharts, flashcards, and practice questions.', body, active: 'library', canonical: 'library/' });
}

export function subjectPage(ctx, s) {
  const root = '../../';
  const { P, TYPES } = ctx;
  const counts = {};
  for (const d of s.documents) counts[d.type] = (counts[d.type] || 0) + 1;
  const body = `
<section class="subject-hero" style="--accent:${s.accent}">
  <div class="container">
    ${breadcrumbs(root, [[P.subject(s), s.title]])}
    <div class="subject-hero-row">
      <span class="subject-hero-icon">${icon(s.icon)}</span>
      <div class="subject-hero-text">
        <h1 class="page-title">${esc(s.title)}</h1>
        <p class="page-lede">${esc(s.description)}</p>
        <ul class="type-pills">${Object.keys(TYPES).filter((k) => counts[k]).map((k) => `<li>${icon(TYPES[k].icon)} ${esc(counts[k] === 1 ? TYPES[k].label : TYPES[k].plural)} <span class="count">${counts[k]}</span></li>`).join('')}</ul>
      </div>
      <div class="subject-hero-actions">
        ${s.documents.length ? `<a class="btn btn-primary subject-hero-dl" href="${root}${P.zip(s)}" download>${icon('download')} Download all <span class="btn-sub">${fmtSize(s.zipSize)}</span></a>` : ''}
        ${ctx.game?.courses.some((c) => c.slug === s.slug) ? `<a class="btn btn-ghost subject-hero-play" href="${root}play/?course=${esc(s.slug)}">${icon('play')} Play in Sanctum Run</a>` : ''}
      </div>
    </div>
  </div>
</section>
<section class="container section-tight">
  ${s.documents.length > 3 ? filterBar(ctx, s.documents, { subjectFilter: false }) : ''}
  <div class="doc-grid" data-filter-list>${s.documents.map((d) => docCard(ctx, root, d)).join('')}</div>
  ${emptyState()}
</section>`;
  return layout(ctx, {
    root, title: s.title, description: s.description, body, active: s.slug, canonical: P.subject(s),
    jsonld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: s.title, description: s.description, url: ctx.config.url + P.subject(s) },
  });
}

/** Immersive document viewer: slim app bar + the document filling the screen. */
export function docPage(ctx, d) {
  const root = '../../../';
  const { P, TYPES, config } = ctx;
  const t = TYPES[d.type];
  const s = d.subject;
  const fileUrl = root + P.file(d);
  const isDocx = d.format.viewer === 'docx';
  const isFrame = d.format.viewer === 'frame';
  const related = s.documents.filter((x) => x !== d);
  const tocList = d.toc.length
    ? `<ol class="toc">${d.toc.map((h) => `<li class="toc-l${h.level}"><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ol>`
    : '';

  let stage;
  if (isDocx) {
    stage = `${tocList ? `<aside class="vtoc" id="toc-panel" aria-label="Contents">
      <div class="vtoc-head"><span>Contents</span><button class="icon-btn" type="button" data-panel-close aria-label="Close contents">${icon('x')}</button></div>
      ${tocList}
    </aside>` : ''}
    ${d.theme === 'structured' ? NAVE : ''}
    <div class="vscroll" data-scroll-root><article class="prose reader${d.theme ? ` prose-${esc(d.theme)}` : ''}"${d.theme === 'structured' ? ` data-angel="${angelFor(d.id)}"` : ''}>${d.html}</article></div>`;
  } else if (isFrame) {
    stage = `<div class="vframe-wrap"><div class="vloading" aria-hidden="true"><span class="spinner"></span>Loading ${esc(d.title)}…</div><iframe class="vframe" src="${fileUrl}" title="${esc(d.title)}" allow="fullscreen; clipboard-write"></iframe></div>`;
  } else {
    stage = `<div class="vscroll"><pre class="prose reader text-reader">${esc(d.text)}</pre></div>`;
  }

  const recent = { id: d.id, title: d.title, url: P.doc(d), subject: s.title, type: t.label, accent: s.accent, svg: icon(t.icon) };

  return `<!doctype html>
<html lang="en" data-root="${root}">
<head>
${head(ctx, {
    root, title: d.title, description: d.description, canonical: P.doc(d),
    extraHead: `<link rel="alternate" type="application/json" title="Document (JSON)" href="${root}${P.json(d)}">\n<link rel="alternate" type="text/plain" title="Document (plain text)" href="${root}${P.text(d)}">`,
    jsonld: {
      '@context': 'https://schema.org', '@type': 'LearningResource', name: d.title, description: d.description,
      learningResourceType: t.label, about: s.title, url: config.url + P.doc(d), dateModified: d.updated,
      encodingFormat: d.format.mime, keywords: d.tags.join(', '),
      isPartOf: { '@type': 'CollectionPage', name: s.title, url: config.url + P.subject(s) },
    },
  })}
</head>
<body class="is-viewer${isDocx ? ' is-docx' : ''}" style="--accent:${s.accent}" data-recent='${esc(JSON.stringify(recent))}'>
${GILT_DEFS}
<div class="viewer-app">
  <header class="vbar">
    <a class="vbar-back" href="${root}${P.subject(s)}" aria-label="Back to ${esc(s.title)}">${icon('arrow-left')}</a>
    <a class="brand-mark vbar-home" href="${root}" aria-label="Home">${LOGO}</a>
    <div class="vbar-title">
      <span class="vbar-kicker">${icon(t.icon)}<span>${esc(s.title)} · ${esc(t.label)}</span></span>
      <h1>${esc(d.title)}</h1>
    </div>
    <div class="vbar-actions">
      ${tocList ? `<button class="vbtn" type="button" data-panel-toggle="toc" aria-controls="toc-panel" aria-expanded="false" title="Contents">${icon('list')}<span>Contents</span></button>` : ''}
      <button class="vbtn" type="button" data-panel-toggle="info" aria-controls="info-panel" aria-expanded="false" title="Details">${icon('info')}<span>Details</span></button>
      ${isFrame ? `<button class="vbtn hide-touch" type="button" data-fullscreen title="Full screen">${icon('maximize')}<span>Full screen</span></button>` : ''}
      <button class="vbtn" type="button" data-share title="Share">${icon('share')}<span>Share</span></button>
      <a class="vbtn vbtn-primary" href="${fileUrl}" download="${esc(d.filename)}" title="Download">${icon('download')}<span>Download</span></a>
      ${d.format.mime === 'application/pdf' ? '' : ambienceControl('vbtn')}
      ${themeButton('vbtn vbtn-icon hide-mobile')}
    </div>
  </header>
  <main id="main" class="vstage">
    ${stage}
  </main>
  <aside class="vpanel" id="info-panel" aria-label="Document details" aria-hidden="true">
    <div class="sheet-grab" aria-hidden="true"></div>
    <div class="vpanel-head">
      <span class="vpanel-label">Details</span>
      <button class="icon-btn" type="button" data-panel-close aria-label="Close details">${icon('x')}</button>
    </div>
    <div class="vpanel-body">
      <span class="vpanel-tile">${icon(t.icon)}</span>
      <h2 class="vpanel-title">${esc(d.title)}</h2>
      <p class="vpanel-desc">${esc(d.description)}</p>
      <dl class="facts">
        <div><dt>Course</dt><dd><a href="${root}${P.subject(s)}">${esc(s.title)}</a></dd></div>
        <div><dt>Type</dt><dd>${esc(t.label)}</dd></div>
        <div><dt>Format</dt><dd>${esc(d.format.label)} · ${fmtSize(d.size)}</dd></div>
        ${d.questions ? `<div><dt>Questions</dt><dd>${d.questions}</dd></div>` : ''}
        ${d.contributor ? `<div><dt>Shared by</dt><dd>${esc(d.contributor)}</dd></div>` : ''}
        <div><dt>Updated</dt><dd>${fmtDate(d.updated)}</dd></div>
      </dl>
      ${d.tags.length ? `<ul class="tag-list">${d.tags.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <div class="vpanel-actions">
        <a class="btn btn-primary" href="${fileUrl}" download="${esc(d.filename)}">${icon('download')} Download ${esc(d.format.label)}</a>
        ${isFrame ? `<a class="btn btn-ghost" href="${fileUrl}" target="_blank" rel="noopener">${icon('external-link')} Open in new tab</a>` : `<button class="btn btn-ghost" type="button" data-print>${icon('printer')} Print</button>`}
      </div>
      ${related.length ? `<h3 class="vpanel-sub">More in ${esc(s.title)}</h3><ul class="doc-rows">${related.map((x) => docRow(ctx, root, x)).join('')}</ul>` : ''}
    </div>
  </aside>
  <div class="vscrim" data-panel-close></div>
</div>
<div class="toast" role="status" aria-live="polite" hidden></div>
<script type="module" src="${root}assets/app.js"></script>
</body>
</html>`;
}

/** "Share your work": the public submission form. Posts to config.submissions.endpoint. */
export function contribute(ctx) {
  const root = '../';
  const { config, subjects, TYPES } = ctx;
  const sub = config.submissions || {};
  const maxMB = sub.maxMB || 20;
  const body = `
<section class="page-head container contribute-head">
  ${breadcrumbs(root, [['contribute/', 'Share your work']])}
  <h1 class="page-title">Share your work</h1>
  <p class="page-lede">Made an outline, rule chart, flowchart, or practice set that helped you? Share it so everyone can study with it. You don't need an account.</p>
  <ol class="steps">
    <li><span class="step-icon">${icon('upload')}</span><strong>1. Upload</strong><span>Add your file and a few details. It takes about a minute.</span></li>
    <li><span class="step-icon">${icon('shield-check')}</span><strong>2. Review</strong><span>Every submission is checked by a person and by automated safety checks.</span></li>
    <li><span class="step-icon">${icon('sparkles')}</span><strong>3. Published</strong><span>Once approved, it shows up in the library for everyone, with credit to you if you like.</span></li>
  </ol>
</section>

<section class="container contribute-grid">
  <div class="contribute-main">
    <div class="notice" data-submit-closed hidden>${icon('clock')}<div><strong>Submissions aren't open yet.</strong><p>Check back soon. The form below shows what you'll be asked for.</p></div></div>

    <form class="submit-form" id="submit-form" data-endpoint="${esc(sub.endpoint || '')}" data-max-bytes="${maxMB * 1048576}" novalidate>
      <fieldset class="form-card">
        <legend><span class="num">1</span> Your file</legend>
        <label class="dropzone" data-dropzone>
          <input type="file" name="file" accept=".docx,.pdf,.html,.htm,.md,.txt" required data-file-input>
          <span class="dropzone-empty">
            <span class="dropzone-icon">${icon('cloud-upload')}</span>
            <strong>Drop your file here, or <u>choose a file</u></strong>
            <small>Word, PDF, HTML, Markdown, or text, up to ${maxMB} MB</small>
          </span>
          <span class="dropzone-file" hidden>
            <span class="tile">${icon('file-check')}</span>
            <span class="dropzone-file-text"><strong data-file-name></strong><small data-file-size></small></span>
            <button type="button" class="icon-btn" data-file-clear aria-label="Remove file">${icon('x')}</button>
          </span>
        </label>
      </fieldset>

      <fieldset class="form-card">
        <legend><span class="num">2</span> About it</legend>
        <div class="field-grid">
          <label class="field">
            <span class="field-label">Course</span>
            <select name="subject" required data-subject>
              <option value="" disabled selected>Choose a subject…</option>
              ${subjects.map((s) => `<option value="${esc(s.folder)}">${esc(s.title)}</option>`).join('')}
              <option value="__new__">Something else (new subject)…</option>
            </select>
          </label>
          <label class="field" data-new-subject hidden>
            <span class="field-label">New subject name</span>
            <input type="text" name="newSubject" maxlength="60" placeholder="e.g. Civil Procedure" autocomplete="off">
          </label>
          <label class="field">
            <span class="field-label">What kind of material is it?</span>
            <select name="type">
              ${Object.entries(TYPES).map(([k, t]) => `<option value="${k}"${k === 'outline' ? ' selected' : ''}>${esc(k === 'document' ? 'Other' : t.label)}</option>`).join('')}
            </select>
          </label>
          <label class="field field-wide">
            <span class="field-label">Title</span>
            <input type="text" name="title" required maxlength="120" placeholder="e.g. Civ Pro Outline: Personal Jurisdiction" autocomplete="off" data-title>
          </label>
          <label class="field field-wide">
            <span class="field-label">Short description <em>optional</em></span>
            <textarea name="description" rows="3" maxlength="600" placeholder="What does it cover? Which weeks or chapters? Anything people should know?" data-count></textarea>
            <small class="field-hint"><span data-count-out>0</span>/600</small>
          </label>
        </div>
      </fieldset>

      <fieldset class="form-card">
        <legend><span class="num">3</span> Credit <em>optional</em></legend>
        <label class="field">
          <span class="field-label">Name or initials to show</span>
          <input type="text" name="contributor" maxlength="60" placeholder="e.g. Jordan K." autocomplete="nickname">
          <small class="field-hint">Shown publicly as “Shared by …”. Leave blank to stay anonymous. Please don't enter an email address.</small>
        </label>
      </fieldset>

      <fieldset class="form-card">
        <legend><span class="num">4</span> Please confirm</legend>
        <label class="check"><input type="checkbox" name="confirmOwn" value="yes" required><span>I made this, or I have permission from the person who did.</span></label>
        <label class="check"><input type="checkbox" name="confirmPrivacy" value="yes" required><span>It doesn't contain personal information about other students, like names, grades, or contact details.</span></label>
        <label class="check"><input type="checkbox" name="confirmCopyright" value="yes" required><span>It isn't copied from paid or copyrighted materials, such as commercial outlines or question banks.</span></label>
      </fieldset>

      <div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
      ${sub.turnstileSiteKey ? `<div class="cf-turnstile" data-sitekey="${esc(sub.turnstileSiteKey)}"></div><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : ''}

      <div class="form-error" role="alert" data-form-error hidden></div>
      <div class="submit-row">
        <button class="btn btn-primary btn-lg" type="submit" data-submit>${icon('send')} <span>Submit for review</span></button>
        <p class="submit-note">${icon('lock')} Nothing is published until it's been reviewed.</p>
      </div>
    </form>

    <div class="submit-success" data-submit-success hidden tabindex="-1">
      <span class="success-icon">${icon('circle-check')}</span>
      <h2>Thank you! Your submission is in.</h2>
      <p>Your reference number is <code data-reference></code>. It will be reviewed soon, and once it's approved it will show up in the library.</p>
      <div class="head-actions">
        <button class="btn btn-primary" type="button" data-submit-another>${icon('plus')} Share another</button>
        <a class="btn btn-ghost" href="${root}library/">${icon('library')} Browse the library</a>
      </div>
    </div>
  </div>

  <aside class="contribute-aside">
    <div class="aside-card">
      <h2>${icon('thumbs-up')} Great to share</h2>
      <ul class="tick-list">
        <li>Outlines, attack sheets, and rule charts you wrote</li>
        <li>Flowcharts and diagrams</li>
        <li>Practice questions you wrote yourself</li>
        <li>Flashcards and study tools</li>
      </ul>
    </div>
    <div class="aside-card">
      <h2>${icon('ban')} Please don't share</h2>
      <ul class="cross-list">
        <li>Commercial outlines or paid question banks</li>
        <li>Graded exams or anything with a grade on it</li>
        <li>Other students' work without their OK</li>
        <li>Names, emails, or details about classmates</li>
      </ul>
    </div>
    <details class="aside-card faq">
      <summary>What happens after I submit?</summary>
      <p>Your file goes into a private review queue. A reviewer opens it, checks it against the guidelines, and either publishes it or declines it. Automated checks also look for personal information and unsafe content.</p>
    </details>
    <details class="aside-card faq">
      <summary>Can I update or remove something later?</summary>
      <p>Yes. To update a document, submit the new version with the same title and say in the description that it replaces the old one. To have something removed, contact the site owner.</p>
    </details>
    <details class="aside-card faq">
      <summary>Which file type is best?</summary>
      <p>Word (.docx) works best for outlines and charts. It becomes a readable web page and stays downloadable. PDF and interactive HTML study tools work too.</p>
    </details>
  </aside>
</section>`;
  return layout(ctx, { root, title: 'Share your work', description: 'Share your outlines, rule charts, flowcharts, and practice questions with the study library. Every submission is reviewed before publishing.', body, active: 'contribute', canonical: 'contribute/' });
}

/**
 * Sanctum Run, the study game at /play/: a full-screen canvas (src/game/engine.js) under
 * HTML screens and the question gates (src/game/game.js). Its data comes from scripts/game.mjs.
 */
export function play(ctx) {
  const root = '../';
  const { game } = ctx;
  const heart = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.5-9.3C1 8.2 3.1 4.5 6.8 4.5c2.1 0 3.6 1.1 4.6 2.6.9-1.5 2.5-2.6 4.6-2.6 3.7 0 5.8 3.7 4.3 7.2C19.5 16.4 12 21 12 21z"/></svg>';
  const choice = (name, value, label, sub) => `<button type="button" class="g-pill" data-${name}="${value}" aria-pressed="false"><strong>${label}</strong><small>${sub}</small></button>`;
  const sound = (cls = 'g-btn g-btn-ghost') => `<button type="button" class="${cls}" data-sound aria-pressed="true">${icon('volume-2')}<span>Sound on</span></button>`;
  return `<!doctype html>
<html lang="en" data-root="${root}">
<head>
${head(ctx, { root, title: 'Sanctum Run', description: `A running game for your practice questions: ${game.total.toLocaleString('en-US')} questions from the study library, asked at the gates of a falling sanctuary.`, canonical: 'play/' })}
<link rel="stylesheet" href="game.css">
</head>
<body class="game" data-realm="divine" data-screen="title">
<canvas id="world" aria-hidden="true"></canvas>
<div class="g-veil" aria-hidden="true"></div>

<header class="g-hud" hidden>
  <div class="g-hud-left">
    <p class="g-score"><span class="sr-only">Score</span><strong id="hud-score">0</strong></p>
    <p class="g-counts"><span class="g-laurel" title="Laurels"><i></i><b id="hud-laurels">0</b></span><span class="g-insight" title="Insight: strikes out a wrong answer at a gate"><i></i><b id="hud-insight">0</b></span><span class="g-streak" id="hud-streak"></span></p>
  </div>
  <div class="g-hud-mid">
    <p class="g-gatecount">Gate <strong id="hud-gate">1 / 1</strong></p>
    <div class="g-meter" id="hud-corruption" role="meter" aria-label="Corruption" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span><em id="hud-realm">Divine</em></div>
  </div>
  <div class="g-hud-right">
    <p class="g-hearts" aria-label="Hearts">${heart.replace('<svg', '<svg class="g-heart"').repeat(3)}</p>
    ${sound('g-iconbtn')}
    <button type="button" class="g-iconbtn" id="pause-btn" aria-label="Pause">${icon('pause')}</button>
  </div>
</header>
<p class="g-hint" id="controls-hint" hidden><span class="hide-touch">← → lanes and turns · ↑ or Space jump · ↓ slide · Esc pause</span><span class="show-touch">Swipe to turn, jump and slide · tap to jump</span></p>

<section class="g-screen g-title" id="title">
  <div class="g-title-inner">
    <p class="g-eyebrow">${esc(ctx.config.shortTitle)} · Study game</p>
    <h1 class="g-logo">Sanctum <em>Run</em></h1>
    <p class="g-tag">Divine &amp; Fallen</p>
    <p class="g-lede">Run the sanctuary as Socrates, Plato or Aristotle. Every gate asks a question from your practice sets. Answer right and the light holds. Answer wrong and the sanctum falls, and the Fallen gain on you.</p>
    <div class="g-actions">
      <button type="button" class="g-btn g-btn-primary" id="start" disabled>Play</button>
      <button type="button" class="g-btn g-btn-ghost" id="howto-open">How to play</button>
    </div>
    <p class="g-status" id="title-status">Loading the sanctuary…</p>
    <p class="g-best" id="best"></p>
    <a class="g-back" href="${root}">${icon('arrow-left')} Back to the study library</a>
  </div>
  <div class="g-howto" id="howto" hidden role="dialog" aria-labelledby="howto-h">
    <h2 id="howto-h">How to play</h2>
    <dl>
      <div><dt>Run</dt><dd>You run on your own. <kbd>←</kbd> <kbd>→</kbd> change lanes, and at a corner they turn. <kbd>↑</kbd> or <kbd>Space</kbd> jumps, <kbd>↓</kbd> slides. On a phone, swipe, or tap to jump.</dd></div>
      <div><dt>Gates</dt><dd>Each gate stops you for a question. There's no clock: take as long as you need. Use the keys <kbd>1</kbd>–<kbd>4</kbd> or tap an answer.</dd></div>
      <div><dt>Corruption</dt><dd>A wrong answer spreads corruption. At half, the sanctum falls: the world turns, your philosopher grows horns, and the pursuer becomes a horned shade that runs closer and faster. Right answers drive it back, and a streak drives it back harder. If corruption overflows, the Fallen take a heart.</dd></div>
      <div><dt>Review</dt><dd>When you miss, the gate shows the explanation and a link to the part of the course outline that covers it. Missed questions are saved, so you can run just those later.</dd></div>
      <div><dt>Pickups</dt><dd>Laurels are points, worth double in the fallen realm. A wisdom scroll gives Insight, which strikes out a wrong answer at a gate. The aegis blocks one hit.</dd></div>
      <div><dt>Hearts</dt><dd>Obstacles, falls and overflowing corruption each cost a heart. Lose all three and the Fallen catch you, but you can rise again and keep your place.</dd></div>
    </dl>
    <button type="button" class="g-btn g-btn-primary" id="howto-close">Got it</button>
  </div>
</section>

<section class="g-screen g-setup" id="setup" hidden aria-labelledby="setup-h">
  <div class="g-panel">
    <header class="g-setup-head">
      <button type="button" class="g-iconbtn" id="setup-back" aria-label="Back">${icon('arrow-left')}</button>
      <h2 id="setup-h">Prepare your run</h2>
    </header>
    <h3 class="g-step"><span>1</span> Courses</h3>
    <div class="g-courses" id="courses"></div>
    <h3 class="g-step"><span>2</span> Practice sets</h3>
    <div class="g-sets" id="sets"></div>
    <h3 class="g-step"><span>3</span> Your philosopher</h3>
    <div class="g-chars" id="characters"></div>
    <h3 class="g-step"><span>4</span> The run</h3>
    <div class="g-opts">
      <div class="g-optrow" role="group" aria-label="Distance between gates">
        <span class="g-optlabel">Gates</span>
        ${choice('spacing', 'frequent', 'Frequent', 'More questions, less running')}${choice('spacing', 'standard', 'Standard', 'A balance')}${choice('spacing', 'sparse', 'Sparse', 'Longer runs between')}
      </div>
      <div class="g-optrow" role="group" aria-label="Running speed">
        <span class="g-optlabel">Pace</span>
        ${choice('pace', 'gentle', 'Gentle', 'Slower, more forgiving')}${choice('pace', 'standard', 'Standard', 'The intended speed')}${choice('pace', 'swift', 'Swift', 'For quick fingers')}
      </div>
      <label class="g-toggle"><input type="checkbox" id="shuffled"> <span>Shuffle the questions</span></label>
      <label class="g-toggle"><input type="checkbox" id="missed-only"> <span>Only questions I've missed before</span></label>
    </div>
    <div class="g-begin">
      <p id="begin-count"></p>
      <button type="button" class="g-btn g-btn-primary" id="begin">Begin the run</button>
    </div>
  </div>
</section>

<section class="g-screen g-center" id="loading" hidden>
  <div class="g-panel g-small">
    <h2>Entering the sanctuary</h2>
    <div class="g-bar" id="load-bar"><span></span></div>
    <p class="g-status" id="load-status">Gathering the questions and the art…</p>
  </div>
</section>

<div class="g-gate" id="gate" hidden role="dialog" aria-modal="true" aria-labelledby="gate-kicker">
  <div class="g-gate-card">
    <div class="g-guardian" id="gate-guardian" aria-hidden="true"></div>
    <div class="g-gate-body">
      <p class="g-gate-kicker" id="gate-kicker"></p>
      <p class="g-gate-set" id="gate-set"></p>
      <div class="g-stem" id="gate-stem"></div>
      <ol class="g-options" id="gate-options"></ol>
      <button type="button" class="g-insight-btn" id="gate-insight" hidden>Use Insight to strike a wrong answer <b id="gate-insight-n">0</b></button>
      <div class="g-result" id="gate-result" hidden aria-live="polite"></div>
      <button type="button" class="g-btn g-btn-primary g-continue" id="gate-continue" hidden>Run on</button>
    </div>
  </div>
</div>

<section class="g-screen g-center" id="pause" hidden aria-labelledby="pause-h">
  <div class="g-panel g-small">
    <h2 id="pause-h">Paused</h2>
    <div class="g-stack">
      <button type="button" class="g-btn g-btn-primary" id="resume">Resume</button>
      ${sound()}
      <button type="button" class="g-btn g-btn-ghost" id="quit">End the run</button>
    </div>
  </div>
</section>

<section class="g-screen g-center" id="fallen" hidden aria-labelledby="fallen-h">
  <div class="g-panel g-small g-fallen">
    <p class="g-eyebrow">The pursuer has you</p>
    <h2 id="fallen-h">The Fallen caught you.</h2>
    <p id="fallen-stats"></p>
    <p class="g-note">Rise again with full hearts and keep your place in the questions, or end the run and see what to review.</p>
    <div class="g-stack">
      <button type="button" class="g-btn g-btn-primary" id="rise">Rise again</button>
      <button type="button" class="g-btn g-btn-ghost" id="give-up">End the run</button>
    </div>
  </div>
</section>

<section class="g-screen g-center" id="summary" hidden aria-labelledby="summary-title">
  <div class="g-panel g-summary">
    <h2 id="summary-title">You ascend.</h2>
    <p id="summary-lede"></p>
    <dl class="g-stats" id="summary-stats"></dl>
    <div class="g-missed" id="summary-missed"></div>
    <div class="g-actions">
      <button type="button" class="g-btn g-btn-primary" id="retry-missed">Run the missed ones</button>
      <button type="button" class="g-btn g-btn-ghost" id="new-run">New run</button>
      <a class="g-btn g-btn-ghost" href="${root}">Study library</a>
    </div>
  </div>
</section>

<noscript><p class="g-noscript">Sanctum Run needs JavaScript. The practice sets work on their own in the <a href="${root}library/?type=practice">library</a>.</p></noscript>
<script type="module" src="game.js"></script>
</body>
</html>`;
}

export function notFound(ctx) {
  const root = ctx.config.basePath;
  const body = `<section class="container not-found">
  <p class="nf-code">404</p>
  <h1 class="page-title">That page has been overruled.</h1>
  <p class="page-lede">The page you're looking for doesn't exist or has moved. Try searching the library instead.</p>
  <div class="head-actions">
    <a class="btn btn-primary" href="${root}">${icon('house')} Go home</a>
    <button class="btn btn-ghost" type="button" data-open-search>${icon('search')} Search</button>
  </div>
</section>`;
  return layout(ctx, { root, title: 'Not found', body });
}

/**
 * Owner-only editor for document titles and descriptions, at /admin/. Unlinked and noindexed.
 * It holds no secrets: assets/admin.js signs in with the owner's GitHub token and commits
 * edits to content/<Subject>/subject.json through the GitHub API, so GitHub decides who can edit.
 */
export function admin(ctx) {
  const root = '../';
  const repo = new URL(ctx.config.repo).pathname.replace(/^\/|\/$/g, '');
  const body = `
<section class="page-head container admin-head">
  <h1 class="page-title">Edit documents</h1>
  <p class="page-lede">Change the titles and descriptions shown on the site. Saving commits the change to GitHub, and the site updates about two minutes later.</p>
</section>
<section class="container admin" data-admin data-repo="${esc(repo)}">
  <noscript><div class="notice">${icon('info')}<div><strong>JavaScript is required.</strong><p>Turn it on to use the editor.</p></div></div></noscript>

  <form class="form-card admin-signin" data-signin hidden>
    <legend>${icon('lock')} Sign in</legend>
    <p class="field-hint">Paste a GitHub fine-grained personal access token for this repository with <strong>Contents: Read and write</strong>. It's sent only to GitHub and is forgotten when you close this tab. Your browser's password manager can save it for you.</p>
    <input type="text" name="username" value="GitHub token" autocomplete="username" hidden>
    <label class="field">
      <span class="field-label">GitHub token</span>
      <input type="password" name="token" required autocomplete="current-password" spellcheck="false" autocapitalize="off">
    </label>
    <p class="admin-error" role="alert" data-signin-error hidden></p>
    <div class="admin-actions">
      <button class="btn btn-primary" type="submit" data-signin-submit>${icon('shield-check')} Sign in</button>
      <a class="btn btn-ghost" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">${icon('external-link')} Create a token</a>
    </div>
  </form>

  <div class="admin-editor" data-editor hidden>
    <div class="admin-bar">
      <span class="admin-who" data-who></span>
      <button class="btn btn-ghost" type="button" data-reload>Reload</button>
      <button class="btn btn-ghost" type="button" data-signout>Sign out</button>
    </div>
    <div class="notice" role="status" data-status hidden></div>
    <div data-subjects><p class="admin-loading"><span class="spinner"></span> Loading documents…</p></div>
    <div class="admin-save" data-savebar>
      <span class="admin-count" data-count>No changes</span>
      <button class="btn btn-ghost" type="button" data-discard disabled>Discard</button>
      <button class="btn btn-primary" type="button" data-save disabled>${icon('circle-check')} Save changes</button>
    </div>
  </div>
</section>
<script type="module" src="${root}assets/admin.js"></script>`;
  return layout(ctx, { root, title: 'Edit documents', body, canonical: 'admin/', bodyClass: 'is-admin', extraHead: '<meta name="robots" content="noindex, nofollow">' });
}

export function openapi(config) {
  const ref = (n) => ({ $ref: `#/components/schemas/${n}` });
  const json = (schema) => ({ description: 'OK', content: { 'application/json': { schema } } });
  return {
    openapi: '3.1.0',
    info: { title: `${config.title} API`, version: '1.0.0', description: 'Read-only static API for the study library. All endpoints are GET requests for static files.' },
    servers: [{ url: config.url.replace(/\/$/, '') }],
    paths: {
      '/api/catalog.json': { get: { operationId: 'getCatalog', summary: 'List all subjects and documents', responses: { 200: json(ref('Catalog')) } } },
      '/api/subjects/{subject}.json': {
        get: {
          operationId: 'getSubject', summary: 'Get one subject with its documents',
          parameters: [{ name: 'subject', in: 'path', required: true, schema: { type: 'string' }, description: 'Subject slug, e.g. "evidence"' }],
          responses: { 200: json(ref('Subject')) },
        },
      },
      '/api/documents/{subject}/{doc}.json': {
        get: {
          operationId: 'getDocument', summary: 'Get one document with extracted text',
          parameters: [
            { name: 'subject', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'doc', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { 200: json({ allOf: [ref('Document'), { type: 'object', properties: { text: { type: 'string' } } }] }) },
        },
      },
      '/api/search-index.json': { get: { operationId: 'getSearchIndex', summary: 'Compact search index', responses: { 200: json({ type: 'array', items: { type: 'object' } }) } } },
    },
    components: {
      schemas: {
        Document: {
          type: 'object',
          properties: {
            id: { type: 'string' }, subject: { type: 'string' }, subjectTitle: { type: 'string' }, slug: { type: 'string' },
            title: { type: 'string' }, description: { type: 'string' }, type: { type: 'string' }, typeLabel: { type: 'string' },
            format: { type: 'string' }, mimeType: { type: 'string' }, originalFilename: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } }, questions: { type: ['integer', 'null'] },
            sizeBytes: { type: 'integer' }, updated: { type: 'string', format: 'date-time' },
            headings: { type: 'array', items: { type: 'string' } },
            urls: { type: 'object', properties: { page: { type: 'string' }, file: { type: 'string' }, download: { type: 'string' }, text: { type: 'string' }, json: { type: 'string' } } },
          },
        },
        Subject: {
          type: 'object',
          properties: {
            id: { type: 'string' }, slug: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' },
            documentCount: { type: 'integer' }, documents: { type: 'array', items: ref('Document') },
          },
        },
        Catalog: {
          type: 'object',
          properties: {
            schemaVersion: { type: 'string' }, site: { type: 'object' },
            subjects: { type: 'array', items: { type: 'object' } }, documents: { type: 'array', items: ref('Document') },
          },
        },
      },
    },
  };
}
