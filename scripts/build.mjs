// Static site generator for the study library.
//
// Scans content/<Subject>/ folders, reads optional subject.json metadata, and writes
// a complete static site to dist/: human pages, raw files for download, ZIP bundles,
// and a machine-readable API (catalog, per-document JSON + plain text, llms.txt,
// OpenAPI) for agents and other integrations.
//
// Usage: node scripts/build.mjs

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import mammoth from 'mammoth';
import { zipSync, unzipSync, strFromU8, strToU8 } from 'fflate';
import * as T from '../src/templates.mjs';
import { slugify, decodeEntities, htmlToText } from './lib/text.mjs';
import { addHeadingIds as idHeadings } from './lib/outline.mjs';
import { buildGame } from './game.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content');
const DIST = path.join(ROOT, 'dist');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
config.url = config.url.endsWith('/') ? config.url : config.url + '/';
config.basePath = new URL(config.url).pathname;

// ---------------------------------------------------------------------------
// Document types. Add a new entry here to introduce a new kind of material.
// `match` is tested against the file name when subject.json does not set a type.
// ---------------------------------------------------------------------------
const TYPES = {
  outline:      { label: 'Outline',            plural: 'Outlines',           icon: 'statue-athena',        match: /outline/i },
  'rule-chart': { label: 'Rule Chart',         plural: 'Rule Charts',        icon: 'statue-themis',        match: /chart(?!s)/i },
  flowcharts:   { label: 'Flowcharts',         plural: 'Flowcharts',         icon: 'statue-mercury',       match: /flow/i },
  flashcards:   { label: 'Flashcards',         plural: 'Flashcards',         icon: 'statue-apollo',        match: /card/i },
  practice:     { label: 'Practice Questions', plural: 'Practice Questions', icon: 'statue-janus',         match: /mcq|question|drill|quiz|exam|mpre/i },
  document:     { label: 'Document',           plural: 'Documents',          icon: 'statue-philosopher',   match: /.*/ },
};

