// Static site generator for the study library.
//
// Scans content/<Subject>/ folders, reads optional subject.json metadata, and writes
// a complete static site to dist/: human pages, raw files for download, ZIP bundles,
// and a machine-readable API (catalog, per-document JSON + plain text, llms.txt,
// OpenAPI) for agents and other integrations.
//
// Usage: node scripts/build.mjs
// (SITE_CONTENT_DIR and SITE_DIST_DIR point it at another content folder and output folder; the
// tests build a small fixture site that way.)

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import * as T from '../src/templates.mjs';
import { slugify, decodeEntities, htmlToText } from './lib/text.mjs';
import { addHeadingIds as idHeadings } from './lib/outline.mjs';
import { convertDocx } from './lib/docx.mjs';
import { mp3Duration } from './lib/audio.mjs';
import { refIndex, injectRefs } from './lib/refs.mjs';
import { readMcq, normalizeMcq, hasMcqBlock, mcqText } from './lib/mcq.mjs';
import { renderPracticeShell, injectAnswerLog } from './lib/practice-shell.mjs';
import { readSupplement, readSupplementPage, normalizeSupplement, renderSupplement, supplementText } from './lib/supplement-shell.mjs';
import { buildOutlineDocx } from './templates/build-outline-docx.mjs';
import { buildGame } from './game.mjs';
import { buildSurvivors } from './survivors.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = process.env.SITE_CONTENT_DIR ? path.resolve(process.env.SITE_CONTENT_DIR) : path.join(ROOT, 'content');
const DIST = process.env.SITE_DIST_DIR ? path.resolve(process.env.SITE_DIST_DIR) : path.join(ROOT, 'dist');
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
  music:        { label: 'Music',              plural: 'Music',              icon: 'statue-echo',          match: /(?!)/ }, // audio files default to music
  document:    { label: 'Document',           plural: 'Documents',          icon: 'statue-philosopher',   match: /.*/ },
};

