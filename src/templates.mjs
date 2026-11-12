// HTML templates for every page type. Pure functions: (ctx, data) => string.
// All internal links are relative to the current page (via `root`), so the site
// works under any base path: GitHub Pages project URL, custom domain, or localhost.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { topicsButton } from './assets/topic-picker.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Stamped on the stylesheet link so browsers fetch the new styles after each deploy
// (GitHub Pages lets them reuse a cached copy otherwise).
const CSS_VERSION = createHash('sha1').update(fs.readFileSync(path.join(ROOT, 'src', 'assets', 'styles.css'))).digest('hex').slice(0, 10);
// The same for the page scripts; app.js passes its version on to the scenery module it loads.
const jsHash = createHash('sha1');
for (const f of ['app.js', 'ambience.js', 'shuffle.js', 'answer-log.js', 'stats.js', 'topic-picker.js']) jsHash.update(fs.readFileSync(path.join(ROOT, 'src', 'assets', f)));
const JS_VERSION = jsHash.digest('hex').slice(0, 10);
// Crypt Survivors (/survivors/) loads its stylesheet and entry module with a version from all its files.
const svHash = createHash('sha1');
for (const f of fs.readdirSync(path.join(ROOT, 'src', 'survivors')).sort()) svHash.update(fs.readFileSync(path.join(ROOT, 'src', 'survivors', f)));
const SV_VERSION = svHash.digest('hex').slice(0, 10);

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

// Site logo: the youthful marble Socrates with blue light (painted by styles.css).
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
const fmtDuration = (sec) => `${Math.floor(Math.round(sec) / 60)}:${String(Math.round(sec) % 60).padStart(2, '0')}`;
// Wrap each word so the home headline can rise in one word at a time (see .hero-title .w).
const riseWords = (html) => html.split(' ').map((w, i) => `<span class="w" style="--i:${i}">${w}</span>`).join(' ');

const FONTS = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@500..700&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600&family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..600&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap';

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
<link rel="icon" href="${root}assets/statues/socrates-david-v8-favicon.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="${root}assets/statues/socrates-david-v8-touch.png">
<link rel="alternate" type="application/json" title="Catalog (JSON)" href="${root}api/catalog.json">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="${root}assets/styles.css?v=${CSS_VERSION}">
<script>(function(){var d=document.documentElement;d.dataset.theme='light';try{var t=localStorage.getItem('theme'),a=localStorage.getItem('ambience')||'off',s=localStorage.getItem('scene');if(t)d.dataset.theme=t;if(a!=='off')d.dataset.ambience=a;if(s)d.dataset.scene=s;}catch(e){}})();</script>
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
      ${ctx.game?.total ? `<a href="${root}stats/"${active === 'stats' ? ' aria-current="page"' : ''}>Your stats</a>` : ''}
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
  ${active === 'home' ? `<nav class="course-nav" aria-label="Shortcuts"><div class="container course-nav-inner"><a href="#courses">${icon('layout-grid')} Courses <small>${subjects.length}</small></a><a href="${root}library/?type=practice">${icon('list-checks')} Practice questions <small>${docs.filter((d) => d.type === 'practice').length}</small></a><a href="#recent-h">${icon('clock')} Recently updated</a>${ctx.game?.total ? `<a href="${root}stats/">${icon('chart-column')} Your stats</a>` : ''}<a class="course-nav-all" href="${root}files/all-study-materials.zip" download>${icon('download')} Download everything</a></div></nav>` : ''}
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
      ${ctx.game?.total ? `<a href="${root}stats/">Your stats</a>` : ''}
      <a href="${root}files/all-study-materials.zip" download>Download everything</a>
      <button type="button" class="footer-progress" data-sheet-open="progress-sheet">Back up your progress</button>
    </nav>
  </div>
  <div class="container footer-bottom">${plural(docs.length, 'document')} · Updated ${fmtDate(ctx.generatedAt)}</div>
</footer>

<nav class="tabbar" aria-label="Quick navigation">
  <a href="${root}"${active === 'home' ? ' aria-current="page"' : ''}>${icon('house')}<span>Home</span></a>
  <button type="button" data-sheet-open="subjects-sheet"${subjects.some((s) => s.slug === active) ? ' aria-current="page"' : ''}>${icon('layout-grid')}<span>Courses</span></button>
  <button type="button" data-open-search>${icon('search')}<span>Search</span></button>
  <a href="${root}library/"${active === 'library' ? ' aria-current="page"' : ''}>${icon('library')}<span>Library</span></a>
  ${ctx.game?.total ? `<a href="${root}stats/"${active === 'stats' ? ' aria-current="page"' : ''}>${icon('chart-column')}<span>Stats</span></a>` : ''}
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
${progressSheet()}
${palette()}
<script type="module" src="${root}assets/app.js?v=${JS_VERSION}"></script>
</body>
</html>`;
}

// Practice sets save answers and flags in this browser (localStorage). This sheet downloads all of it as
// one file and restores it on another device or browser: progress that moves, with no accounts.
const progressSheet = () => `<div class="sheet" id="progress-sheet" hidden>
  <div class="sheet-scrim" data-sheet-close></div>
  <div class="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="progress-sheet-title">
    <div class="sheet-grab" aria-hidden="true"></div>
    <div class="sheet-head"><h2 id="progress-sheet-title">Your progress</h2><button class="icon-btn" type="button" data-sheet-close aria-label="Close">${icon('x')}</button></div>
    <div class="progress-body">
      <p>Your answers, flags, and settings save automatically in this browser. Nothing is uploaded, and there's no account.</p>
      <p>To move them to another device or browser, download a backup here and restore it there. Restoring replaces the saved progress for the sets in the backup and keeps everything else.</p>
      <div class="progress-actions">
        <button class="btn btn-primary" type="button" data-progress-save>${icon('download')} Download a backup</button>
        <button class="btn btn-ghost" type="button" data-progress-restore>${icon('upload')} Restore a backup</button>
        <input type="file" accept=".json,application/json" data-progress-file hidden>
      </div>
      <p class="progress-status" data-progress-status role="status" aria-live="polite"></p>
      <p class="progress-note">Safari on iPhone and Mac clears a site's saved data after about a week without a visit, so back up now and then.</p>
    </div>
  </div>
