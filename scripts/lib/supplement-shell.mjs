// The canonical statutory / rule supplement, "supplement/v1" (spec: docs/supplement-format.md). A
// course's supplement is data: its topic list (AREAS) and one object per section or rule (DATA). It
// arrives as `<Name>.supplement.json` in content/<Subject>/, and the build renders it into the
// standalone viewer below (src/practice/supplement.css and supplement.js, inlined). The page keeps the
// one-line `const DATA = [...]` the reference popup's index reads (supplementStatutes in
// scripts/lib/refs.mjs). docs/templates/supplement-template.html is this page with the sample data.
//
// Like the practice sets, supplements are read with JSON.parse and written back with every "<"
// escaped, so the data lines can never close their script.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugify } from './text.mjs';

export const SUPPLEMENT_SCHEMA = 'supplement/v1';
export const CITE_STYLES = ['ucc', 'fre', 'mrpc', 'frcp', 'restatement', 'section'];
// What a section or rule number looks like in each style, so a supplement only lists ids the
// reference popup can link (STYLES in src/assets/refs.js).
export const ID_PATTERNS = {
  ucc: /^[129]A?-\d{3}[A-Z]?$/,
  fre: /^\d{3,4}$/,
  mrpc: /^[1-8]\.\d{1,2}$/,
  frcp: /^(?:\d{1,2}(?:\.\d)?|\d{3,5}[a-z]?)$/,
  restatement: /^\d{1,4}[A-Za-z]?(?:\.\d{1,3}[A-Za-z]?)?$/,
  section: /^\d{1,5}[A-Za-z]?(?:[.-]\d{1,5}[A-Za-z]?)*$/,
};
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'practice');
const FONTS = 'https://fonts.googleapis.com/css2?family=Libre+Caslon+Display&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const str = (v) => (v == null ? '' : String(v).replace(/\r\n?/g, '\n').trim());
const line = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
const asset = (f) => {
  const text = fs.readFileSync(path.join(SRC, f), 'utf8');
  if (/<\/(?:script|style)/i.test(text)) throw new Error(`${f} must not contain a closing script or style tag`);
  return text;
};

/** The raw supplement in a `.supplement.json` text, or null. Never executes anything. */
export function readSupplement(text) {
  let raw;
  try { raw = JSON.parse(String(text).replace(/^﻿/, '')); } catch { return null; }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.data ?? raw.statutes)) return null;
  if (raw.schema != null && !/^supplement\/v1(?:\.\d+)?$/.test(String(raw.schema))) return null;
  return raw;
}

