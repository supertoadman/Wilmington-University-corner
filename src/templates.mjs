// HTML templates for every page type. Pure functions: (ctx, data) => string.
// All internal links are relative to the current page (via `root`), so the site
// works under any base path: GitHub Pages project URL, custom domain, or localhost.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Icons (Lucide, inlined at build time)
// ---------------------------------------------------------------------------
const iconCache = new Map();

export function icon(name, cls = '') {
  if (!iconCache.has(name)) {
    let file = path.join(ROOT, 'node_modules', 'lucide-static', 'icons', `${name}.svg`);
    if (!fs.existsSync(file)) file = path.join(ROOT, 'node_modules', 'lucide-static', 'icons', 'file.svg');
    const svg = fs.readFileSync(file, 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s*class="[^"]*"/, '')
      .replace(/\s*width="24"\s*height="24"/, '')
      .replace('<svg', '<svg class="icon" aria-hidden="true" focusable="false"')
      .replace(/\n\s*/g, ' ')
      .trim();
    iconCache.set(name, svg);
  }
  const svg = iconCache.get(name);
  return cls ? svg.replace('class="icon"', `class="icon ${cls}"`) : svg;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
export const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmtSize = (b) => (b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtShortDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

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
<link rel="icon" href="${root}assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${root}assets/og-image.png">
<link rel="alternate" type="application/json" title="Catalog (JSON)" href="${root}api/catalog.json">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="${root}assets/styles.css">
<script>(function(){try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t;}catch(e){}})();</script>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
${extraHead}`;
}

const themeButton = (cls = 'icon-btn') =>
  `<button class="${cls}" type="button" data-theme-toggle aria-label="Toggle dark mode">${icon('moon', 'theme-moon')}${icon('sun', 'theme-sun')}</button>`;

function layout(ctx, { root, title, description, body, active = '', canonical = '', extraHead = '', jsonld = null, bodyClass = '' }) {
  const { config, subjects, docs } = ctx;
  return `<!doctype html>
<html lang="en" data-root="${root}">
<head>
${head(ctx, { root, title, description, canonical, extraHead, jsonld })}
</head>
<body class="${bodyClass}">
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="${root}" aria-label="${esc(config.title)} home">
      <span class="brand-mark" aria-hidden="true">§</span>
      <span class="brand-text"><span class="brand-name">${esc(config.shortTitle)}</span><span class="brand-sub">Study Library</span></span>
    </a>
    <nav class="main-nav" aria-label="Main">
      <a href="${root}library/"${active === 'library' ? ' aria-current="page"' : ''}>Library</a>
      ${subjects.map((s) => `<a href="${root}subjects/${s.slug}/"${active === s.slug ? ' aria-current="page"' : ''}>${esc(s.title)}</a>`).join('\n      ')}
    </nav>
    <div class="header-actions">
      <button class="search-trigger" type="button" data-open-search aria-label="Search all documents">
        ${icon('search')}<span class="search-trigger-label">Search documents</span><kbd>Ctrl K</kbd>
      </button>
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
      <a class="brand" href="${root}"><span class="brand-mark" aria-hidden="true">§</span><span class="brand-name">${esc(config.title)}</span></a>
      <p class="footer-note">${esc(config.disclaimer)}</p>
    </div>
    <nav class="footer-links" aria-label="Footer">
      <a href="${root}library/">All documents</a>
      ${subjects.map((s) => `<a href="${root}subjects/${s.slug}/">${esc(s.title)}</a>`).join('')}
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

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------
function docCard(ctx, root, d, { showSubject = false } = {}) {
  const { TYPES, P } = ctx;
  const t = TYPES[d.type];
  const meta = [d.format.label, fmtSize(d.size), d.questions ? `${d.questions} questions` : null, `Updated ${fmtShortDate(d.updated)}`].filter(Boolean);
  return `<article class="doc-card" style="--accent:${d.subject.accent}" data-doc data-id="${esc(d.id)}" data-subject="${esc(d.subject.slug)}" data-type="${esc(d.type)}" data-updated="${esc(d.updated)}" data-title="${esc(d.title)}">
  <div class="doc-card-art" aria-hidden="true">${icon(t.icon)}</div>
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
  const { TYPES } = ctx;
  const shown = s.documents.slice(0, 6);
  const practice = s.documents.filter((d) => d.type === 'practice').length;
  const q = s.documents.reduce((n, d) => n + (d.questions || 0), 0);
  const stats = [plural(s.documents.length, 'document'), practice ? plural(practice, 'practice set') : null, q ? `${q}+ questions` : null].filter(Boolean);
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
  <span class="hero-mark" aria-hidden="true">§</span>
  <div class="container hero-inner">
    <p class="hero-eyebrow">${icon('graduation-cap')} Law school study library</p>
    <h1 class="hero-title">Outlines, rule charts &amp; practice banks, <em>in one place.</em></h1>
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
  <ul class="recent-strip" data-recent-list></ul>
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
<div class="viewer-app">
  <header class="vbar">
    <a class="vbar-back" href="${root}${P.subject(s)}" aria-label="Back to ${esc(s.title)}">${icon('arrow-left')}</a>
    <a class="brand-mark vbar-home" href="${root}" aria-label="Home">§</a>
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
