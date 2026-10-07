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

// Site logo: the gold chair (filled with currentColor, so CSS sets its color or gilt).
const LOGO = `<svg class="logo" viewBox="-1 -1 72 102" fill="currentColor" aria-hidden="true" focusable="false"><path d="M6.2 0.1C5.6 0.4 4.2 1.9 3.1 3.3C-0.1 7.8 -0.9 13.9 1 19.8C1.9 22.7 3 24.6 6.6 29.3C11.7 36.1 13.3 39.7 13.9 46C14.1 48.2 14 52.1 13.7 53.5C13.2 55.4 12.6 56 9.2 57.7C3.7 60.4 2.5 61.7 2.1 65C2 65.9 1.9 72.4 2 82.1C2 99.2 2 98.2 3 99.2C3.8 100 4.1 100 8.9 100C15.8 100 15.6 100.3 15.6 92.4C15.6 87.4 15.6 87.3 15.2 86.7C14.7 85.8 14.1 85.6 12.1 85.6C10.1 85.6 9.9 85.5 9.9 84.3C9.9 82.5 11.1 80.5 12.7 79.7L13.5 79.2 34.9 79.2L56.3 79.2 57.1 79.7C58.7 80.5 59.9 82.5 59.9 84.3C59.9 85.5 59.7 85.6 57.7 85.6C55.7 85.6 55.1 85.8 54.6 86.7C54.2 87.3 54.2 87.4 54.2 92.4C54.2 100.3 54 100 60.9 100C65.7 100 66 100 66.8 99.2C67.8 98.2 67.8 99.2 67.8 82.1C67.8 72.4 67.8 65.9 67.7 65C67.3 61.7 66.1 60.4 60.6 57.7C57.2 56 56.6 55.4 56.1 53.5C55.8 52.1 55.7 48.2 55.9 46C56.5 39.7 58 36.1 63.2 29.3C66.8 24.6 67.9 22.7 68.8 19.8C71 13 69.7 6.4 65 1.4C63.8 0 63.1 -0.3 62.5 0.1C61.9 0.6 61.9 1.4 62.6 2.9C64.6 7.4 64.9 12 63.4 16.3C62.5 19.1 61.3 20.9 57.4 25.3C56.3 26.6 54.9 28.4 54.3 29.3C51 34.4 49.6 41.4 49.8 51.9C49.9 57.7 50.4 58.9 53.8 60.8C60.4 64.8 60.8 65.3 60.9 69.6C60.9 72.4 60.9 72.7 60 73.2C59.2 73.7 10.6 73.7 9.7 73.2C8.9 72.7 8.9 72.4 8.9 69.6C9 65.3 9.4 64.8 16 60.8C19.3 58.9 19.8 57.7 20 51.9C20.2 41.4 18.8 34.4 15.5 29.3C14.9 28.4 13.5 26.6 12.3 25.3C8.5 20.9 7.3 19.1 6.3 16.3C4.9 12 5.2 7.1 7.3 2.7C7.9 1.4 7.9 0.6 7.3 0.2C6.8 -0.2 6.8 -0.2 6.2 0.1M26.2 23.4C23.6 24.1 21.8 26.2 21.7 29C21.6 30.3 21.7 30.7 22.5 34.8C24 41.5 24.3 44.1 24.3 50.3C24.4 56 24.5 56.4 25.2 57.1L25.7 57.6 34.9 57.6L44.1 57.6 44.6 57.1C45.3 56.4 45.4 56 45.5 50.3C45.5 44.1 45.8 41.5 47.3 34.8C48.1 30.7 48.2 30.3 48.1 28.9C48 26.6 46.5 24.4 44.3 23.6C43.4 23.2 43.3 23.2 35.2 23.1C28.4 23.1 26.9 23.2 26.2 23.4M28.5 61.5C25.9 61.7 23.5 62 22.3 62.3C19.6 63 13.5 66.9 12.4 68.7C11.9 69.6 12 70.6 12.8 71C13.5 71.4 56.3 71.4 57 71C57.8 70.6 57.9 69.6 57.4 68.7C56.2 66.9 50.2 63 47.4 62.3C44.7 61.6 34.2 61.2 28.5 61.5"/></svg>`;

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
<script>(function(){var d=document.documentElement;d.dataset.theme='dark';try{var t=localStorage.getItem('theme'),a=localStorage.getItem('ambience')||(matchMedia('(prefers-reduced-motion: reduce)').matches?'off':'sakura');if(t)d.dataset.theme=t;if(a!=='off')d.dataset.ambience=a;}catch(e){}})();</script>
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
        <button class="${cls} amb-trigger" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="amb-menu" aria-label="Background scenery" title="Background scenery">${icon('sparkles', 'amb-ico amb-ico-off')}${AMBIENCE.map((a) => icon(a.icon, `amb-ico amb-ico-${a.id}`)).join('')}</button>
        <div class="amb-menu" id="amb-menu" role="menu" aria-labelledby="amb-title" hidden>
          <div class="amb-head">
            <p class="amb-title" id="amb-title">Scenery</p>
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
      ${ambienceControl()}
      ${themeButton()}
    </div>
  </div>
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
  <button type="button" data-sheet-open="subjects-sheet"${subjects.some((s) => s.slug === active) ? ' aria-current="page"' : ''}>${icon('layout-grid')}<span>Subjects</span></button>
  <button type="button" data-open-search>${icon('search')}<span>Search</span></button>
  <a href="${root}library/"${active === 'library' ? ' aria-current="page"' : ''}>${icon('library')}<span>Library</span></a>
  <a href="${root}contribute/"${active === 'contribute' ? ' aria-current="page"' : ''}>${icon('upload')}<span>Share</span></a>