/** Check and complete a raw supplement. Returns { supp, areas, data, errors, warnings }; bad entries are dropped. */
export function normalizeSupplement(raw) {
  const errors = [], warnings = [];
  const cite = CITE_STYLES.includes(raw.cite) ? raw.cite : 'ucc';
  if (raw.cite != null && cite !== raw.cite) warnings.push(`"cite" must be one of ${CITE_STYLES.join(', ')}; using "ucc"`);
  const title = str(raw.title) || 'Statutory Supplement';
  if (!str(raw.title)) warnings.push('no "title"');
  const supp = {
    id: slugify(str(raw.id) || title),
    title,
    cite,
    ...(str(raw.unit) && { unit: str(raw.unit) }),
    ...(str(raw.units) && { units: str(raw.units) }),
    ...(str(raw.textLabel) && { textLabel: str(raw.textLabel) }),
    ...(str(raw.commentsLabel) && { commentsLabel: str(raw.commentsLabel) }),
    ...(raw.numberAreas === false && { numberAreas: false }),
    ...(str(raw.description) && { description: str(raw.description) }),
    ...(str(raw.intro) && { intro: str(raw.intro) }),
    ...(str(raw.source) && { source: str(raw.source) }),
    ...(/^#[0-9a-f]{6}$/i.test(raw.accent || '') && { accent: raw.accent }),
  };
  const areas = Array.isArray(raw.areas) ? raw.areas.map(str).filter(Boolean) : [];
  if (raw.areas != null && !Array.isArray(raw.areas)) warnings.push('"areas" must be an array of strings');

  const data = [], ids = new Set();
  (raw.data ?? raw.statutes).forEach((r, i) => {
    const where = `entry ${i + 1}${r && r.s != null ? ` (${r.s})` : ''}`;
    if (!r || typeof r !== 'object') { errors.push(`${where}: not an object`); return; }
    const s = str(r.s);
    if (!s) { errors.push(`${where}: no "s" (section or rule number)`); return; }
    if (ids.has(s)) { errors.push(`${where}: duplicate "s"`); return; }
    // An entry with its own label ("n") is one the cite style can't number, so it isn't cited by number.
    if (!str(r.n) && !ID_PATTERNS[cite].test(s)) warnings.push(`${where}: "${s}" doesn't look like a ${cite} number, so cites to it won't link`);
    const t = str(r.t);
    if (!t) { errors.push(`${where}: no "t" (title)`); return; }
    const x = Array.isArray(r.x) ? r.x.filter((p) => Array.isArray(p) && p.length >= 2 && p.length <= 3).map((p) => (p.length === 3 ? [str(p[0]), str(p[1]), str(p[2])] : [str(p[0]), str(p[1])])) : [];
    if (!x.length) { errors.push(`${where}: "x" must hold the text as [[label, text], …]`); return; }
    if (Array.isArray(r.x) && x.length !== r.x.length) warnings.push(`${where}: some "x" entries aren't [label, text] or [label, text, path]`);
    const c = Array.isArray(r.c) ? r.c.filter((p) => Array.isArray(p) && p.length === 2).map((p) => [str(p[0]), str(p[1])]) : [];
    const cc = Array.isArray(r.cc) ? r.cc.map(str) : [];
    for (const n of cc) if (!c.some(([m]) => m === n)) warnings.push(`${where}: key comment "${n}" isn't in "c"`);
    const tp = Array.isArray(r.tp) ? r.tp.filter((n) => Number.isInteger(n)) : [];
    for (const n of tp) if (n < 1 || n > areas.length) warnings.push(`${where}: topic ${n} isn't in "areas" (topics count from 1)`);
    if (!Array.isArray(r.tp)) warnings.push(`${where}: no "tp" (its topics); an empty list means the course skips it`);
    const out = { s, ...(str(r.n) && { n: str(r.n) }), t, part: str(r.part) };
    if (!out.part) warnings.push(`${where}: no "part" (the heading it is listed under)`);
    if (str(r.am)) out.am = str(r.am);
    Object.assign(out, { x, c, cc, k: Array.isArray(r.k) ? r.k.map(str).filter(Boolean) : [] });
    if (str(r.note)) out.note = str(r.note);
    out.tp = tp;
    if (Number.isInteger(r.o)) out.o = r.o;
    if (Number.isInteger(r.q)) out.q = r.q;
    ids.add(s);
    data.push(out);
  });
  if (!data.length) errors.push('no usable entries');
  return { supp, areas, data, errors, warnings };
}

/**
 * The raw supplement in a page this viewer built (its SUPP, AREAS and DATA lines), so the build can
 * re-render a copied template with the current viewer. Null for any other page.
 */
export function readSupplementPage(html) {
  if (!/<meta name="generator" content="supplement\/v1 viewer">/.test(html)) return null;
  const get = (name) => {
    const l = html.split('\n').find((x) => x.startsWith(`const ${name} = `));
    try { return l ? JSON.parse(l.slice(`const ${name} = `.length).replace(/;\s*$/, '')) : null; } catch { return null; }
  };
  const supp = get('SUPP'), areas = get('AREAS'), data = get('DATA');
  return supp && Array.isArray(data) ? { ...supp, areas: areas || [], data } : null;
}

/** The viewer page for a normalized supplement. */
export function renderSupplement({ supp, areas, data }, { accent, noindex = false, comment = '' } = {}) {
  const color = /^#[0-9a-f]{6}$/i.test(accent || '') ? accent : supp.accent || '#3f6b4a';
  const intro = supp.intro || supp.description || '';
  return `<!doctype html>
${comment ? `<!--\n${comment.replace(/--/g, '—')}\n-->\n` : ''}<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(supp.title)}</title>
${supp.description ? `<meta name="description" content="${esc(supp.description)}">\n` : ''}<meta name="generator" content="${SUPPLEMENT_SCHEMA} viewer">
${noindex ? '<meta name="robots" content="noindex">\n' : ''}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="${FONTS}">
<style>
${asset('supplement.css')}:root{--accent:${color};--accent-dark:color-mix(in srgb, ${color} 50%, #fff)}
</style>
</head>
<body>
<div class="wrap">
  <header class="head">
    <h1>${esc(supp.title)}</h1>
    ${intro ? `<p>${esc(intro)}</p>` : ''}
  </header>
  <div class="bar" id="bar">
    <div class="row">
      <div class="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input id="q" type="search" autocomplete="off" spellcheck="false" placeholder="Search" aria-label="Search the supplement">
        <kbd id="kbd">/</kbd>
        <button class="clr" id="clr" hidden>Clear</button>
      </div>
    </div>
    <div class="row">
      <select class="pick" id="topic" aria-label="Filter by topic"></select>
      <select class="pick" id="jump" aria-label="Jump to"></select>
      <div class="seg" id="cseg" role="group" aria-label="Comments"><button id="c-closed" aria-pressed="true">Comments closed</button><button id="c-open" aria-pressed="false">Comments open</button></div>
      <span class="count" id="count" aria-live="polite"></span>
    </div>
  </div>
  <div class="layout">
    <nav class="toc" id="toc" aria-label="Index"></nav>
    <main id="list"></main>
  </div>
  ${supp.source ? `<p class="foot">${esc(supp.source)}</p>` : ''}
</div>
<button class="top" id="top" aria-label="Back to top">Top</button>
<script>
const SUPP = ${line(supp)};
const AREAS = ${line(areas)};
const DATA = ${line(data)};
</script>
<script>
${asset('supplement.js')}</script>
</body>
</html>
`;
}

/** The supplement as plain text, for the site's API, which can't run the page. */
export function supplementText({ supp, areas, data }) {
  const label = { fre: 'Rule', mrpc: 'Rule', frcp: 'Rule' }[supp.cite] || '§';
  return [supp.intro || supp.description || '', '', ...data.flatMap((s) => [
    `## ${label} ${s.s} ${s.t}`,
    s.tp.length ? `Topics: ${s.tp.map((n) => areas[n - 1]).filter(Boolean).join('; ')}` : '',
    s.note ? `Note: ${s.note}` : '',
    ...s.x.map(([l, t]) => `${l ? `${l} ` : ''}${t}`),
    ...s.c.map(([n, t]) => `Comment ${n}: ${t}`),
    '',
  ].filter((x, i, a) => x || a[i - 1])), supp.source || ''].join('\n').trim();
}
