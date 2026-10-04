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
const GITHUB = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.68.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z"/></svg>';

export function icon(name, cls = '') {
  if (name === 'github') return GITHUB;
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
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
function layout(ctx, { root, title, description, body, active = '', canonical = '', head = '', jsonld = null, bodyClass = '' }) {
  const { config, subjects } = ctx;
  const fullTitle = title ? `${title} · ${config.shortTitle}` : config.title;
  const desc = description || config.tagline;
  const url = config.url + canonical;
  const nav = [
    ['library/', 'Library', 'library'],
    ...subjects.map((s) => [`subjects/${s.slug}/`, s.title, s.slug]),
    ['agents/', 'For Agents', 'agents'],
  ];
  return `<!doctype html>
<html lang="en" data-root="${root}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
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
<meta name="theme-color" content="#14243b">
<link rel="icon" href="${root}assets/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/json" title="Catalog (JSON)" href="${root}api/catalog.json">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="${root}assets/styles.css">
<script>(function(){try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t;}catch(e){}})();</script>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
${head}
</head>
<body class="${bodyClass}">
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="${root}" aria-label="${esc(config.title)} home">
      <span class="brand-mark" aria-hidden="true">§</span>
      <span class="brand-text"><span class="brand-name">${esc(config.shortTitle)}</span><span class="brand-sub">Study Library</span></span>
    </a>
    <nav class="main-nav" id="main-nav" aria-label="Main">
      ${nav.map(([href, label, key]) => `<a href="${root}${href}"${active === key ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('\n      ')}
    </nav>
    <div class="header-actions">
      <button class="search-trigger" type="button" data-open-search aria-label="Search all documents">
        ${icon('search')}<span class="search-trigger-label">Search</span><kbd>Ctrl K</kbd>
      </button>
      <button class="icon-btn" type="button" data-theme-toggle aria-label="Toggle dark mode">${icon('moon', 'theme-moon')}${icon('sun', 'theme-sun')}</button>
      <a class="icon-btn hide-sm" href="${esc(config.repo)}" aria-label="Source on GitHub" rel="noopener">${icon('github')}</a>
      <button class="icon-btn menu-btn" type="button" data-menu-toggle aria-controls="main-nav" aria-expanded="false" aria-label="Open menu">${icon('menu', 'menu-open')}${icon('x', 'menu-close')}</button>
    </div>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="container footer-grid">
    <div>
      <a class="brand brand-footer" href="${root}"><span class="brand-mark" aria-hidden="true">§</span><span class="brand-name">${esc(config.title)}</span></a>
      <p class="footer-note">${esc(config.disclaimer)}</p>
    </div>
    <div>
      <h2 class="footer-heading">Subjects</h2>
      <ul class="footer-links">${subjects.map((s) => `<li><a href="${root}subjects/${s.slug}/">${esc(s.title)}</a></li>`).join('')}<li><a href="${root}library/">All documents</a></li></ul>
    </div>
    <div>
      <h2 class="footer-heading">For developers &amp; agents</h2>
      <ul class="footer-links">
        <li><a href="${root}agents/">API overview</a></li>
        <li><a href="${root}api/catalog.json">catalog.json</a></li>
        <li><a href="${root}llms.txt">llms.txt</a></li>
        <li><a href="${esc(config.repo)}" rel="noopener">GitHub repository</a></li>
      </ul>
    </div>
  </div>
  <div class="container footer-bottom">
    <span>Last updated ${fmtDate(ctx.generatedAt)}</span>
  </div>
</footer>
<div class="palette" id="palette" hidden>
  <div class="palette-backdrop" data-close-search></div>
  <div class="palette-panel" role="dialog" aria-modal="true" aria-label="Search documents">
    <div class="palette-input-row">
      ${icon('search')}
      <input id="palette-input" type="search" placeholder="Search outlines, rules, practice sets…" autocomplete="off" spellcheck="false" aria-controls="palette-results">
      <kbd data-close-search>Esc</kbd>
    </div>
    <ul class="palette-results" id="palette-results" role="listbox"></ul>
    <div class="palette-footer"><span><kbd>↑</kbd><kbd>↓</kbd> to move</span><span><kbd>Enter</kbd> to open</span></div>
  </div>
</div>
<script type="module" src="${root}assets/app.js"></script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------
function docCard(ctx, root, d, { showSubject = false } = {}) {
  const { TYPES, P } = ctx;
  const t = TYPES[d.type];
  return `<article class="doc-card" style="--accent:${d.subject.accent}" data-doc data-id="${esc(d.id)}" data-subject="${esc(d.subject.slug)}" data-type="${esc(d.type)}" data-updated="${esc(d.updated)}" data-title="${esc(d.title)}">
  <div class="doc-card-top">
    <span class="doc-icon">${icon(t.icon)}</span>
    <div class="doc-badges">
      ${showSubject ? `<span class="badge badge-subject">${esc(d.subject.title)}</span>` : ''}
      <span class="badge">${esc(t.label)}</span>
    </div>
  </div>
  <h3 class="doc-title"><a class="stretched" href="${root}${P.doc(d)}">${esc(d.title)}</a></h3>
  <p class="doc-desc">${esc(d.description)}</p>
  <div class="doc-meta">
    <span>${esc(d.format.label)}</span><span>${fmtSize(d.size)}</span>${d.questions ? `<span>${d.questions} questions</span>` : ''}<span>Updated ${fmtDate(d.updated)}</span>
  </div>
  <div class="doc-actions">
    <a class="btn btn-sm btn-primary" href="${root}${P.doc(d)}">${icon(d.format.viewer === 'docx' ? 'book-open' : 'external-link')} Open</a>
    <a class="btn btn-sm btn-ghost" href="${root}${P.file(d)}" download="${esc(d.filename)}" aria-label="Download ${esc(d.title)}">${icon('download')} Download</a>
  </div>
</article>`;
}

function subjectCard(ctx, root, s) {
  const { TYPES } = ctx;
  const counts = {};
  for (const d of s.documents) counts[d.type] = (counts[d.type] || 0) + 1;
  return `<article class="subject-card" style="--accent:${s.accent}">
  <div class="subject-card-head">
    <span class="subject-icon">${icon(s.icon)}</span>
    <span class="subject-count">${plural(s.documents.length, 'document')}</span>
  </div>
  <h3 class="subject-title"><a class="stretched" href="${root}subjects/${s.slug}/">${esc(s.title)}</a></h3>
  <p class="subject-desc">${esc(s.description)}</p>
  <ul class="type-pills">${Object.entries(counts).map(([k, n]) => `<li>${icon(TYPES[k].icon)} ${n} ${esc(n === 1 ? TYPES[k].label : TYPES[k].plural)}</li>`).join('')}</ul>
  <span class="subject-link">Browse ${esc(s.title)} ${icon('arrow-right')}</span>
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
  const types = [...new Set(docs.map((d) => d.type))];
  return `<div class="filter-bar" data-filter-root>
  <label class="filter-search">
    ${icon('search')}
    <input type="search" data-filter-q placeholder="Filter by title, rule, or topic…" aria-label="Filter documents">
  </label>
  ${subjectFilter ? `<div class="chip-group" role="group" aria-label="Subject">
    <button type="button" class="chip" data-filter-subject="" aria-pressed="true">All subjects</button>
    ${subjects.filter((s) => s.documents.length).map((s) => `<button type="button" class="chip" data-filter-subject="${esc(s.slug)}" aria-pressed="false" style="--accent:${s.accent}">${esc(s.title)}</button>`).join('')}
  </div>` : ''}
  <div class="chip-group" role="group" aria-label="Type">
    <button type="button" class="chip" data-filter-type="" aria-pressed="true">All types</button>
    ${types.map((t) => `<button type="button" class="chip" data-filter-type="${t}" aria-pressed="false">${icon(TYPES[t].icon)} ${esc(TYPES[t].plural)}</button>`).join('')}
  </div>
  <div class="filter-sort">
    <label for="sort-select">Sort</label>
    <select id="sort-select" data-filter-sort>
      <option value="default">Recommended</option>
      <option value="updated">Recently updated</option>
      <option value="title">Title A–Z</option>
    </select>
  </div>
</div>
<p class="filter-status" data-filter-status aria-live="polite"></p>`;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------
export function home(ctx) {
  const root = './';
  const { config, subjects, docs } = ctx;
  const totalQ = docs.reduce((n, d) => n + (d.questions || 0), 0);
  const practiceSets = docs.filter((d) => d.type === 'practice').length;
  const recent = [...docs].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 6);
  const body = `
<section class="hero">
  <div class="hero-bg" aria-hidden="true"></div>
  <div class="container hero-inner">
    <p class="eyebrow">${icon('graduation-cap')} Law school study library</p>
    <h1 class="hero-title">Outlines, rule charts &amp; practice banks <em>in one place.</em></h1>
    <p class="hero-lede">${esc(config.tagline)}</p>
    <button class="hero-search" type="button" data-open-search>
      ${icon('search')}<span>Search ${plural(docs.length, 'document')}: try “404(b)” or “conflicts”</span><kbd>Ctrl K</kbd>
    </button>
    <dl class="stats">
      <div><dt>Subjects</dt><dd>${subjects.length}</dd></div>
      <div><dt>Documents</dt><dd>${docs.length}</dd></div>
      <div><dt>Practice sets</dt><dd>${practiceSets}</dd></div>
      ${totalQ ? `<div><dt>Questions</dt><dd>${totalQ}+</dd></div>` : ''}
    </dl>
  </div>
</section>

<section class="section container" aria-labelledby="subjects-h">
  <div class="section-head">
    <div><p class="kicker">Browse by course</p><h2 id="subjects-h" class="section-title">Subjects</h2></div>
    <a class="link-arrow" href="${root}library/">View all documents ${icon('arrow-right')}</a>
  </div>
  <div class="subject-grid">${subjects.map((s) => subjectCard(ctx, root, s)).join('')}</div>
</section>

<section class="section container" aria-labelledby="recent-h">
  <div class="section-head">
    <div><p class="kicker">Fresh</p><h2 id="recent-h" class="section-title">Recently updated</h2></div>
    <a class="btn btn-ghost" href="${root}files/all-study-materials.zip" download>${icon('file-archive')} Download everything (${fmtSize(ctx.allZipSize)})</a>
  </div>
  <div class="doc-grid">${recent.map((d) => docCard(ctx, root, d, { showSubject: true })).join('')}</div>
</section>

<section class="section container">
  <div class="callout">
    <div class="callout-icon">${icon('bot')}</div>
    <div>
      <h2 class="callout-title">Built for people and for AI agents</h2>
      <p>Every document is also published as structured JSON and plain text, with a <code>llms.txt</code> index and an OpenAPI description. Point an assistant at the catalog and it can find, cite, and quiz you on the material.</p>
    </div>
    <a class="btn btn-primary" href="${root}agents/">See the API ${icon('arrow-right')}</a>
  </div>
</section>`;
  return layout(ctx, {
    root, title: '', body, active: 'home',
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
  <div class="empty-state" data-filter-empty hidden>${icon('search')}<p>No documents match those filters.</p><button class="btn btn-ghost" type="button" data-filter-reset>Clear filters</button></div>
</section>`;
  return layout(ctx, { root, title: 'Library', description: 'Browse every study document: outlines, rule charts, flowcharts, flashcards, and practice questions.', body, active: 'library', canonical: 'library/' });
}

export function subjectPage(ctx, s) {
  const root = '../../';
  const { P } = ctx;
  const body = `
<section class="page-head subject-head container" style="--accent:${s.accent}">
  ${breadcrumbs(root, [[P.subject(s), s.title]])}
  <div class="subject-head-row">
    <span class="subject-icon subject-icon-lg">${icon(s.icon)}</span>
    <div>
      <h1 class="page-title">${esc(s.title)}</h1>
      <p class="page-lede">${esc(s.description)}</p>
    </div>
  </div>
  <div class="head-actions">
    ${s.documents.length ? `<a class="btn btn-primary" href="${root}${P.zip(s)}" download>${icon('file-archive')} Download all ${s.documents.length} files (${fmtSize(s.zipSize)})</a>` : ''}
    <a class="btn btn-ghost" href="${root}${P.subjectJson(s)}">${icon('braces')} JSON</a>
  </div>
</section>
<section class="container section-tight">
  ${s.documents.length > 3 ? filterBar(ctx, s.documents, { subjectFilter: false }) : ''}
  <div class="doc-grid" data-filter-list>${s.documents.map((d) => docCard(ctx, root, d)).join('')}</div>
  <div class="empty-state" data-filter-empty hidden>${icon('search')}<p>No documents match those filters.</p><button class="btn btn-ghost" type="button" data-filter-reset>Clear filters</button></div>
</section>`;
  return layout(ctx, {
    root, title: s.title, description: s.description, body, active: s.slug, canonical: P.subject(s),
    jsonld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: s.title, description: s.description, url: ctx.config.url + P.subject(s) },
  });
}

export function docPage(ctx, d) {
  const root = '../../../';
  const { P, TYPES, config } = ctx;
  const t = TYPES[d.type];
  const s = d.subject;
  const related = s.documents.filter((x) => x !== d).slice(0, 3);
  const fileUrl = root + P.file(d);

  let viewer;
  if (d.format.viewer === 'docx') {
    viewer = `<div class="reader-layout">
  ${d.toc.length ? `<aside class="reader-toc" aria-label="Contents"><p class="toc-title">Contents</p><ol>${d.toc.map((h) => `<li class="toc-l${h.level}"><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ol></aside>` : ''}
  <article class="prose reader">${d.html}</article>
</div>`;
  } else if (d.format.viewer === 'frame') {
    viewer = `<div class="viewer" data-viewer>
  <div class="viewer-bar">
    <span class="viewer-dots" aria-hidden="true"><i></i><i></i><i></i></span>
    <span class="viewer-name">${esc(d.filename)}</span>
    <button class="viewer-btn" type="button" data-fullscreen aria-label="Full screen">${icon('maximize-2')}<span>Full screen</span></button>
  </div>
  <iframe class="viewer-frame" src="${fileUrl}" title="${esc(d.title)}" loading="lazy"></iframe>
</div>`;
  } else {
    viewer = `<pre class="prose reader text-reader">${esc(d.text)}</pre>`;
  }

  const body = `
<section class="page-head doc-head container" style="--accent:${s.accent}">
  ${breadcrumbs(root, [[P.subject(s), s.title], [P.doc(d), d.title]])}
  <div class="doc-head-grid">
    <div>
      <p class="eyebrow eyebrow-accent">${icon(t.icon)} ${esc(t.label)} · ${esc(s.title)}</p>
      <h1 class="page-title">${esc(d.title)}</h1>
      <p class="page-lede">${esc(d.description)}</p>
      <ul class="meta-list">
        <li>${icon('file-code')} ${esc(d.format.label)} · ${fmtSize(d.size)}</li>
        ${d.questions ? `<li>${icon('list-checks')} ${d.questions} questions</li>` : ''}
        <li>${icon('clock')} Updated ${fmtDate(d.updated)}</li>
      </ul>
      ${d.tags.length ? `<ul class="tag-list">${d.tags.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    </div>
    <div class="doc-head-actions">
      <a class="btn btn-primary btn-lg" href="${fileUrl}" download="${esc(d.filename)}">${icon('download')} Download ${esc(d.format.label)}</a>
      ${d.format.viewer === 'frame' ? `<a class="btn btn-ghost" href="${fileUrl}" target="_blank" rel="noopener">${icon('external-link')} Open in new tab</a>` : `<button class="btn btn-ghost" type="button" data-print>${icon('printer')} Print</button>`}
      <button class="btn btn-ghost" type="button" data-copy-link>${icon('link')} <span>Copy link</span></button>
    </div>
  </div>
</section>
<section class="container-wide section-tight">
  ${viewer}
</section>
${related.length ? `<section class="section container" aria-labelledby="related-h">
  <div class="section-head"><div><p class="kicker">Keep going</p><h2 id="related-h" class="section-title">More in ${esc(s.title)}</h2></div>
  <a class="link-arrow" href="${root}${P.subject(s)}">All ${esc(s.title)} documents ${icon('arrow-right')}</a></div>
  <div class="doc-grid">${related.map((x) => docCard(ctx, root, x)).join('')}</div>
</section>` : ''}`;

  return layout(ctx, {
    root, title: d.title, description: d.description, body, active: s.slug, canonical: P.doc(d),
    bodyClass: d.format.viewer === 'docx' ? 'is-reader' : '',
    head: `<link rel="alternate" type="application/json" title="Document (JSON)" href="${root}${P.json(d)}">\n<link rel="alternate" type="text/plain" title="Document (plain text)" href="${root}${P.text(d)}">`,
    jsonld: {
      '@context': 'https://schema.org', '@type': 'LearningResource', name: d.title, description: d.description,
      learningResourceType: t.label, about: s.title, url: config.url + P.doc(d), dateModified: d.updated,
      encodingFormat: d.format.mime, keywords: d.tags.join(', '),
      isPartOf: { '@type': 'CollectionPage', name: s.title, url: config.url + P.subject(s) },
    },
  });
}

export function agents(ctx) {
  const root = '../';
  const { config, docs } = ctx;
  const sample = docs[0];
  const u = config.url;
  const endpoints = [
    ['GET', 'llms.txt', 'Plain-text index in the llms.txt format. Start here for LLMs.'],
    ['GET', 'llms-full.txt', 'Full plain text of every document in one file.'],
    ['GET', 'api/catalog.json', 'All subjects and documents with metadata and absolute URLs.'],
    ['GET', 'api/subjects/{subject}.json', 'One subject and its documents.'],
    ['GET', 'api/documents/{subject}/{doc}.json', 'One document: metadata plus extracted text.'],
    ['GET', 'api/documents/{subject}/{doc}.txt', 'One document as plain text, good for retrieval.'],
    ['GET', 'api/search-index.json', 'Compact index for client-side keyword search.'],
    ['GET', 'api/openapi.json', 'OpenAPI 3.1 description of these endpoints, for tool or plugin setup.'],
  ];
  const body = `
<section class="page-head container">
  ${breadcrumbs(root, [['agents/', 'For Agents']])}
  <p class="eyebrow">${icon('bot')} Integrations</p>
  <h1 class="page-title">For agents &amp; developers</h1>
  <p class="page-lede">The whole library is available as static, versioned JSON and plain text. No keys, no rate limits. These are plain files on GitHub Pages that update whenever new material is pushed.</p>
</section>
<section class="container section-tight prose-page">
  <h2>Endpoints</h2>
  <div class="table-wrap"><table class="endpoint-table">
    <thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead>
    <tbody>${endpoints.map(([m, p, desc]) => `<tr><td><span class="method">${m}</span></td><td><a href="${root}${p.includes('{') ? 'api/catalog.json' : p}"><code>/${p}</code></a></td><td>${desc}</td></tr>`).join('')}</tbody>
  </table></div>

  <h2>Quick start</h2>
  <div class="code-block"><div class="code-head"><span>curl</span><button type="button" class="viewer-btn" data-copy-code>${icon('copy')}<span>Copy</span></button></div><pre><code>curl -s ${u}api/catalog.json | jq '.documents[] | {title, type, url: .urls.page}'</code></pre></div>
  <div class="code-block"><div class="code-head"><span>JavaScript</span><button type="button" class="viewer-btn" data-copy-code>${icon('copy')}<span>Copy</span></button></div><pre><code>const catalog = await fetch('${u}api/catalog.json').then(r =&gt; r.json());
const doc = catalog.documents.find(d =&gt; d.type === 'practice');
const { text } = await fetch(doc.urls.json).then(r =&gt; r.json());</code></pre></div>
  <div class="code-block"><div class="code-head"><span>Python</span><button type="button" class="viewer-btn" data-copy-code>${icon('copy')}<span>Copy</span></button></div><pre><code>import requests
catalog = requests.get("${u}api/catalog.json").json()
for d in catalog["documents"]:
    print(d["subjectTitle"], "|", d["title"], "|", d["urls"]["text"])</code></pre></div>

  <h2>Document record</h2>
  <p>Each entry in <code>catalog.documents</code> looks like this. The schema is versioned with <code>schemaVersion</code>; new fields may be added, but existing ones will not change meaning within a major version.</p>
  <div class="code-block"><div class="code-head"><span>JSON</span></div><pre><code>${esc(JSON.stringify({
    id: sample.id, subject: sample.subject.slug, title: sample.title, type: sample.type,
    format: sample.format.label, originalFilename: sample.filename, sizeBytes: sample.size, updated: sample.updated,
    urls: { page: u + ctx.P.doc(sample), download: u + ctx.P.file(sample), text: u + ctx.P.text(sample), json: u + ctx.P.json(sample) },
  }, null, 2))}</code></pre></div>

  <h2>Using it with an assistant</h2>
  <ul>
    <li><strong>Chat assistants:</strong> paste <code>${u}llms.txt</code> and ask the assistant to read the documents it links.</li>
    <li><strong>Custom GPTs and tool-calling agents:</strong> import <code>${u}api/openapi.json</code> as an action or tool schema.</li>
    <li><strong>RAG pipelines:</strong> index each <code>urls.text</code> file. Use <code>updated</code> to re-index only what changed.</li>
    <li><strong>MCP:</strong> a small MCP server can wrap <code>catalog.json</code> to expose <code>list_documents</code> and <code>get_document</code> tools. See the repository README.</li>
  </ul>
  <p class="muted">Interactive practice banks keep their questions inside the page's script, so their <code>.txt</code> files hold only the visible text. Download the HTML file for the full question set.</p>
</section>`;
  return layout(ctx, { root, title: 'For Agents', description: 'Machine-readable JSON, plain-text and llms.txt endpoints for the study library.', body, active: 'agents', canonical: 'agents/' });
}

export function notFound(ctx) {
  const root = ctx.config.basePath;
  const body = `<section class="container not-found">
  <p class="nf-code">404</p>
  <h1 class="page-title">That page has been overruled.</h1>
  <p class="page-lede">The page you're looking for doesn't exist or has moved. Try searching the library instead.</p>
  <div class="head-actions center">
    <a class="btn btn-primary" href="${root}">Go home</a>
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