</nav>

<div class="sheet" id="subjects-sheet" hidden>
  <div class="sheet-scrim" data-sheet-close></div>
  <div class="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="subjects-sheet-title">
    <div class="sheet-grab" aria-hidden="true"></div>
    <div class="sheet-head"><h2 id="subjects-sheet-title">Subjects</h2><button class="icon-btn" type="button" data-sheet-close aria-label="Close">${icon('x')}</button></div>
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
        <button class="subnav-trigger" type="button" aria-expanded="false" aria-controls="subnav-panel"${current ? ' aria-current="page"' : ''}>Subjects${icon('chevron-down', 'subnav-caret')}</button>
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
  <ul class="doc-rows">${shown.map((d) => docRow(ctx, root, d)).join('')}</ul>
  ${s.documents.length > shown.length ? `<a class="subject-panel-more" href="${root}subjects/${s.slug}/">See all ${s.documents.length} documents ${icon('arrow-right')}</a>` : ''}
</article>`;
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
    <button type="button" class="chip" data-filter-subject="" aria-pressed="true">All subjects</button>
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
<section class="hero">
  <div class="hero-glow" aria-hidden="true"></div>
  <div class="hero-beam" aria-hidden="true"></div>
  <div class="hero-lamp" aria-hidden="true"></div>
  <canvas class="hero-dust" aria-hidden="true"></canvas>
  <span class="hero-mark" aria-hidden="true">${LOGO}</span>
  <div class="container hero-inner">
    <p class="hero-eyebrow">${icon('graduation-cap')} Law school study library</p>
    <h1 class="hero-title">${riseWords('Outlines, rule charts &amp; practice banks,')} <span class="hero-accent"><em>in one place.</em><svg class="hero-swash" viewBox="0 0 300 26" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs><linearGradient id="swash-gold" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#b8873a" stop-opacity=".35"/><stop offset=".35" stop-color="#f3d99c"/><stop offset=".8" stop-color="#e2b462"/><stop offset="1" stop-color="#b8873a" stop-opacity=".5"/></linearGradient></defs>
      <path pathLength="1" d="M4 15 C 64 6, 148 4, 222 8 C 256 10, 282 13, 296 5"/>
      <path pathLength="1" d="M58 22 C 118 16, 190 15, 252 18"/>
    </svg></span></h1>
    <p class="hero-lede">${esc(config.tagline)}</p>
    <button class="hero-search" type="button" data-open-search>
      ${icon('search')}<span>Search: try “404(b)” or “conflicts”</span><kbd>Ctrl K</kbd>
    </button>
    <ul class="hero-stats">
      <li><strong>${subjects.length}</strong> ${subjects.length === 1 ? 'subject' : 'subjects'}</li>
      <li><strong>${docs.length}</strong> documents</li>
      ${totalQ ? `<li><strong>${totalQ}+</strong> practice questions</li>` : ''}
    </ul>
  </div>
</section>

<section class="section container" id="recently-opened" hidden aria-labelledby="ro-h">
  <div class="section-head">
    <div><p class="kicker">Pick up where you left off</p><h2 id="ro-h" class="section-title">Jump back in</h2></div>
  </div>
  <ul class="recent-strip" data-recent-list data-type-icons="${esc(JSON.stringify(Object.fromEntries(Object.values(ctx.TYPES).map((t) => [t.label, icon(t.icon)]))))}"></ul>
</section>

<section class="section container" aria-labelledby="subjects-h">
  <div class="section-head">
    <div><p class="kicker">Browse by course</p><h2 id="subjects-h" class="section-title">Subjects</h2></div>
    <a class="link-arrow" href="${root}library/">All documents ${icon('arrow-right')}</a>
  </div>
  <div class="subject-grid">${subjects.map((s) => subjectPanel(ctx, root, s)).join('')}</div>
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
      ${s.documents.length ? `<a class="btn btn-primary subject-hero-dl" href="${root}${P.zip(s)}" download>${icon('download')} Download all <span class="btn-sub">${fmtSize(s.zipSize)}</span></a>` : ''}
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
    <div class="vscroll" data-scroll-root><article class="prose reader">${d.html}</article></div>`;
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
      ${d.format.mime === 'application/pdf' ? '' : ambienceControl('vbtn vbtn-icon')}
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
        <div><dt>Subject</dt><dd><a href="${root}${P.subject(s)}">${esc(s.title)}</a></dd></div>
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
            <span class="field-label">Subject</span>
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