const FORMATS = {
  '.html': { label: 'HTML', mime: 'text/html', viewer: 'frame' },
  '.htm':  { label: 'HTML', mime: 'text/html', viewer: 'frame' },
  '.docx': { label: 'Word', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', viewer: 'docx' },
  '.pdf':  { label: 'PDF',  mime: 'application/pdf', viewer: 'frame' },
  '.md':   { label: 'Markdown', mime: 'text/markdown', viewer: 'text' },
  '.txt':  { label: 'Text', mime: 'text/plain', viewer: 'text' },
  '.mp3':  { label: 'MP3', mime: 'audio/mpeg', viewer: 'audio' },
};
// A folder of audio files: shown as one player, downloaded as a ZIP of its tracks.
const PLAYLIST = { label: 'Playlist', mime: 'application/zip', viewer: 'playlist' };
// The deploy pushes dist/ to the gh-pages branch, and GitHub refuses files over 100 MB, so a playlist
// bigger than this gets no ZIP; its tracks download one at a time.
const MAX_ZIP_BYTES = 95 * 1048576;

const IGNORED = new Set(['subject.json', '.DS_Store', 'Thumbs.db', 'desktop.ini']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const write = (rel, data) => {
  const file = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
};

const copy = (from, rel) => {
  const file = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.copyFileSync(from, file);
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

/**
 * A track's length from the start of its file, so timing a track doesn't read all of it (the tracks
 * are copied to dist/ as files); the whole file is read only if its first frame lies past that.
 */
function trackDuration(file, size) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(Math.min(size, 10));
    fs.readSync(fd, head, 0, head.length, 0);
    const tag = head.toString('latin1', 0, 3) === 'ID3' ? 10 + ((head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9]) : 0;
    const buf = Buffer.alloc(Math.min(size, tag + 262144));
    fs.readSync(fd, buf, 0, buf.length, 0);
    const seconds = mp3Duration(buf, size);
    return seconds === undefined ? mp3Duration(fs.readFileSync(file)) : seconds;
  } finally {
    fs.closeSync(fd);
  }
}

// ---------------------------------------------------------------------------
// Canonical sources (docs/mcq-format.md, docs/supplement-format.md). The build renders them into
// their standalone pages, so every set gets the current Shuffle-mode shell and every supplement the
// current viewer, whatever the source file carried:
//   <Name>.mcq.json, or an .html page with an mcq-data block   -> the practice shell (type practice)
//   <Name>.supplement.json, or a page the viewer built          -> the supplement viewer (type document)
// Returns null for any other file, { skip: true } for a canonical file with nothing usable.
// ---------------------------------------------------------------------------
function compile(name, bytes, accent, label) {
  const isJson = (kind) => name.toLowerCase().endsWith(`.${kind}.json`);
  if (!isJson('mcq') && !isJson('supplement') && !/\.html?$/i.test(name)) return null;
  const text = bytes.toString('utf8');
  const tell = (errors, warnings) => {
    const all = [...errors.map((e) => `error: ${e}`), ...warnings.map((w) => `warning: ${w}`)];
    if (!all.length) return;
    console.warn(`  ${label}: ${errors.length} error(s), ${warnings.length} warning(s) (npm run check -- <file> lists them)`);
    for (const m of all.slice(0, 8)) console.warn(`    ${m}`);
    if (all.length > 8) console.warn(`    … and ${all.length - 8} more`);
  };
  if (isJson('mcq') || hasMcqBlock(text)) {
    const raw = readMcq(text);
    if (!raw) { console.warn(`  ${label}: not an mcq/v1 set (docs/mcq-format.md)`); return isJson('mcq') ? { skip: true } : null; }
    const { set, errors, warnings } = normalizeMcq(raw);
    tell(errors, warnings);
    if (!set.questions.length) return { skip: true };
    return { type: 'practice', html: renderPracticeShell(set, { accent }), questions: set.questions.length, text: mcqText(set) };
  }
  const raw = isJson('supplement') ? readSupplement(text) : readSupplementPage(text);
  if (!raw) {
    if (isJson('supplement')) { console.warn(`  ${label}: not a supplement/v1 supplement (docs/supplement-format.md)`); return { skip: true }; }
    return null;
  }
  const supp = normalizeSupplement(raw);
  tell(supp.errors, supp.warnings);
  if (!supp.data.length) return { skip: true };
  return { type: 'document', html: renderSupplement(supp, { accent }), text: supplementText(supp) };
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
      refs: meta.refs || null,
      order: meta.order ?? 999,
      documents: [],
    };

    const usedSlugs = new Set();
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      if (IGNORED.has(name) || name.endsWith('.meta.json') || name.startsWith('.') || name.startsWith('~$')) continue;
      // A folder of audio files is one playlist document; its tracks play in file-name order.
      const isPlaylist = fs.statSync(file).isDirectory();
      const trackFiles = isPlaylist ? fs.readdirSync(file).filter((f) => FORMATS[path.extname(f).toLowerCase()]?.viewer === 'audio')
        .sort((a, b) => a.localeCompare(b, 'en', { numeric: true })) : [];
      if (isPlaylist && !trackFiles.length) { console.warn(`  skip (folder without audio): ${dirent.name}/${name}`); continue; }
      // A canonical data file (.mcq.json, .supplement.json) is built into an HTML page.
      const dataFile = !isPlaylist && /\.(?:mcq|supplement)\.json$/i.test(name);
      const ext = isPlaylist ? '.zip' : dataFile ? '.html' : path.extname(name).toLowerCase();
      const format = isPlaylist ? PLAYLIST : FORMATS[ext];
      if (!format) { console.warn(`  skip (unsupported format): ${dirent.name}/${name}`); continue; }
      // Per-document metadata: subject.json entry, overridden by an optional "<file>.meta.json" sidecar
      // (submissions use sidecars so they never have to edit a shared file).
      const sidecarFile = `${file}.meta.json`;
      const sidecar = fs.existsSync(sidecarFile) ? JSON.parse(fs.readFileSync(sidecarFile, 'utf8')) : {};
      const dm = { ...(meta.documents?.[name] || {}), ...sidecar };
      if (dm.publish === false) { console.log(`  skip (publish: false): ${dirent.name}/${name}`); continue; }

      const base = isPlaylist ? name : dataFile ? name.replace(/\.(?:mcq|supplement)\.json$/i, '') : path.basename(name, ext);
      let raw = isPlaylist ? null : fs.readFileSync(file);
      const compiled = isPlaylist ? null : compile(name, raw, subject.accent, `${dirent.name}/${name}`);
      if (compiled?.skip) { console.warn(`  skip (nothing usable): ${dirent.name}/${name}`); continue; }
      if (compiled) raw = Buffer.from(compiled.html, 'utf8');
      let docSlug = dm.slug || slugify(base);
      for (let i = 2; usedSlugs.has(docSlug); i++) docSlug = `${dm.slug || slugify(base)}-${i}`;
      usedSlugs.add(docSlug);

      const type = dm.type && TYPES[dm.type] ? dm.type
        : compiled ? compiled.type
        : format.viewer === 'audio' || isPlaylist ? 'music'
        : Object.keys(TYPES).find((k) => TYPES[k].match.test(base));
      // Track titles and notes come from the playlist's "tracks" metadata, keyed by file name.
      const tracks = trackFiles.map((f) => {
        const tm = dm.tracks?.[f] || {};
        const tbase = path.basename(f, path.extname(f));
        const tfile = path.join(file, f);
        const size = fs.statSync(tfile).size;
        return {
          file: f,
          slug: slugify(tbase.replace(/^\d+[\s_.-]*/, '')) || slugify(tbase),
          ext: path.extname(f).toLowerCase(),
          number: tm.number ?? (Number(tbase.match(/^\d+/)?.[0]) || null),
          title: tm.title || tbase.replace(/^\d+[\s_.-]*/, '').replace(/[_-]+/g, ' ').trim(),
          topic: tm.topic || '',
          description: tm.description || '',
          duration: trackDuration(tfile, size),
          size,
          path: tfile,
        };
      });
      const trackBytes = tracks.reduce((n, t) => n + t.size, 0);
      const zipped = !isPlaylist || trackBytes <= MAX_ZIP_BYTES;
      if (isPlaylist) raw = zipped ? Buffer.from(zipSync(Object.fromEntries(tracks.map((t) => [t.file, [new Uint8Array(fs.readFileSync(t.path)), { level: 0 }]]))))
        : null;
      const doc = {
        id: `${slug}/${docSlug}`,
        slug: docSlug,
        subject,
        filename: isPlaylist ? `${name}.zip` : dataFile ? `${base}.html` : name,
        source: name,
        tracks: isPlaylist ? tracks : null,
        ext,
        format,
        type,
        title: dm.title || base.replace(/[_-]+/g, ' ').trim(),
        description: dm.description || '',
        tags: dm.tags || [],
        questions: dm.questions ?? compiled?.questions ?? null,
        contributor: dm.contributor || null,
        theme: dm.theme || null,
        // A page built from an mcq/v1 set: the site's copy reports its answers to Your stats.
        practiceShell: compiled?.type === 'practice',
        order: dm.order ?? 999,
        size: raw ? raw.length : trackBytes,
        zipped,
        updated: lastUpdated(file),
        raw,
        text: '',
        html: null,
        toc: [],
      };

      if (ext === '.docx') {
        const converted = await convertDocx(raw, { theme: dm.theme, outsideColor: dm.outsideColor });
        doc.html = converted.html;
        doc.toc = converted.toc;
        doc.text = converted.text;
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
        // A canonical page's questions or sections live in its data; the API gets them as text.
        if (compiled) doc.text = compiled.text;
      } else if (format.viewer === 'text') {
        doc.text = raw.toString('utf8');
      } else if (isPlaylist) {
        doc.text = tracks.map((t) => [`## ${t.number ? `${t.number}. ` : ''}${t.title}`, t.topic, t.description].filter(Boolean).join('\n')).join('\n\n');
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
  track: (d, t) => `files/${d.subject.slug}/${d.slug}/${t.slug}${t.ext}`,
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

// Reference popup: a subject whose subject.json names its statutes and outline
// ("refs": { "statutes": "<doc slug>", "outline": "<doc slug>" }, plus "cite" naming how the
// statutes are cited when they aren't UCC sections: "fre", "mrpc", "frcp", "restatement" or
// "section" (STYLES in src/assets/refs.js), and "fullNames": [...] for case parties its questions
// also use for other cases) gets an index of both, and its HTML practice pages, canonical .mcq.json
// sets included, load src/assets/refs.js to look things up from any question. Only the served copy
// gets the script tags; downloads and ZIPs stay as written. See docs/supplement-format.md.
const refPages = new Set();
// Pages ask for refs.js, its stylesheet, and the indexes with a version taken from their contents,
// so a browser's cached copy from before a deploy can't pair an old index with new code.
const refsHash = createHash('sha1');
for (const f of ['refs.js', 'refs.css']) refsHash.update(fs.readFileSync(path.join(ROOT, 'src', 'assets', f)));
for (const s of subjects.filter((x) => x.refs)) {
  const find = (slug) => slug && s.documents.find((d) => d.slug === slug);
  const statutes = find(s.refs.statutes), outline = find(s.refs.outline);
  if (!statutes && !outline) { console.warn(`  refs: no statutes or outline found for ${s.slug}`); continue; }
  if (s.refs.cite && !['ucc', 'fre', 'mrpc', 'frcp', 'restatement', 'section'].includes(s.refs.cite)) console.warn(`  refs: ${s.slug} has an unknown "cite" (${s.refs.cite}); cites will read as UCC sections`);
  const index = refIndex({
    supplementHtml: statutes?.raw.toString('utf8'),
    outlineHtml: outline && (outline.html ?? outline.raw.toString('utf8')),
    links: { statutes: statutes && P.doc(statutes), outline: outline && P.doc(outline) },
    cite: s.refs.cite,
    fullNames: s.refs.fullNames,
  });
  const json = JSON.stringify(index);
  refsHash.update(json);
  write(`assets/refs/${s.slug}.json`, json);
  for (const d of s.documents) if (d.type === 'practice' && d.format.mime === 'text/html') refPages.add(d);
}
const refsVersion = refsHash.digest('hex').slice(0, 10);
// Pages built from an mcq/v1 set also load assets/practice-log.js, which records their graded answers
// for Your stats (/stats/). Like the reference popup, only the served copy gets it.
const logVersion = createHash('sha1').update(fs.readFileSync(path.join(ROOT, 'src', 'assets', 'answer-log.js')))
  .update(fs.readFileSync(path.join(ROOT, 'src', 'assets', 'practice-log.js'))).digest('hex').slice(0, 10);
const withRefs = (d) => {
  if (!refPages.has(d) && !d.practiceShell) return d.raw;
  let html = d.raw.toString('utf8');
  if (d.practiceShell) html = injectAnswerLog(html, { set: d.id, version: logVersion });
  if (refPages.has(d)) html = injectRefs(html, { slug: d.subject.slug, version: refsVersion });
  return Buffer.from(html, 'utf8');
};

// Raw files + ZIP bundles
const allZip = {};
for (const s of subjects) {
  const zip = {};
  for (const d of s.documents) {
    if (d.zipped) write(P.file(d), withRefs(d));
    d.tracks?.forEach((t) => copy(t.path, P.track(d, t)));
    // Music stays out of the course and site ZIPs, which would otherwise pass GitHub's 100 MB file limit.
    if (d.type === 'music') continue;
    zip[d.filename] = [new Uint8Array(d.raw), { mtime: new Date(d.updated) }];
    allZip[`${s.folder}/${d.filename}`] = zip[d.filename];
  }
  s.zipSize = 0;
  if (Object.keys(zip).length) {
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
  tracks: d.tracks && d.tracks.map((t) => ({
    number: t.number, title: t.title, topic: t.topic, description: t.description,
    durationSeconds: t.duration && Math.round(t.duration), sizeBytes: t.size, url: abs(P.track(d, t)),
  })),
  contributor: d.contributor,
  sizeBytes: d.size,
  updated: d.updated,
  headings: d.headings.slice(0, 60),
  urls: {
    page: abs(P.doc(d)),
    file: d.zipped ? abs(P.file(d)) : null,
    download: d.zipped ? abs(P.file(d)) : null,
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

// Authoring specs for the canonical formats, for AI agents and people who write new materials. They
// sit with the other machine-readable files under api/: listed in llms.txt, api/specs/index.json and
// docs/agents-api.md, but linked from no page and left out of the sitemap.
const SPECS = [
  { file: 'outline-format.md', from: 'docs/outline-format.md', title: 'Outline format (outline/v1)', description: 'How to write a Word outline the site turns into headings, callouts and case cards, and that the reference popup indexes (sections, case keys, worked problems).' },
  { file: 'supplement-format.md', from: 'docs/supplement-format.md', title: 'Statutory / rule supplement format (supplement/v1)', description: 'The AREAS and DATA contract behind a course supplement and the reference popup, and the citation styles (ucc, fre, mrpc, frcp, restatement, section).' },
  { file: 'mcq-format.md', from: 'docs/mcq-format.md', title: 'MCQ practice set format (mcq/v1)', description: 'The canonical multiple-choice schema, the Shuffle-mode practice page it builds into, and the citation rules that make every question link to the supplement and outline.' },
  { file: 'ai-prompts.md', from: 'docs/ai-prompts.md', title: 'Prompt templates', description: 'Copy-paste prompts for generating an outline, a supplement and a practice set in these formats.' },
  { file: 'mcq-shuffle-template.html', from: 'docs/templates/mcq-shuffle-template.html', title: 'MCQ practice page template', description: 'The standalone Shuffle-mode practice page with a sample mcq/v1 set; replace the JSON in its mcq-data block.' },
  { file: 'supplement-template.html', from: 'docs/templates/supplement-template.html', title: 'Supplement viewer template', description: 'The standalone supplement viewer with sample UCC data; replace its SUPP, AREAS and DATA lines.' },
  { file: 'sample.mcq.json', from: 'docs/templates/sample.mcq.json', title: 'Sample mcq/v1 set', description: 'Six Sales and Leases questions using every mcq/v1 feature.' },
  { file: 'sample.supplement.json', from: 'docs/templates/sample.supplement.json', title: 'Sample supplement/v1 data', description: 'Seven UCC sections in the supplement/v1 format.' },
  { file: 'sample-outline.json', from: 'docs/templates/sample-outline.json', title: 'Sample outline/v1 data', description: 'An outline as data, for scripts/templates/build-outline-docx.mjs.' },
  { file: 'sample-outline.docx', build: () => buildOutlineDocx(JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'templates', 'sample-outline.json'), 'utf8'))), title: 'Sample outline (Word)', description: 'sample-outline.json built into the Word file the site reads.' },
].filter((sp) => sp.build || fs.existsSync(path.join(ROOT, sp.from)) || console.warn(`  specs: missing ${sp.from}`));
const SPEC_TYPES = { '.md': 'text/markdown', '.html': 'text/html', '.json': 'application/json', '.docx': FORMATS['.docx'].mime };
for (const sp of SPECS) write(`api/specs/${sp.file}`, sp.build ? sp.build() : fs.readFileSync(path.join(ROOT, sp.from)));
write('api/specs/index.json', JSON.stringify({
  schemaVersion: '1.0',
  formats: { mcq: 'mcq/v1', supplement: 'supplement/v1', outline: 'outline/v1' },
  specs: SPECS.map(({ file, title, description }) => ({ name: file, title, description, mediaType: SPEC_TYPES[path.extname(file)], url: abs(`api/specs/${file}`) })),
}, null, 2));

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
  'Authoring specs, for agents that write new outlines, supplements and practice sets in the formats the site builds and links automatically:',
  `- [Spec index](${abs('api/specs/index.json')}): every spec and template below, with media types`,
  ...SPECS.map((sp) => `- [${sp.title}](${abs(`api/specs/${sp.file}`)}): ${sp.description}`),
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

// The games (Sanctum Run at /play/, Crypt Survivors at /survivors/) are local-only: the published site
// leaves out their pages, code, art and every link to them. `npm run dev:games` (or build --games)
// builds them for play on this computer. The question data in play/data/ is always built, because
// Shuffle mode and Your stats read it too.
const GAMES = process.argv.includes('--games');
const game = await buildGame({ subjects, P, write, root: ROOT, dist: DIST, withGame: GAMES });
// Crypt Survivors: its code and sprite pack (its questions are the game's play/data/).
const survivorsPack = GAMES && game.total ? buildSurvivors({ root: ROOT, dist: DIST, write }) : null;

// Pages
const ctx = { config, subjects, docs, TYPES, P, generatedAt, allZipSize: allZipBytes.length, game, games: GAMES && game.total > 0, refsVersion, survivors: survivorsPack };

write('index.html', T.home(ctx));
if (ctx.games) write('play/index.html', T.play(ctx));
if (game.total) write('shuffle/index.html', T.shuffle(ctx));
if (ctx.games) write('survivors/index.html', T.survivors(ctx));
if (game.total) write('stats/index.html', T.stats(ctx));
write('library/index.html', T.library(ctx));
write('contribute/index.html', T.contribute(ctx));
write('404.html', T.notFound(ctx));
write('admin/index.html', T.admin(ctx)); // owner-only editor; deliberately left out of the sitemap
for (const s of subjects) write(P.subject(s) + 'index.html', T.subjectPage(ctx, s));
for (const d of docs) write(P.doc(d) + 'index.html', T.docPage(ctx, d));

const pageUrls = ['', 'library/', 'contribute/', ...(game.total ? ['shuffle/', 'stats/'] : []), ...(ctx.games ? ['play/', 'survivors/'] : []), ...subjects.map(P.subject), ...docs.map(P.doc)];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pageUrls
  .map((u) => `  <url><loc>${abs(u)}</loc></url>`).join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${abs('sitemap.xml')}\n`);

console.log(`Built ${subjects.length} subjects, ${docs.length} documents -> dist/`);