const FORMATS = {
  '.html': { label: 'HTML', mime: 'text/html', viewer: 'frame' },
  '.htm':  { label: 'HTML', mime: 'text/html', viewer: 'frame' },
  '.docx': { label: 'Word', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', viewer: 'docx' },
  '.pdf':  { label: 'PDF',  mime: 'application/pdf', viewer: 'frame' },
  '.md':   { label: 'Markdown', mime: 'text/markdown', viewer: 'text' },
  '.txt':  { label: 'Text', mime: 'text/plain', viewer: 'text' },
};

const IGNORED = new Set(['subject.json', '.DS_Store', 'Thumbs.db', 'desktop.ini']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const write = (rel, data) => {
  const file = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
};

const headingsFrom = (text) =>
  text.split('\n').filter((l) => /^#{1,3} /.test(l)).map((l) => l.replace(/^#+ /, ''));

function lastUpdated(file) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', file], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    if (out) return new Date(out).toISOString();
  } catch { /* not a git checkout */ }
  return fs.statSync(file).mtime.toISOString();
}

function addHeadingIds(html) {
  const used = new Set();
  const toc = [];
  const out = html.replace(/<h([1-3])>([\s\S]*?)<\/h\1>/g, (_, level, inner) => {
    const text = decodeEntities(inner.replace(/<[^>]+>/g, '')).trim();
    let id = slugify(text) || 'section';
    for (let i = 2; used.has(id); i++) id = `${slugify(text)}-${i}`;
    used.add(id);
    if (level !== '3') toc.push({ level: +level, id, text });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  return { html: out, toc };
}

/**
 * Word outlines that mark "outside the class materials" text only by font color (subject.json
 * `"outsideColor": "7030A0"`): give runs in that color a highlight mammoth can read, so they come
 * out as <span class="outside">. The outline's own key names the color, so keep its tone.
 */
function markOutsideRuns(raw, color) {
  const files = unzipSync(new Uint8Array(raw));
  const re = new RegExp(`<w:color w:val="${color}"[^>]*/>`, 'gi');
  files['word/document.xml'] = strToU8(strFromU8(files['word/document.xml']).replace(re, (m) => `${m}<w:highlight w:val="darkMagenta"/>`));
  return Buffer.from(zipSync(files));
}
const outsideTone = (hex) => {
  const [r, g, b] = hex.match(/../g).map((h) => parseInt(h, 16));
  if (Math.max(r, g, b) - Math.min(r, g, b) < 48) return 'gray';
  return b > g && r > g ? 'purple' : r > g && g >= b ? 'orange' : 'accent';
};

const titleCase = (s) => s.replace(/[A-Z][A-Z'’]+/g, (w) => w[0] + w.slice(1).toLowerCase());

/**
 * Opt-in (`"theme": "structured"` in subject.json) for Word outlines that fake their layout with
 * one-cell tables: the title box (or opening bold title line) becomes a masthead, "I. Title    WEEK 1"
 * boxes and real Heading 2s become section bands (so the Contents panel works), Heading 1 "PART I —"
 * lines become part dividers, "RULE / CASE / ROADMAP / EXAM TIPS   …" boxes become labelled callouts,
 * case boxes and "Name  MAIN CASE · CLASS 1" case cards become case callouts, and bold-only paragraphs
 * between them become <h3> subheadings. Word's own table of contents is dropped.
 */
const CALLOUT_KINDS = { RULE: 'rule', CASE: 'case', ROADMAP: 'roadmap', 'EXAM TIPS': 'tips', TIP: 'tips', TIPS: 'tips', NOTE: 'note', TRAP: 'tips', KEY: 'key' };
// Principal cases; cases the casebook only notes; cases only cited; cases only on a slide; cases only in the casebook.
const CASE_KINDS = { 'MAIN CASE': 'main', 'NOTE CASE': 'note', 'CITED ONLY': 'cited', 'SLIDE REFERENCE': 'slide', 'SUPPLEMENTAL READING': 'supp' };
const CASE_LABEL = Object.keys(CASE_KINDS).join('|');
function structureOutline(html, tone) {
  let first = true;
  html = html
    .replace(/<a id="_[^"]*"><\/a>/g, '')
    .replace(/<p><strong>Contents<\/strong><\/p>(?:<p><a href="#_Toc[^"]*">[\s\S]*?<\/a><\/p>)+/, '')
    .replace(/class="outside"/g, `class="outside outside-${tone}"`)
    // An opening bold title line, followed by plain lines, is the title block.
    .replace(/^<p><strong>([^<]+)<\/strong><\/p>((?:<p>(?!<strong>[^<]*<\/strong><\/p>)[\s\S]*?<\/p>)*)/, (_, title, rest) => {
      first = false;
      const [subtitle, ...meta] = (rest.match(/<p>[\s\S]*?<\/p>/g) || []).map((p) => p.replace(/^<p>|<\/p>$/g, ''));
      return `<header class="doc-masthead"><h1 class="doc-title">${/[a-z]/.test(title.replace(/&\w+;/g, '')) ? title : titleCase(title)}</h1>${subtitle ? `<p class="doc-subtitle">${subtitle}</p>` : ''}${meta.map((m) => `<p class="doc-meta">${m}</p>`).join('')}</header>`;
    })
    .replace(/<h1>([\s\S]*?)<\/h1>/g, (_, text) => {
      const part = text.match(/^PART ([IVXLC]+)\s*[—–-]\s*([\s\S]+)$/);
      return `<div class="part-band"><h1>${part ? `<span class="part-kicker">Part ${part[1]}<span class="sr-only"> — </span></span>` : ''}${titleCase(part ? part[2] : text)}</h1></div>`;
    })
    .replace(/<h2>([\s\S]*?)<\/h2>/g, '<div class="section-band"><h2>$1</h2></div>')
    // "Name (Court Year)  MAIN CASE · CLASS 1" followed by Facts / Held / Why it matters lines.
    .replace(new RegExp(`<p><strong>([^<]+)</strong>\\s*<strong>\\s*(${CASE_LABEL})\\s*·\\s*([^<]*?)\\s*</strong></p>((?:<p><strong>(?:Facts|Held|Why it matters):[\\s\\S]*?</p>)*)`, 'g'),
      (_, name, label, detail, body) => `<aside class="callout callout-case case-${CASE_KINDS[label]}"><span class="callout-tag">${label.toLowerCase()} · ${detail.toLowerCase()}</span><p class="callout-title">${name}</p>${body}</aside>`)
    // The outline's key to those labels.
    .replace(new RegExp(`<p>\\s*<strong>\\s*(${CASE_LABEL})((?:\\s*·\\s*[^<]*?)?)\\s*</strong>\\s*`, 'g'),
      (_, label, detail) => `<p class="case-legend"><span class="case-chip case-${CASE_KINDS[label]}">${label.toLowerCase()}${detail.toLowerCase()}</span> `);
  const out = html.replace(/<table><tr><td>((?:(?!<\/?t(?:able|r|d)\b)[\s\S])*)<\/td><\/tr><\/table>/g, (whole, inner, offset) => {
    const isFirst = first && offset === 0;
    first = false;
    if (!inner.trim()) return '';
    const paras = inner.match(/<p>[\s\S]*?<\/p>/g) || [];
    if (isFirst) {
      const [title, subtitle, ...meta] = paras.map((p) => p.replace(/^<p>(?:<strong>)?|(?:<\/strong>)?<\/p>$/g, ''));
      return `<header class="doc-masthead"><h1 class="doc-title">${title}</h1>${subtitle ? `<p class="doc-subtitle">${subtitle}</p>` : ''}${meta.map((m) => `<p class="doc-meta">${m}</p>`).join('')}</header>`;
    }
    const head = inner.match(/^<p><strong>([A-Z][A-Z ]*?)( ★)?\s{2,}/);
    if (head && (CALLOUT_KINDS[head[1]] || CASE_KINDS[head[1]])) {
      const cls = CASE_KINDS[head[1]] ? `case case-${CASE_KINDS[head[1]]}` : CALLOUT_KINDS[head[1]];
      let body = inner.replace(head[0], '<p><strong>').replace(/^<p><strong><\/strong>\s*/, '<p>');
      // A first line that is only bold text is the callout's own title.
      body = body.replace(/^<p><strong>([^<]*)<\/strong><\/p>/, '<p class="callout-title">$1</p>')
        .replace(/<p><strong>((?:Source|In the casebook):)<\/strong>/g, '<p class="callout-source"><strong>$1</strong>');
      return `<aside class="callout callout-${cls}"><span class="callout-tag">${head[1].toLowerCase()}${head[2] ? ' <span class="callout-star" title="Has its own class slide">★</span>' : ''}</span>${body}</aside>`;
    }
    const section = paras.length === 1 && inner.match(/^<p><strong>((?:[IVXLC]+\.|Part\b)[^<]*?)(?:\s{2,}(WEEKS? [^<]+))?<\/strong><\/p>$/);
    if (section) {
      return `<div class="section-band"><h2>${section[1].trim()}</h2>${section[2] ? `<span class="section-week">${section[2].trim().toLowerCase()}</span>` : ''}</div>`;
    }
    return whole;
  });
  // Bold-only paragraphs outside tables and callouts are subheadings.
  const headed = out.split(/(<table>[\s\S]*?<\/table>|<aside[\s\S]*?<\/aside>|<header[\s\S]*?<\/header>)/).map((part, i) =>
    i % 2 ? part : part.replace(/<p><strong>([^<]+)<\/strong><\/p>/g, '<h3>$1</h3>')).join('');
  // A case card's Facts / Held / Why it matters lines each get their own class, so each can wear its color.
  const fields = headed.replace(/<p><strong>(Facts|Held|Why it matters):\s*<\/strong>\s*/g, (_, label) =>
    `<p class="case-field case-${label === 'Why it matters' ? 'why' : label.toLowerCase()}"><strong class="case-label">${label}:</strong> `);
  return rainbowElements(numberedLines(fields));
}

/**
 * The elements of a rule, "(1) … (2) … (3) …" or "(a) … (b) …", each take the next color of the rainbow
 * (`<span class="el el-1">`…). Only a run that starts at (1) or (a) and counts up counts, so a lone
 * statutory "(c)" or a citation like "§ 2-207(2)" is left alone. Text is wrapped node by node, so the
 * spans never cross a tag. Tables (colored by row), tip boxes (pink) and Facts / Held lines are skipped.
 */
const EL_COLORS = 6;
function rainbowElements(html) {
  const tokens = html.split(/(<[^>]+>)/);
  const BLOCK = new Set(['p', 'li', 'ul', 'ol', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'aside', 'div', 'header', 'table', 'tr', 'thead', 'tbody', 'br']);
  const out = [];
  let skipTag = null;    // the tag whose region is being skipped
  let block = [];        // indexes into `out` of the current block's text tokens
  const flush = () => { if (block.length) colorBlock(out, block); block = []; };
  for (const tok of tokens) {
    if (tok.startsWith('<')) {
      const [, close, name = '', attrs = ''] = tok.match(/^<(\/?)([a-z0-9]+)([^>]*)>/i) || [];
      const tag = name.toLowerCase();
      if (skipTag) {
        if (close && tag === skipTag) skipTag = null;
      } else if (!close && (tag === 'table' || (tag === 'aside' && /callout-tips/.test(attrs)) || (tag === 'p' && /case-(facts|held)/.test(attrs)))) {
        skipTag = tag;
      }
      if (BLOCK.has(tag)) flush();
      out.push(tok);
    } else {
      if (!skipTag && tok) block.push(out.length);
      out.push(tok);
    }
  }
  flush();
  return out.join('');
}
function colorBlock(out, idxs) {
  const text = idxs.map((i) => out[i]).join('');
  const markers = [...text.matchAll(/(?<=^|\s)\((\d{1,2}|[a-h])\)/g)];
  // Runs that start at (1)/(a) and count up by one; a new (1)/(a) starts the next run.
  const runs = [];
  let seq = null;
  for (const m of markers) {
    const want = seq && (/\d/.test(seq[0][1]) ? String(seq.length + 1) : String.fromCharCode(97 + seq.length));
    if (seq && m[1] === want) seq.push(m);
    else if (m[1] === '1' || m[1] === 'a') runs.push(seq = [m]);
  }
  // Each element runs to the next marker; the last one to the end of its sentence (or to where the next run starts).
  const ranges = [];
  runs.filter((r) => r.length > 1).forEach((r, n, all) => {
    const limit = n + 1 < all.length ? all[n + 1][0].index : text.length;
    const last = r[r.length - 1];
    const tail = text.slice(last.index, limit).search(/[.;](?=\s+[A-Z]|\s*$)/);
    const end = tail < 0 ? limit : last.index + tail + 1;
    r.forEach((m, k) => ranges.push([m.index, k + 1 < r.length ? r[k + 1].index : end, (k % EL_COLORS) + 1]));
  });
  if (!ranges.length) return;
  let pos = 0;
  for (const i of idxs) {
    const t = out[i];
    const from = pos;
    pos += t.length;
    let res = '';
    let at = from;
    for (const [a, b, c] of ranges) {
      if (b <= at || a >= pos) continue;
      const s = Math.max(a, at);
      const e = Math.min(b, pos);
      res += t.slice(at - from, s - from) + `<span class="el el-${c}">${t.slice(s - from, e - from)}</span>`;
      at = e;
    }
    out[i] = res + t.slice(at - from);
  }
}

/** Consecutive "1.  Step" paragraphs (a numbered list of elements typed as plain lines) take rainbow colors too. */
function numberedLines(html) {
  return html.replace(/(?:<p><strong>\d{1,2}\.(?:\s|&nbsp;)[\s\S]*?<\/p>){2,}/g, (run) => {
    let k = 0;
    return run.replace(/<p><strong>(\d{1,2})\./g, (m, n) => `<p class="el-line el-${(k++ % EL_COLORS) + 1}"><strong>${n}.`);
  });
}

/** Data rows of a structured outline's tables cycle through the rainbow, so a row reads across at a glance. */
function rainbowRows(html) {
  return html.replace(/<table>[\s\S]*?<\/table>/g, (table) => {
    let i = -1;
    return table.replace(/<tr>/g, () => (++i ? `<tr class="rb rb-${((i - 1) % EL_COLORS) + 1}">` : '<tr>'));
  });
}

/** Tag each table cell with its column heading (data-label) so phones can show rows as labelled cards. */
function labelTableCells(html) {
  return html.replace(/<table>([\s\S]*?)<\/table>/g, (table, inner) => {
    const rows = inner.match(/<tr>[\s\S]*?<\/tr>/g);
    if (!rows || rows.length < 2) return table;
    const cellRe = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/g;
    const labels = [...rows[0].matchAll(cellRe)].map((m) => decodeEntities(m[3].replace(/<[^>]+>/g, '')).trim().replace(/"/g, '&quot;'));
    let first = true;
    return table.replace(/<tr>[\s\S]*?<\/tr>/g, (row) => {
      if (first) { first = false; return row; }
      let i = 0;
      return row.replace(/<(td|th)\b([^>]*)>/g, (m, tag, attrs) => (labels[i] ? `<${tag}${attrs} data-label="${labels[i++]}">` : (i++, m)));
    });
  });
}

// ---------------------------------------------------------------------------
// Load content
// ---------------------------------------------------------------------------
async function loadSubjects() {
  const subjects = [];
  for (const dirent of fs.readdirSync(CONTENT, { withFileTypes: true })) {
    if (!dirent.isDirectory() || dirent.name.startsWith('.') || dirent.name.startsWith('_')) continue;
    const dir = path.join(CONTENT, dirent.name);
    const metaFile = path.join(dir, 'subject.json');
    const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
    const slug = meta.slug || slugify(dirent.name);
    const subject = {
      id: slug,
      slug,
      folder: dirent.name,
      title: meta.title || dirent.name,
      description: meta.description || '',
      icon: meta.icon || 'folder-open',
      accent: meta.accent || '#1e3a5f',
      order: meta.order ?? 999,
      documents: [],
    };

    const usedSlugs = new Set();
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      if (IGNORED.has(name) || name.endsWith('.meta.json') || name.startsWith('.') || name.startsWith('~$') || !fs.statSync(file).isFile()) continue;
      const ext = path.extname(name).toLowerCase();
      const format = FORMATS[ext];
      if (!format) { console.warn(`  skip (unsupported format): ${dirent.name}/${name}`); continue; }
      // Per-document metadata: subject.json entry, overridden by an optional "<file>.meta.json" sidecar
      // (submissions use sidecars so they never have to edit a shared file).
      const sidecarFile = `${file}.meta.json`;
      const sidecar = fs.existsSync(sidecarFile) ? JSON.parse(fs.readFileSync(sidecarFile, 'utf8')) : {};
      const dm = { ...(meta.documents?.[name] || {}), ...sidecar };
      if (dm.publish === false) { console.log(`  skip (publish: false): ${dirent.name}/${name}`); continue; }

      const base = path.basename(name, ext);
      let docSlug = dm.slug || slugify(base);
      for (let i = 2; usedSlugs.has(docSlug); i++) docSlug = `${dm.slug || slugify(base)}-${i}`;
      usedSlugs.add(docSlug);

      const type = dm.type && TYPES[dm.type] ? dm.type
        : Object.keys(TYPES).find((k) => TYPES[k].match.test(base));
      const raw = fs.readFileSync(file);
      const doc = {
        id: `${slug}/${docSlug}`,
        slug: docSlug,
        subject,
        filename: name,
        ext,
        format,
        type,
        title: dm.title || base.replace(/[_-]+/g, ' ').trim(),
        description: dm.description || '',
        tags: dm.tags || [],
        questions: dm.questions ?? null,
        contributor: dm.contributor || null,
        theme: dm.theme || null,
        order: dm.order ?? 999,
        size: raw.length,
        updated: lastUpdated(file),
        raw,
        text: '',
        html: null,
        toc: [],
      };

      if (ext === '.docx') {
        const styleMap = ["p[style-name='Title'] => h1.doc-title:fresh", "p[style-name='Subtitle'] => p.doc-subtitle:fresh", "highlight[color='darkMagenta'] => span.outside"];
        const source = dm.outsideColor ? markOutsideRuns(raw, dm.outsideColor) : raw;
        const { value } = await mammoth.convertToHtml({ buffer: source }, { styleMap });
        const shaped = dm.theme === 'structured' ? structureOutline(value, dm.outsideColor ? outsideTone(dm.outsideColor) : 'accent') : value;
        const labelled = dm.theme === 'structured' ? rainbowRows(labelTableCells(shaped)) : labelTableCells(shaped);
        const withIds = addHeadingIds(labelled.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>'));
        doc.html = withIds.html;
        doc.toc = withIds.toc;
        doc.text = htmlToText(value);
      } else if (format.mime === 'text/html') {
        let html = raw.toString('utf8');
        // Without a viewport tag, phones render the page zoomed out at desktop width when it is opened directly.
        if (!/<meta[^>]+name=["']viewport["']/i.test(html)) {
          const tag = '<meta name="viewport" content="width=device-width, initial-scale=1">';
          // Insert after <head>, <html> or the doctype, whichever exists; some files are bare fragments.
          const anchor = [/<head[^>]*>/i, /<html[^>]*>/i, /<!doctype[^>]*>/i].find((re) => re.test(html));
          html = anchor ? html.replace(anchor, (m) => `${m}
${tag}`) : `${tag}
${html}`;
          doc.raw = Buffer.from(html, 'utf8');
          doc.size = doc.raw.length;
        }
        // Outlines get heading ids so the game (and anyone) can link to a section.
        if (type === 'outline') {
          const withIds = idHeadings(html);
          if (withIds !== html) {
            html = withIds;
            doc.raw = Buffer.from(html, 'utf8');
            doc.size = doc.raw.length;
          }
        }
        doc.text = htmlToText(html);
        if (!dm.title) {
          const t = html.match(/<title>([^<]*)<\/title>/i);
          if (t) doc.title = decodeEntities(t[1]).trim();
        }
        if (!dm.description) {
          const d = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
          if (d) doc.description = decodeEntities(d[1]);
        }
      } else if (format.viewer === 'text') {
        doc.text = raw.toString('utf8');
      }
      doc.headings = headingsFrom(doc.text);
      if (!doc.description) doc.description = doc.text.replace(/^#+ .*$/gm, '').replace(/\s+/g, ' ').trim().slice(0, 220);
      subject.documents.push(doc);
    }
    subject.documents.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    subjects.push(subject);
  }
  return subjects.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
const subjects = await loadSubjects();
const docs = subjects.flatMap((s) => s.documents);
const generatedAt = new Date().toISOString();

// Empty dist/ rather than deleting it, so an open shell or preview server inside it doesn't block the build.
fs.mkdirSync(DIST, { recursive: true });
for (const entry of fs.readdirSync(DIST)) fs.rmSync(path.join(DIST, entry), { recursive: true, force: true });

// URL helpers (paths relative to site root, no leading slash)
const P = {
  subject: (s) => `subjects/${s.slug}/`,
  doc: (d) => `subjects/${d.subject.slug}/${d.slug}/`,
  file: (d) => `files/${d.subject.slug}/${d.slug}${d.ext}`,
  zip: (s) => `files/${s.slug}/${s.slug}-all-files.zip`,
  json: (d) => `api/documents/${d.subject.slug}/${d.slug}.json`,
  text: (d) => `api/documents/${d.subject.slug}/${d.slug}.txt`,
  subjectJson: (s) => `api/subjects/${s.slug}.json`,
};
const abs = (rel) => config.url + rel;

// Static assets
fs.cpSync(path.join(ROOT, 'src', 'assets'), path.join(DIST, 'assets'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'node_modules', 'fuse.js', 'dist', 'fuse.min.mjs'), path.join(DIST, 'assets', 'vendor-fuse.min.mjs'));
// PDF.js renders PDFs on phones and tablets, whose browsers only show the first page of an embedded PDF.
const PDFJS = path.join(ROOT, 'node_modules', 'pdfjs-dist');
fs.mkdirSync(path.join(DIST, 'assets', 'pdfjs'), { recursive: true });
for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs']) fs.copyFileSync(path.join(PDFJS, 'legacy', 'build', f), path.join(DIST, 'assets', 'pdfjs', f));
fs.cpSync(path.join(PDFJS, 'standard_fonts'), path.join(DIST, 'assets', 'pdfjs', 'standard_fonts'), { recursive: true });
write('.nojekyll', '');

// Raw files + ZIP bundles
const allZip = {};
for (const s of subjects) {
  const zip = {};
  for (const d of s.documents) {
    write(P.file(d), d.raw);
    zip[d.filename] = [new Uint8Array(d.raw), { mtime: new Date(d.updated) }];
    allZip[`${s.folder}/${d.filename}`] = zip[d.filename];
  }
  s.zipSize = 0;
  if (s.documents.length) {
    const z = zipSync(zip, { level: 9 });
    s.zipSize = z.length;
    write(P.zip(s), z);
  }
}
const allZipBytes = zipSync(allZip, { level: 9 });
write('files/all-study-materials.zip', allZipBytes);

// Public (serialisable) records shared by the API and the page templates
const docRecord = (d) => ({
  id: d.id,
  subject: d.subject.slug,
  subjectTitle: d.subject.title,
  slug: d.slug,
  title: d.title,
  description: d.description,
  type: d.type,
  typeLabel: TYPES[d.type].label,
  format: d.format.label,
  mimeType: d.format.mime,
  originalFilename: d.filename,
  tags: d.tags,
  questions: d.questions,
  contributor: d.contributor,
  sizeBytes: d.size,
  updated: d.updated,
  headings: d.headings.slice(0, 60),
  urls: {
    page: abs(P.doc(d)),
    file: abs(P.file(d)),
    download: abs(P.file(d)),
    text: abs(P.text(d)),
    json: abs(P.json(d)),
  },
});
const subjectRecord = (s) => ({
  id: s.id,
  slug: s.slug,
  title: s.title,
  description: s.description,
  accent: s.accent,
  documentCount: s.documents.length,
  urls: { page: abs(P.subject(s)), json: abs(P.subjectJson(s)), zip: s.documents.length ? abs(P.zip(s)) : null },
  documents: s.documents.map((d) => d.id),
});

const siteRecord = {
  title: config.title,
  description: config.tagline,
  url: config.url,
  repository: config.repo,
  generatedAt,
};

// API
write('api/catalog.json', JSON.stringify({
  schemaVersion: '1.0',
  site: siteRecord,
  types: Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [k, { label: v.label }])),
  subjects: subjects.map(subjectRecord),
  documents: docs.map(docRecord),
  bundles: { all: abs('files/all-study-materials.zip') },
}, null, 2));

for (const s of subjects) {
  write(P.subjectJson(s), JSON.stringify({ ...subjectRecord(s), documents: s.documents.map(docRecord) }, null, 2));
}
for (const d of docs) {
  write(P.json(d), JSON.stringify({ ...docRecord(d), text: d.text }, null, 2));
  write(P.text(d), `${d.title}\n${'='.repeat(d.title.length)}\n\nSubject: ${d.subject.title}\nType: ${TYPES[d.type].label}\nSource: ${abs(P.doc(d))}\n\n${d.description}\n\n---\n\n${d.text}\n`);
}

write('api/search-index.json', JSON.stringify(docs.map((d) => ({
  id: d.id,
  title: d.title,
  description: d.description,
  subject: d.subject.title,
  type: TYPES[d.type].label,
  tags: d.tags.join(' '),
  headings: d.headings.slice(0, 80).join(' · ').slice(0, 2000),
  url: P.doc(d),
  svg: T.icon(TYPES[d.type].icon),
  accent: d.subject.accent,
}))));

write('api/openapi.json', JSON.stringify(T.openapi(config), null, 2));

write('llms.txt', [
  `# ${config.title}`,
  '',
  `> ${config.tagline}`,
  '',
  'Machine-readable endpoints (static JSON, CORS-friendly via GitHub Pages):',
  `- [Catalog](${abs('api/catalog.json')}): every subject and document with metadata and URLs`,
  `- [Search index](${abs('api/search-index.json')}): compact index for keyword search`,
  `- [OpenAPI spec](${abs('api/openapi.json')}): describes the endpoints above`,
  `- [Full text](${abs('llms-full.txt')}): plain text of every document in one file`,
  '',
  ...subjects.flatMap((s) => [
    `## ${s.title}`,
    '',
    s.description,
    '',
    ...s.documents.map((d) => `- [${d.title}](${abs(P.text(d))}): ${TYPES[d.type].label}. ${d.description}`),
    '',
  ]),
].join('\n'));

write('llms-full.txt', docs.map((d) =>
  `# ${d.title}\n\nSubject: ${d.subject.title} | Type: ${TYPES[d.type].label} | URL: ${abs(P.doc(d))}\n\n${d.text}\n`).join('\n\n---\n\n'));

// The game: question data, art, and its page
const game = await buildGame({ subjects, P, write, root: ROOT, dist: DIST });

// Pages
const ctx = { config, subjects, docs, TYPES, P, generatedAt, allZipSize: allZipBytes.length, game };

write('index.html', T.home(ctx));
write('play/index.html', T.play(ctx));
write('library/index.html', T.library(ctx));
write('contribute/index.html', T.contribute(ctx));
write('404.html', T.notFound(ctx));
write('admin/index.html', T.admin(ctx)); // owner-only editor; deliberately left out of the sitemap
for (const s of subjects) write(P.subject(s) + 'index.html', T.subjectPage(ctx, s));
for (const d of docs) write(P.doc(d) + 'index.html', T.docPage(ctx, d));

const pageUrls = ['', 'library/', 'contribute/', 'play/', ...subjects.map(P.subject), ...docs.map(P.doc)];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pageUrls
  .map((u) => `  <url><loc>${abs(u)}</loc></url>`).join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${abs('sitemap.xml')}\n`);

console.log(`Built ${subjects.length} subjects, ${docs.length} documents -> dist/`);
