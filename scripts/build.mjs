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
import { zipSync } from 'fflate';
import * as T from '../src/templates.mjs';

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
  outline:      { label: 'Outline',            plural: 'Outlines',           icon: 'book-open',   match: /outline/i },
  'rule-chart': { label: 'Rule Chart',         plural: 'Rule Charts',        icon: 'table',       match: /chart(?!s)/i },
  flowcharts:   { label: 'Flowcharts',         plural: 'Flowcharts',         icon: 'workflow',    match: /flow/i },
  flashcards:   { label: 'Flashcards',         plural: 'Flashcards',         icon: 'layers',      match: /card/i },
  practice:     { label: 'Practice Questions', plural: 'Practice Questions', icon: 'list-checks', match: /mcq|question|drill|quiz|exam|mpre/i },
  document:     { label: 'Document',           plural: 'Documents',          icon: 'file-text',   match: /.*/ },
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
const slugify = (s) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const write = (rel, data) => {
  const file = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
};

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–',
  hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', sect: '§', para: '¶',
  middot: '·', rarr: '→', larr: '←', bull: '•', times: '×', copy: '©', reg: '®', trade: '™',
  laquo: '«', raquo: '»', deg: '°', frac12: '½', check: '✓', le: '≤', ge: '≥', ne: '≠',
};
const decodeEntities = (s) =>
  s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z0-9]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

/** Visible text of an HTML document, keeping headings and list structure. */
function htmlToText(html) {
  let s = html.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1>/gi, '');
  // Flatten each table cell onto one line so rows read as "a | b | c".
  s = s.replace(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, tag, inner) =>
    inner.replace(/<\/(p|div|li)>|<br\b[^>]*>/gi, ' ').replace(/<li\b[^>]*>/gi, '') + ' | ');
  s = s.replace(/<h([1-6])\b[^>]*>/gi, (_, n) => '\n\n' + '#'.repeat(+n) + ' ')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer|table|ul|ol|blockquote|pre|dt|dd|figure|figcaption|summary|details|nav|aside|main)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  return s.split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').replace(/(\s*\|\s*)+$/, '').trim())
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

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
      if (IGNORED.has(name) || name.startsWith('.') || name.startsWith('~$') || !fs.statSync(file).isFile()) continue;
      const ext = path.extname(name).toLowerCase();
      const format = FORMATS[ext];
      if (!format) { console.warn(`  skip (unsupported format): ${dirent.name}/${name}`); continue; }
      const dm = meta.documents?.[name] || {};
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
        order: dm.order ?? 999,
        size: raw.length,
        updated: lastUpdated(file),
        raw,
        text: '',
        html: null,
        toc: [],
      };

      if (ext === '.docx') {
        const styleMap = ["p[style-name='Title'] => h1.doc-title:fresh", "p[style-name='Subtitle'] => p.doc-subtitle:fresh"];
        const { value } = await mammoth.convertToHtml({ buffer: raw }, { styleMap });
        const withIds = addHeadingIds(labelTableCells(value).replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>'));
        doc.html = withIds.html;
        doc.toc = withIds.toc;
        doc.text = htmlToText(value);
      } else if (format.mime === 'text/html') {
        let html = raw.toString('utf8');
        // Without a viewport tag, phones render the page zoomed out at desktop width when it is opened directly.
        if (!/<meta[^>]+name=["']viewport["']/i.test(html) && /<head[^>]*>/i.test(html)) {
          html = html.replace(/<head[^>]*>/i, (m) => `${m}
<meta name="viewport" content="width=device-width, initial-scale=1">`);
          doc.raw = Buffer.from(html, 'utf8');
          doc.size = doc.raw.length;
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

// Pages
const ctx = { config, subjects, docs, TYPES, P, generatedAt, allZipSize: allZipBytes.length };

write('index.html', T.home(ctx));
write('library/index.html', T.library(ctx));
write('404.html', T.notFound(ctx));
for (const s of subjects) write(P.subject(s) + 'index.html', T.subjectPage(ctx, s));
for (const d of docs) write(P.doc(d) + 'index.html', T.docPage(ctx, d));

const pageUrls = ['', 'library/', ...subjects.map(P.subject), ...docs.map(P.doc)];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pageUrls
  .map((u) => `  <url><loc>${abs(u)}</loc></url>`).join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${abs('sitemap.xml')}\n`);

console.log(`Built ${subjects.length} subjects, ${docs.length} documents -> dist/`);