</div>`;

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
  const meta = [d.format.label, fmtSize(d.size), d.questions ? `${d.questions} questions` : null, d.cards ? plural(d.cards, 'card') : null, d.tracks ? plural(d.tracks.length, 'track') : null, d.contributor ? `Shared by ${d.contributor}` : null, `Updated ${fmtShortDate(d.updated)}`].filter(Boolean);
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
    ${d.zipped ? `<a class="dl-btn" href="${root}${P.file(d)}" download="${esc(d.filename)}" aria-label="Download ${esc(d.title)} (${esc(d.format.label)}, ${fmtSize(d.size)})" title="Download">${icon('download')}</a>` : ''}
  </div>
</article>`;
}

function docRow(ctx, root, d, extra = '') {
  const t = ctx.TYPES[d.type];
  return `<li><a class="doc-row" href="${root}${ctx.P.doc(d)}" style="--accent:${d.subject.accent}"${extra}>
    <span class="tile">${icon(t.icon)}</span>
    <span class="doc-row-text"><strong>${esc(d.title)}</strong><small>${esc(t.label)}${d.questions ? ` · ${d.questions} questions` : ''}${d.cards ? ` · ${plural(d.cards, 'card')}` : ''}${d.tracks ? ` · ${plural(d.tracks.length, 'track')}` : ''}</small></span>
    ${icon('chevron-right', 'chev')}
  </a></li>`;
}

// Course directory (homepage): every course at once, each listing its materials as plain labeled
// links, so anything is one click away. A kind of material with one document opens it; with
// several, the course page opens filtered to that kind.
function courseCard(ctx, root, s) {
  const { TYPES, P } = ctx;
  const kinds = Object.entries(TYPES)
    .map(([type, meta]) => ({ type, meta, docs: s.documents.filter((d) => d.type === type) }))
    .filter((k) => k.docs.length);
  const href = (k) => (k.docs.length === 1 ? `${root}${P.doc(k.docs[0])}` : `${root}${P.subject(s)}?type=${k.type}`);
  // "Document" says nothing on its own, so a lone one goes by its title (less the course name).
  const own = (t) => (t.toLowerCase().startsWith(`${s.title.toLowerCase()} `) ? t.slice(s.title.length + 1) : t);
  const label = (k) => (k.docs.length > 1 ? k.meta.plural : k.type === 'document' ? own(k.docs[0].title) : k.meta.label);
  const kind = (k) => `<li><a href="${href(k)}">${icon(k.meta.icon)}<span>${esc(label(k))}</span>${k.docs.length > 1 ? `<small>${k.docs.length}</small>` : ''}</a></li>`;
  const q = s.documents.reduce((n, d) => n + (d.questions || 0), 0);
  return `<li class="course-card" style="--accent:${s.accent}">
    <a class="course-card-head" href="${root}${P.subject(s)}">
      <span class="tile">${icon(s.icon)}</span>
      <span class="course-card-text"><strong>${esc(s.title)}</strong><small>${plural(s.documents.length, 'document')}${q ? ` · ${q.toLocaleString('en-US')}+ questions` : ''}</small></span>
      ${icon('chevron-right', 'chev')}
    </a>
    ${kinds.length ? `<ul class="course-kinds" aria-label="${esc(s.title)} materials">${kinds.map(kind).join('')}</ul>` : '<p class="course-none">Nothing here yet.</p>'}
  </li>`;
}

// Scenery behind the homepage cover (assets/scenes/): each place has a divine form by day and a
// fallen one by night. The first is the default; app.js wires the picker and remembers the choice.
const SCENES = [
  { id: 'archive', label: 'Archive', day: 'Celestial Archive', night: 'Forbidden Archive' },
  { id: 'sanctuary', label: 'Sanctuary', day: 'Sanctuary of Dawn', night: 'Sanctuary of Ash' },
  { id: 'grove', label: 'Grove', day: 'Elysian Grove', night: 'Blighted Grove' },
];
// Hidden until app.js wires it up, so it never shows as dead buttons without JavaScript.
const scenePicker = () => `<div class="scene-pick" role="radiogroup" aria-label="Cover scene" data-scene-pick hidden><span class="scene-pick-label">Scene</span>${SCENES.map((s, i) => `<button type="button" role="radio" aria-checked="${i === 0}" data-scene-set="${s.id}" aria-label="${s.label}" title="${s.day} · ${s.night}" class="scene-dot scene-dot-${s.id}"></button>`).join('')}</div>`;

