// Build step for Sanctum Run (/play/): the game's question data and its art.
//
// - play/data/index.json lists each course with practice sets the game can read, and the
//   sections of the course outline (title + link) that questions point to for review.
// - play/data/<course>/<set>.json holds that set's questions (see scripts/lib/quiz.mjs).
// - play/pack/ is the runtime part of the asset pack in Assets/temple run/: WebP art, SVG tiles,
//   Ogg/AAC audio, and pack.json, a slim manifest with only what the game draws or plays.

import fs from 'node:fs';
import path from 'node:path';
import { extractQuestions } from './lib/quiz.mjs';
import { htmlSections, pdfSections, matcher } from './lib/outline.mjs';

const PACK_IDS = [
  /^(divine|corrupt)-(laurel|wisdom|aegis|gateway|column|temple)$/,
  /^(divine|corrupt)-(barrier|trap|slide-lintel-back|slide-lintel-front|dead-end-wall|gap-edge|toppled-statue|brazier-obstacle)$/,
  /^(divine|corrupt)-(statue|brazier|cypress|broken-wall|urn)$/,
  /^(divine|corrupt)-(far-sky|middle-ruins|near-clouds|near-smoke)$/,
  /^(divine|corrupt)-(socrates|plato|aristotle)-moves$/,
  /^(divine|corrupt)-chaser-run$/,
  /^(divine|corrupt)-guardian-[a-z]+$/,
  /^(divine|corrupt)-tile-(plain|inlay|edge|gap)$/,
  /^(divine|corrupt)-effect-(ring|spark|shadow)$/,
];

/** The outline a wrong answer links to: the course's outline, else its rule chart. */
const outlineOf = (s) => s.documents.find((d) => d.type === 'outline') || s.documents.find((d) => d.type === 'rule-chart');

async function sectionsOf(doc) {
  if (!doc) return [];
  try {
    if (doc.html) return htmlSections(doc.html);
    if (doc.ext === '.pdf') return await pdfSections(doc.raw);
    if (doc.format.mime === 'text/html') return htmlSections(doc.raw.toString('utf8'));
  } catch (e) {
    console.warn(`  game: couldn't read the sections of ${doc.id}: ${e.message}`);
  }
  return [];
}

function copyPack(root, dist) {
  const src = path.join(root, 'Assets', 'temple run');
  const manifestFile = path.join(src, 'manifest.json');
  if (!fs.existsSync(manifestFile)) {
    console.warn('  game: Assets/temple run/manifest.json not found; /play/ will have no art.');
    return 0;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const assets = {};
  const files = new Set();
  for (const a of manifest.assets) {
    if (a.type !== 'audio' && !PACK_IDS.some((re) => re.test(a.id))) continue;
    const entry = { src: a.src, w: a.width, h: a.height, anchor: a.anchor };
    if (a.frames) entry.frames = Object.fromEntries(Object.entries(a.frames).map(([k, f]) => [k, [f.x, f.y, f.width, f.height]]));
    if (a.animations) entry.animations = a.animations;
    if (a.type === 'audio') {
      Object.assign(entry, { duration: a.duration, loop: !!a.loop, sources: a.sources.map((s) => ({ src: s.src, type: s.mimeType, loopStart: s.loopStart ?? 0 })) });
      delete entry.w; delete entry.h; delete entry.anchor;
      a.sources.forEach((s) => files.add(s.src));
    } else files.add(a.src);
    assets[a.id] = entry;
  }
  let bytes = 0;
  for (const rel of files) {
    const from = path.join(src, rel);
    if (!fs.existsSync(from)) { console.warn(`  game: missing pack file ${rel}`); continue; }
    const to = path.join(dist, 'play', 'pack', rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    bytes += fs.statSync(from).size;
  }
  fs.writeFileSync(path.join(dist, 'play', 'pack', 'pack.json'), JSON.stringify({ palettes: manifest.palettes, assets }));
  return bytes;
}

export async function buildGame({ subjects, P, write, root, dist }) {
  const courses = [];
  let total = 0;
  for (const s of subjects) {
    const outline = outlineOf(s);
    const sections = await sectionsOf(outline);
    const match = sections.length ? matcher(sections) : () => -1;
    const sets = [];
    for (const d of s.documents) {
      if (d.type !== 'practice' || d.format.mime !== 'text/html') continue;
      const questions = extractQuestions(d.raw.toString('utf8'));
      if (!questions.length) continue;
      for (const q of questions) {
        const section = match([q.q, q.o[q.a], q.e, q.oe?.[q.a]].filter(Boolean).join(' '), q.topic || '');
        if (section >= 0) q.s = section;
      }
      write(`play/data/${s.slug}/${d.slug}.json`, JSON.stringify(questions));
      sets.push({ slug: d.slug, title: d.title, count: questions.length, url: P.doc(d) });
      total += questions.length;
    }
    if (!sets.length) continue;
    courses.push({
      slug: s.slug, title: s.title, accent: s.accent,
      guardian: (s.icon.match(/^statue-angel-([a-z]+)$/) || [])[1] || null,
      outline: outline ? { title: outline.title, url: P.doc(outline) } : null,
      sections: sections.map((x) => [x.title, P.doc(outline) + x.anchor]),
      sets,
    });
  }
  write('play/data/index.json', JSON.stringify({ courses }));
  fs.cpSync(path.join(root, 'src', 'game'), path.join(dist, 'play'), { recursive: true, filter: (f) => !f.endsWith('.html') });
  const packBytes = copyPack(root, dist);
  console.log(`Game: ${total} questions from ${courses.reduce((n, c) => n + c.sets.length, 0)} practice sets, ${(packBytes / 1048576).toFixed(1)} MB of art and audio`);
  return { courses, total };
}