// The way into Shuffle mode, under the course browser (and above the games, in a local build that has them).
function shuffleBand(ctx, root) {
  const { game } = ctx;
  const sets = game.courses.reduce((n, c) => n + c.sets.length, 0);
  return `<a class="shuffle-band" href="${root}shuffle/">
    <span class="shuffle-band-icon" aria-hidden="true">${icon('shuffle')}</span>
    <span class="shuffle-band-text">
      <span class="kicker">Practice · Mix your sets</span>
      <span class="shuffle-band-title">Shuffle mode</span>
      <span class="shuffle-band-desc">Load several practice sets at once, from one course or many, and answer their questions in one shuffled stack. Variations keep the question they build on a tap away.</span>
      <span class="shuffle-band-meta">${game.total.toLocaleString('en-US')} questions · ${plural(sets, 'practice set')} · ${plural(game.courses.length, 'course')}</span>
    </span>
    <span class="btn btn-primary shuffle-band-cta">${icon('shuffle')} Start shuffling</span>
  </a>`;
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

// The way into Crypt Survivors, under Sanctum Run: its survivor among the dead, drawn from the game's
// own sprite atlas (CC0 crawl/tiles art) at whole-pixel scale.
function survivorsBand(ctx, root) {
  const { game } = ctx;
  const sets = game.courses.reduce((n, c) => n + c.sets.length, 0);
  const atlas = ctx.survivors?.atlas;
  const fig = (id, cls, scale) => {
    const f = atlas?.frames[id];
    if (!f) return '';
    // The URL goes inline: inside a custom property it would resolve against the stylesheet instead of the page.
    return `<span class="sv-band-fig ${cls}" style="background-image:url('${root}survivors/pack/atlas.png');width:${32 * scale}px;height:${32 * scale}px;background-size:${atlas.width * scale}px ${atlas.height * scale}px;background-position:-${f[0] * scale}px -${f[1] * scale}px"></span>`;
  };
  return `<a class="sv-band" href="${root}survivors/">
    <span class="sv-band-art" aria-hidden="true">${fig('boss-reaper', 'sv-band-boss', 4)}${fig('foe-bat', 'sv-band-bat', 2)}${fig('foe-skeleton', 'sv-band-skel', 2)}${fig('foe-vampire', 'sv-band-vamp', 2)}${fig('gem-1', 'sv-band-gem', 1.5)}${fig('hero-advocate', 'sv-band-hero', 3)}</span>
    <span class="sv-band-text">
      <span class="kicker">Study game · New</span>
      <span class="sv-band-title">Crypt <em>Survivors</em></span>
      <span class="sv-band-desc">Hold a crypt of the restless dead for fifteen minutes while your weapons fire on their own. Every level-up asks one of your practice questions: answer right and choose a boon, answer wrong and choose your corruption.</span>
      <span class="sv-band-meta">${game.total.toLocaleString('en-US')} questions · ${plural(sets, 'practice set')} · ${plural(game.courses.length, 'course')}</span>
    </span>
    <span class="btn btn-primary sv-band-cta">${icon('skull')} Enter the crypt</span>
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
  <span class="cover-scene" aria-hidden="true"></span>
  <div class="container cover-grid">
    <div class="cover-copy">
      <p class="cover-eyebrow"><span></span>The Law School Study Library<span></span></p>
      <h1 id="cover-title"><span class="cover-h1-top">${riseWords('Study<b>.</b> Argue<b>.</b>')}</span> <span class="cover-h1-gilt" data-text="Triumph."><em>Triumph.</em><i class="cover-glint"></i><i class="cover-glint"></i></span><span class="cover-flourish" aria-hidden="true"><i></i></span></h1>
      <p class="cover-lede">Outlines, rule charts, flashcards, and thousands of practice questions for every course, built by the students who sat in your seat.</p>
      <button class="cover-search hero-search" type="button" data-open-search>
        ${icon('search')}<span>Search: try “404(b)” or “conflicts”</span><kbd>Ctrl K</kbd>
      </button>
      <div class="cover-actions">
        <a class="btn btn-gold" href="#courses">${icon('arrow-down')} Pick your course</a>
        ${ctx.game?.total ? `<a class="btn btn-cover" href="${root}shuffle/">${icon('list-checks')} Practice questions</a>` : ''}
      </div>
      <a class="cover-continue" href="${root}" data-continue hidden>${icon('history')}<span>Pick up where you left off: <strong data-continue-title></strong></span>${icon('arrow-right')}</a>
    </div>
    <figure class="cover-art" aria-hidden="true">
      <span class="cover-wing cover-wing-l"></span>
      <span class="cover-arch"></span>
      <img src="${root}assets/statues/socrates-david-v8-lg.webp" alt="" width="640" height="640" fetchpriority="high">
      <span class="cover-wing cover-wing-r"></span>
    </figure>
  </div>
  <div class="container cover-bottom"><p>Built by students.<br><strong>Shared for the next one.</strong></p><ul><li><strong>${subjects.length}</strong> ${subjects.length === 1 ? 'course' : 'courses'}</li><li><strong>${docs.length}</strong> documents</li>${totalQ ? `<li><strong>${totalQ.toLocaleString('en-US')}+</strong> practice questions</li>` : ''}</ul>${scenePicker()}<a href="${root}library/">Enter the library ${icon('arrow-up-right')}</a></div>
</section>

<section class="container recently-opened" id="recently-opened" hidden aria-labelledby="ro-h">
  <div class="section-head">
    <div><p class="kicker">Pick up where you left off</p><h2 id="ro-h" class="section-title">Jump back in</h2></div>
  </div>
  <ul class="recent-strip" data-recent-list data-type-icons="${esc(JSON.stringify(Object.fromEntries(Object.values(ctx.TYPES).map((t) => [t.label, icon(t.icon)]))))}"></ul>
</section>

<section class="container cover-courses" id="courses" aria-labelledby="courses-h">
  <div class="section-head"><div><p class="kicker">${plural(subjects.length, 'course')} · ${plural(docs.length, 'document')}</p><h2 id="courses-h" class="section-title">Pick your course</h2></div><a class="link-arrow" href="${root}library/">Search &amp; filter all ${docs.length} documents ${icon('arrow-right')}</a></div>
  <ul class="course-grid">${subjects.map((s) => courseCard(ctx, root, s)).join('')}</ul>
  <nav class="format-shortcuts" aria-label="Browse by document type"><span>Or browse every course by format</span>${Object.entries(ctx.TYPES).filter(([type]) => docs.some(d => d.type === type)).map(([type, meta]) => `<a href="${root}library/?type=${type}">${icon(meta.icon)}${esc(meta.plural)} <small>${docs.filter(d => d.type === type).length}</small></a>`).join('')}</nav>
  ${ctx.game?.total ? shuffleBand(ctx, root) : ''}${ctx.games ? playBand(ctx, root) + survivorsBand(ctx, root) : ''}
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
      <p>Every document${docs.some((d) => d.type === 'music') ? ' except the music' : ''} in one ZIP: ${plural(docs.filter((d) => d.type !== 'music').length, 'file')}, ${fmtSize(ctx.allZipSize)}. The HTML practice tools work offline in any browser.</p>
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
        ${s.zipSize ? `<a class="btn btn-primary subject-hero-dl" href="${root}${P.zip(s)}" download>${icon('download')} Download all <span class="btn-sub">${fmtSize(s.zipSize)}</span></a>` : ''}
        ${ctx.games && ctx.game.courses.some((c) => c.slug === s.slug) ? `<a class="btn btn-ghost subject-hero-play" href="${root}play/?course=${esc(s.slug)}">${icon('play')} Play in Sanctum Run</a><a class="btn btn-ghost subject-hero-play" href="${root}survivors/?course=${esc(s.slug)}">${icon('skull')} Play Crypt Survivors</a>` : ''}
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
  // A playlist too big to ZIP downloads the track that is playing instead; app.js keeps the link current.
  const dl = d.zipped
    ? `href="${fileUrl}" download="${esc(d.filename)}"`
    : `href="${root}${P.track(d, d.tracks[0])}" download="${esc(d.tracks[0].file)}" data-track-download`;
  const isDocx = d.format.viewer === 'docx';
  const isFrame = d.format.viewer === 'frame';
  const isAudio = d.format.viewer === 'audio' || d.format.viewer === 'playlist';
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
  } else if (isAudio) {
    // A playlist opens on its first track; app.js switches tracks (and honours #track-<slug> links).
    const tracks = d.tracks || [{ title: d.title, topic: s.title, description: d.description }];
    const first = tracks[0];
    const src = (tr) => (d.tracks ? root + P.track(d, tr) : fileUrl);
    stage = `<div class="vscroll vaudio"><section class="player" aria-label="Player">
      <span class="player-art">${icon(t.icon)}</span>
      <p class="player-kicker" data-now="topic">${esc(first.topic || s.title)}</p>
      <h2 class="player-title" data-now="title">${esc(first.title)}</h2>
      <p class="player-desc" data-now="description">${esc(first.description)}</p>
      <audio class="player-audio" src="${src(first)}" controls preload="metadata" data-player></audio>
      <div class="player-speed" role="radiogroup" aria-label="Playback speed">
        <span class="player-speed-label">Speed</span>
        ${[0.5, 0.75, 1, 1.25, 1.5].map((r) => `<button type="button" role="radio" aria-checked="${r === 1}" data-speed="${r}">${r === 1 ? 'Normal' : `${r}×`}</button>`).join('')}
      </div>
      ${d.tracks ? `<div class="tracklist">
        <p class="player-speed-label">${esc(d.title)} · ${d.tracks.length} tracks</p>
        <ol>${d.tracks.map((tr, i) => `<li><button type="button" class="track" data-track="${esc(tr.slug)}" data-src="${src(tr)}" data-file="${esc(tr.file)}" data-title="${esc(tr.title)}" data-topic="${esc(tr.topic || s.title)}" data-description="${esc(tr.description)}"${i === 0 ? ' aria-current="true"' : ''}>
          <span class="track-no">${tr.number ?? i + 1}</span>
          <span class="track-text"><strong>${esc(tr.title)}</strong>${tr.topic ? `<small>${esc(tr.topic)}</small>` : ''}</span>
          ${tr.duration ? `<span class="track-time">${fmtDuration(tr.duration)}</span>` : ''}
        </button></li>`).join('')}</ol>
      </div>` : ''}
    </section></div>`;
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
      <a class="vbtn vbtn-primary" ${dl} title="${d.zipped ? 'Download' : 'Download this track'}">${icon('download')}<span>Download</span></a>
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
        ${d.cards ? `<div><dt>Cards</dt><dd>${d.cards}</dd></div>` : ''}
        ${d.contributor ? `<div><dt>Shared by</dt><dd>${esc(d.contributor)}</dd></div>` : ''}
        <div><dt>Updated</dt><dd>${fmtDate(d.updated)}</dd></div>
      </dl>
      ${d.tags.length ? `<ul class="tag-list">${d.tags.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <div class="vpanel-actions">
        <a class="btn btn-primary" ${dl}>${icon('download')} Download ${d.zipped ? esc(d.format.label) : 'this track'}</a>
        ${d.tracks ? '' : isFrame || isAudio ? `<a class="btn btn-ghost" href="${fileUrl}" target="_blank" rel="noopener">${icon('external-link')} Open in new tab</a>` : `<button class="btn btn-ghost" type="button" data-print>${icon('printer')} Print</button>`}
        ${isFrame ? `<button class="btn btn-ghost" type="button" data-sheet-open="progress-sheet">${icon('download')} Back up your progress</button>` : ''}
      </div>
      ${related.length ? `<h3 class="vpanel-sub">More in ${esc(s.title)}</h3><ul class="doc-rows">${related.map((x) => docRow(ctx, root, x)).join('')}</ul>` : ''}
    </div>
  </aside>
  <div class="vscrim" data-panel-close></div>
</div>
${progressSheet()}
<div class="toast" role="status" aria-live="polite" hidden></div>
<script type="module" src="${root}assets/app.js?v=${JS_VERSION}"></script>
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

/**
 * Shuffle mode, at /shuffle/: tick practice sets from any courses and answer their questions
 * in one shuffled stack. The checklist is built here; assets/shuffle.js loads the questions
 * from the data the build writes for Sanctum Run (play/data/) and runs the stack.
 */
export function shuffle(ctx) {
  const root = '../';
  const { game, subjects } = ctx;
  const iconOf = (slug) => subjects.find((s) => s.slug === slug)?.icon || 'list-checks';
  // Courses whose questions get the reference popup (refs.js), each from its own index.
  const refCourses = subjects.filter((s) => s.refs).map((s) => s.slug);
  const course = (c) => `<fieldset class="shuffle-course" style="--accent:${c.accent}">
    <legend class="shuffle-course-head"><span class="tile">${icon(iconOf(c.slug))}</span><span class="shuffle-course-name">${esc(c.title)}</span></legend>
    <button type="button" class="shuffle-all" data-course-all="${esc(c.slug)}">Select all</button>
    <div class="shuffle-sets">${c.sets.map((s) => `<label class="shuffle-set"><input type="checkbox" value="${esc(`${c.slug}/${s.slug}`)}" data-course="${esc(c.slug)}" data-count="${s.count}"><span><strong>${esc(s.title)}</strong><small>${plural(s.count, 'question')}</small></span></label>`).join('')}</div>
  </fieldset>`;
  // Every set's topics with their question counts, so the Topics button can list and count them
  // before any questions load: { course: { title, accent, sets: { set: [[area, count], ...] } } }.
  const topics = Object.fromEntries(game.courses.map((c) => [c.slug, {
    title: c.title, accent: c.accent, sets: Object.fromEntries(c.sets.map((s) => [s.slug, s.topics || []])),
  }]));
  const body = `
<section class="page-head container">
  ${breadcrumbs(root, [['shuffle/', 'Shuffle mode']])}
  <h1 class="page-title">Shuffle mode</h1>
  <p class="page-lede">Pick any practice sets, from one course or several, and work their questions in one shuffled stack. Want only some topics? Press <strong>Topics</strong> and untick the rest. Answer choices are shuffled too. A variation keeps the question it builds on one tap away. Every answer counts toward <a href="${root}stats/">your stats</a>.</p>
</section>
<section class="container section-tight shuffle" data-shuffle>
  <script type="application/json" data-shuffle-topics>${JSON.stringify(topics).replace(/</g, '\\u003c')}</script>
  <form class="shuffle-setup" data-shuffle-setup>
    <div class="shuffle-courses">${game.courses.map(course).join('')}</div>
    <div class="shuffle-go">
      <p class="shuffle-picked" data-shuffle-picked aria-live="polite">No sets selected</p>
      ${topicsButton('data-shuffle-topics-btn disabled')}
      <label class="shuffle-limit"><span>Questions</span><select data-shuffle-limit aria-label="How many questions"><option value="0">All</option><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label>
      <button class="btn btn-primary" type="submit" data-shuffle-start disabled>${icon('shuffle')} Shuffle</button>
    </div>
  </form>
  <div class="shuffle-run" data-shuffle-run hidden>
    <p class="shuffle-drill" data-shuffle-drill hidden>${icon('target')}<span data-drill-text></span><a href="${root}stats/">Back to your stats</a></p>
    <div class="shuffle-bar">
      <div class="shuffle-bar-row">
        <p class="shuffle-score" data-shuffle-score aria-live="polite">0 / 0</p>
        ${topicsButton('data-shuffle-topics-run')}
        <button class="btn btn-ghost" type="button" data-shuffle-missed>Retry missed</button>
        <button class="btn btn-ghost" type="button" data-shuffle-again>${icon('shuffle')} Reshuffle</button>
        <button class="btn btn-ghost" type="button" data-shuffle-change>Change sets</button>
        <a class="btn btn-ghost" href="${root}stats/">${icon('chart-column')} Your stats</a>
      </div>
      <div class="shuffle-meter"><i data-shuffle-meter></i></div>
    </div>
    <p class="tp-note" data-shuffle-topics-note aria-live="polite" hidden></p>
    <ol class="shuffle-list" data-shuffle-list></ol>
  </div>
  <noscript><p>Shuffle mode needs JavaScript. Each practice set also works on its own in the <a href="${root}library/?type=practice">library</a>.</p></noscript>
</section>`;
  return layout(ctx, {
    root, title: 'Shuffle mode', canonical: 'shuffle/', body,
    description: `Mix practice sets from any course into one shuffled stack: ${game.total.toLocaleString('en-US')} questions from the study library.`,
    extraHead: `<script type="module" src="${root}assets/shuffle.js?v=${JS_VERSION}"></script>${refCourses.length ? `<link rel="stylesheet" href="${root}assets/refs.css?v=${ctx.refsVersion}"><script src="${root}assets/refs.js?v=${ctx.refsVersion}" data-root="${root}" data-courses="${refCourses.join(' ')}" data-v="${ctx.refsVersion}" defer></script>` : ''}`,
  });
}

/**
 * Your stats, at /stats/: which topics a student misses most, from the answer log every graded
 * question writes in this browser (src/assets/answer-log.js). The page is a frame; assets/stats.js
 * reads the log and draws everything, with the course names and colors handed to it here.
 */
export function stats(ctx) {
  const root = '../';
  const { game, subjects } = ctx;
  const courses = game.courses.map((c) => ({ slug: c.slug, title: c.title, accent: c.accent, sets: Object.fromEntries(c.sets.map((s) => [s.slug, s.title])) }));
  // Sets whose own page reports answers here: the ones built from an mcq/v1 set (the practice shell).
  const ownPage = subjects.flatMap((s) => s.documents.filter((d) => d.practiceShell).map((d) => d.title));
  const sources = ['Shuffle mode', ...(ctx.games ? ['Sanctum Run', 'Crypt Survivors'] : [])];
  if (ownPage.length) sources.push(`the pages of ${ownPage.length === 1 ? 'one practice set' : `${ownPage.length} practice sets`} (${ownPage.map(esc).join(', ')})`);
  const tracked = sources.length < 2 ? sources[0] : `${sources.slice(0, -1).join(', ')}${sources.length > 2 ? ',' : ''} and ${sources.at(-1)}`;
  const body = `
<section class="page-head container">
  ${breadcrumbs(root, [['stats/', 'Your stats']])}
  <h1 class="page-title">Your stats</h1>
  <p class="page-lede">See which topics you miss most, then drill them. Saved in this browser only: nothing is uploaded, and there's no account.</p>
</section>
<section class="container section-tight stats" data-stats>
  <div class="stats-empty" data-stats-empty hidden>
    <h2>No answers yet</h2>
    <p>Answer some practice questions and your results show up here, sorted by course and topic.</p>
    <div class="stats-go">
      <a class="btn btn-primary" href="${root}shuffle/">${icon('shuffle')} Shuffle mode</a>
      ${ctx.games ? `<a class="btn btn-ghost" href="${root}play/">${icon('play')} Sanctum Run</a>
      <a class="btn btn-ghost" href="${root}survivors/">${icon('skull')} Crypt Survivors</a>` : `<a class="btn btn-ghost" href="${root}library/?type=practice">${icon('list-checks')} Browse practice sets</a>`}
    </div>
  </div>
  <div data-stats-body hidden>
    <div class="chip-scroll stats-filter" role="group" aria-label="Course" data-stats-filter></div>
    <dl class="stats-kpis" data-stats-kpis></dl>
    <section class="stats-card" aria-labelledby="stats-weak-h">
      <h2 id="stats-weak-h">Topics to work on</h2>
      <p class="stats-sub" data-stats-weak-sub></p>
      <ol class="stats-topics" data-stats-weak></ol>
    </section>
    <section class="stats-card" aria-labelledby="stats-weeks-h">
      <h2 id="stats-weeks-h">The last 12 weeks</h2>
      <div class="stats-charts">
        <figure class="stats-chart" data-stats-chart="answered"><h3>Questions answered</h3></figure>
        <figure class="stats-chart" data-stats-chart="accuracy"><h3>Accuracy</h3></figure>
      </div>
      <details class="stats-table" data-stats-table><summary>Show as a table</summary></details>
    </section>
    <div data-stats-courses></div>
  </div>
  <p class="stats-note">Answers count here from ${tracked}. The other practice sets don't report here from their own pages yet, so practice those in Shuffle mode to track them.</p>
  <div class="stats-foot">
    <button class="btn btn-ghost" type="button" data-sheet-open="progress-sheet">${icon('download')} Back up or move your progress</button>
    <button class="btn btn-ghost" type="button" data-stats-clear hidden>${icon('trash-2')} Clear your stats</button>
  </div>
  <noscript><p>Your stats need JavaScript.</p></noscript>
</section>
<script type="application/json" id="stats-data">${JSON.stringify({ courses }).replace(/</g, '\\u003c')}</script>`;
  return layout(ctx, {
    root, title: 'Your stats', canonical: 'stats/', body, active: 'stats',
    description: 'See which practice topics you miss most, from the questions you answer on this site, and drill them in Shuffle mode.',
    extraHead: `<script type="module" src="${root}assets/stats.js?v=${JS_VERSION}"></script>`,
  });
}

/**
 * Crypt Survivors, at /survivors/: a bullet-heaven study game on a full-screen canvas
 * (src/survivors/). Every level-up asks a question from the practice sets picked here, with the same
 * course + set checklist as Shuffle mode. Questions come from play/data/ (scripts/game.mjs); the
 * sprite pack from scripts/survivors.mjs.
 */
export function survivors(ctx) {
  const root = '../';
  const { game, subjects } = ctx;
  const iconOf = (slug) => subjects.find((s) => s.slug === slug)?.icon || 'list-checks';
  const sets = game.courses.reduce((n, c) => n + c.sets.length, 0);
  // The reference popup (assets/refs.js), as in Shuffle mode: each question card (.sv-qcard) names its
  // course, and gets Look up, linked cites and cases, and the passages it turns on marked.
  const refCourses = subjects.filter((s) => s.refs).map((s) => s.slug);
  const course = (c) => `<fieldset class="sv-course" style="--accent:${c.accent}" data-course-group="${esc(c.slug)}">
        <legend class="sv-course-head"><span class="sv-tile">${icon(iconOf(c.slug))}</span><span class="sv-course-name">${esc(c.title)}</span></legend>
        <button type="button" class="sv-all" data-course-all="${esc(c.slug)}">Select all</button>
        <div class="sv-sets">${c.sets.map((s) => `<label class="sv-set"><input type="checkbox" value="${esc(`${c.slug}/${s.slug}`)}" data-set data-course="${esc(c.slug)}" data-count="${s.count}"><span><strong>${esc(s.title)}</strong><small>${plural(s.count, 'question')}<span data-missed></span></small></span></label>`).join('')}</div>
      </fieldset>`;
  const sound = (cls) => `<button type="button" class="${cls}" data-sound aria-pressed="true" aria-label="Sound on">${icon('volume-2', 'sv-on')}${icon('volume-x', 'sv-off')}<span>Sound on</span></button>`;
  return `<!doctype html>
<html lang="en" data-root="${root}">
<head>
${head(ctx, { root, title: 'Crypt Survivors', description: `A survival study game: hold a crypt of the restless dead for fifteen minutes while every level-up asks one of ${game.total.toLocaleString('en-US')} practice questions. Right answers bring boons; wrong ones, corruption.`, canonical: 'survivors/' })}
<script>document.documentElement.dataset.theme = 'dark';</script>
<link rel="stylesheet" href="survivors.css?v=${SV_VERSION}">
${refCourses.length ? `<link rel="stylesheet" href="${root}assets/refs.css?v=${ctx.refsVersion}">
<script src="${root}assets/refs.js?v=${ctx.refsVersion}" data-root="${root}" data-courses="${refCourses.join(' ')}" data-v="${ctx.refsVersion}" data-cards=".sv-qcard" defer></script>` : ''}
</head>
<body class="sv" data-screen="setup">
${GILT_DEFS}
<canvas id="sv-world" aria-hidden="true" tabindex="-1"></canvas>
<div class="sv-veil" aria-hidden="true"></div>

<header class="sv-hud" id="hud" hidden>
  <div class="sv-xp" id="hud-xp" aria-hidden="true"><span></span><b id="hud-level">Lv 1</b></div>
  <div class="sv-hud-row">
    <div class="sv-slots">
      <ul id="hud-weapons" aria-label="Weapons"></ul>
      <ul id="hud-passives" aria-label="Relics"></ul>
      <div class="sv-tray" id="hud-corruptions" hidden><span class="sv-tray-label">Corruptions</span><ul aria-label="Corruptions"></ul></div>
    </div>
    <div class="sv-clock">
      <strong id="hud-time" aria-label="Time survived">00:00</strong>
      <span class="sv-meta"><span class="sv-kills" title="Destroyed"><span class="sr-only">Destroyed </span><b id="hud-kills">0</b></span><span class="sv-gold" title="Gold"><span class="sr-only">Gold </span><b id="hud-gold">0</b></span></span>
      <span class="sv-streak" id="hud-streak"></span>
    </div>
    <div class="sv-hud-actions">
      <span class="sv-hp" title="Health"><span class="sr-only">Health </span><b id="hud-hp"></b></span>
      ${sound('sv-iconbtn')}
      <button type="button" class="sv-iconbtn" id="pause-btn" aria-label="Pause">${icon('pause')}</button>
    </div>
  </div>
</header>
<div class="sv-boss" id="boss" hidden><strong id="boss-name"></strong><div class="sv-boss-bar"><span id="boss-bar"></span></div></div>
<p class="sv-banner" id="banner" role="status" aria-live="polite"></p>
<div class="sv-stick" id="stick" hidden aria-hidden="true"><span></span></div>
<p class="sv-hint" id="hint" hidden><span class="hide-touch"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows to move · your weapons fire on their own · <kbd>Esc</kbd> pauses</span><span class="show-touch">Drag anywhere to move. Your weapons fire on their own.</span></p>

<section class="sv-screen sv-setup" id="setup" aria-labelledby="setup-h">
  <div class="sv-panel">
    <header class="sv-title">
      <p class="sv-eyebrow">${esc(ctx.config.shortTitle)} · Study game</p>
      <h1 id="setup-h">Crypt <em>Survivors</em></h1>
      <p class="sv-lede">Hold a crypt of the restless dead for fifteen minutes. You steer; your weapons fire on their own. Every level-up asks a question from your practice sets. Answer right and choose a boon. Answer wrong and a corruption takes hold.</p>
      <p class="sv-count">${game.total.toLocaleString('en-US')} questions · ${plural(sets, 'practice set')} · ${plural(game.courses.length, 'course')}</p>
    </header>

    <h2 class="sv-step"><span>1</span> Practice sets</h2>
    <div class="sv-courses">
      ${game.courses.map(course).join('\n      ')}
    </div>

    <h2 class="sv-step"><span>2</span> Your survivor</h2>
    <div class="sv-chars" id="chars"><p class="sv-note">Summoning the survivors…</p></div>

    <h2 class="sv-step"><span>3</span> The run</h2>
    <div class="sv-opts">
      <label class="sv-toggle"><input type="checkbox" id="opt-shuffle"> <span><strong>Shuffle questions</strong><small>Otherwise they come in set order</small></span></label>
      <label class="sv-toggle"><input type="checkbox" id="opt-missed"> <span><strong>Only questions I've missed before</strong><small>Missed here, until you answer them right</small></span></label>
      <label class="sv-toggle"><input type="checkbox" id="opt-endless"> <span><strong>Endless</strong><small>Keep fighting past 15:00, harder each lap</small></span></label>
      <fieldset class="sv-pacing">
        <legend>Feedback pacing</legend>
        <label><input type="radio" name="pacing" value="wrong"> <span><strong>Explain wrong answers</strong><small>Right answers get a "Why?" you can open</small></span></label>
        <label><input type="radio" name="pacing" value="always"> <span><strong>Always explain</strong><small>Every answer shows its explanation</small></span></label>
        <label><input type="radio" name="pacing" value="end"> <span><strong>Review at the end</strong><small>Just right or wrong now; explanations after the run</small></span></label>
      </fieldset>
    </div>

    <details class="sv-howto">
      <summary>How to play</summary>
      <dl>
        <div><dt>Move</dt><dd><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or the arrow keys. On a phone or with a mouse, press anywhere and drag. <kbd>Esc</kbd> pauses.</dd></div>
        <div><dt>Fight</dt><dd>Your weapons aim and fire on their own. Destroyed foes drop soul gems; gather them to fill the bar at the top.</dd></div>
        <div><dt>Level up</dt><dd>Each level stops the world for one question, with no time limit. Answer with a click or the keys <kbd>1</kbd>–<kbd>6</kbd> or <kbd>A</kbd>–<kbd>F</kbd>; cross out choices with ×.</dd></div>
        <div><dt>Boons</dt><dd>A right answer lets you choose one of three: a new weapon, a weapon level, or a relic. A maxed weapon with its matching relic evolves. Three right in a row while corrupted offers a Purify card.</dd></div>
        <div><dt>Corruption</dt><dd>A wrong answer makes you choose one of three corruptions (slower feet, weaker blows, more foes…). They stack, and the crypt darkens as they do. The answer, its explanation and the outline section to review are shown either way.</dd></div>
        <div><dt>The crypt</dt><dd>A boss rises every three minutes and drops a reliquary. Braziers and coffins hide gold, food and the Lodestar, which pulls in every gem. Survive to 15:00 to see the dawn.</dd></div>
      </dl>
    </details>

    <div class="sv-go">
      <p class="sv-picked" id="picked" aria-live="polite">No sets selected</p>
      <p class="sv-begin-note" id="begin-note"></p>
      <button type="button" class="sv-btn sv-btn-primary" id="begin" disabled>${icon('play')} Enter the crypt</button>
    </div>
    <p class="sv-back"><a href="${root}">${icon('arrow-left')} Back to the study library</a> <span>Art: Dungeon Crawl Stone Soup tiles (CC0)</span></p>
  </div>
</section>

<section class="sv-screen sv-center" id="loading" hidden>
  <div class="sv-panel sv-small"><h2>Descending…</h2><p class="sv-status" id="load-status"></p></div>
</section>

<div class="sv-modal" id="ask" hidden role="dialog" aria-modal="true" aria-labelledby="ask-kicker">
  <div class="sv-card sv-qcard" id="ask-card" tabindex="-1">
    <header class="sv-card-head meta"><div class="sv-card-titles"><p class="sv-kicker" id="ask-kicker"></p><p class="sv-source" id="ask-source"></p></div></header>
    <div id="ask-question"></div>
    <div id="ask-verdict" class="sq-why" hidden aria-live="polite"></div>
    <div id="ask-cards" class="actions" hidden></div>
    <button type="button" class="sv-btn sv-btn-dark actions" id="ask-continue" hidden>Continue</button>
  </div>
</div>

<div class="sv-modal" id="chest" hidden role="dialog" aria-modal="true" aria-labelledby="chest-title">
  <div class="sv-card sv-chest">
    <p class="sv-kicker">The boss is destroyed</p>
    <h2 id="chest-title">A reliquary</h2>
    <ul class="sv-list" id="chest-list"></ul>
    <button type="button" class="sv-btn sv-btn-primary" id="chest-go">Take it all</button>
  </div>
</div>

<section class="sv-screen sv-center" id="pause" hidden aria-labelledby="pause-h">
  <div class="sv-panel sv-mid">
    <h2 id="pause-h">Paused</h2>
    <p class="sv-sub" id="pause-sub"></p>
    <div class="sv-actions">
      <button type="button" class="sv-btn sv-btn-primary" id="resume">${icon('play')} Resume</button>
      ${sound('sv-btn sv-btn-ghost')}
      <button type="button" class="sv-btn sv-btn-ghost" id="quit">End the run</button>
    </div>
    <div class="sv-build" id="pause-build"></div>
  </div>
</section>

<section class="sv-screen sv-center" id="summary" hidden aria-labelledby="summary-title">
  <div class="sv-panel sv-summary">
    <h2 id="summary-title">The run is over.</h2>
    <p class="sv-sub" id="summary-lede"></p>
    <dl class="sv-stats" id="summary-stats"></dl>
    <div class="sv-actions">
      <button type="button" class="sv-btn sv-btn-primary" id="retry-missed">${icon('rotate-ccw')} Run missed questions</button>
      <button type="button" class="sv-btn sv-btn-ghost" id="new-run">New run</button>
      <button type="button" class="sv-btn sv-btn-ghost" id="change-sets">Change sets</button>
      <a class="sv-btn sv-btn-ghost" href="${root}">Study library</a>
    </div>
    <div class="sv-build" id="summary-build"></div>
    <div class="sv-missed" id="summary-missed"></div>
  </div>
</section>

<noscript><p class="sv-noscript">Crypt Survivors needs JavaScript. The practice sets work on their own in the <a href="${root}library/?type=practice">library</a>.</p></noscript>
<script type="module" src="game.js?v=${SV_VERSION}"></script>
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
      '/api/specs/index.json': { get: { operationId: 'getAuthoringSpecs', summary: 'Authoring specs and templates for new outlines, supplements and practice sets (mcq/v1, supplement/v1, outline/v1)', responses: { 200: json({ type: 'object', properties: { schemaVersion: { type: 'string' }, formats: { type: 'object' }, specs: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, mediaType: { type: 'string' }, url: { type: 'string' } } } } } }) } } },
    },
    components: {
      schemas: {
        Document: {
          type: 'object',
          properties: {
            id: { type: 'string' }, subject: { type: 'string' }, subjectTitle: { type: 'string' }, slug: { type: 'string' },
            title: { type: 'string' }, description: { type: 'string' }, type: { type: 'string' }, typeLabel: { type: 'string' },
            format: { type: 'string' }, mimeType: { type: 'string' }, originalFilename: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } }, questions: { type: ['integer', 'null'] }, cards: { type: ['integer', 'null'] },
            tracks: { type: ['array', 'null'], description: 'Playlists only: the tracks in play order.', items: { type: 'object', properties: { number: { type: ['integer', 'null'] }, title: { type: 'string' }, topic: { type: 'string' }, description: { type: 'string' }, durationSeconds: { type: ['integer', 'null'] }, sizeBytes: { type: 'integer' }, url: { type: 'string' } } } },
            sizeBytes: { type: 'integer' }, updated: { type: 'string', format: 'date-time' },
            headings: { type: 'array', items: { type: 'string' } },
            urls: { type: 'object', properties: { page: { type: 'string' }, file: { type: ['string', 'null'], description: 'Null for a playlist too big to ZIP; use its track URLs.' }, download: { type: ['string', 'null'] }, text: { type: 'string' }, json: { type: 'string' } } },
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
