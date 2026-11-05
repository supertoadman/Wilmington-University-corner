// Reads the real study materials in content/ for the demo: subjects, their practice sets (every
// question the game can ask, via scripts/lib/quiz.mjs) and the rule coverage map (COV) that the
// bar-style sets carry. Nothing from a page is executed; see literal.mjs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractQuestions } from '../../scripts/lib/quiz.mjs';
import { slugify } from '../../scripts/lib/text.mjs';
import { literalNamed } from './literal.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const CONTENT = path.join(ROOT, 'content');

// Short prefixes for rule ids ("sal.2204") and where each subject sits in the NCBE exams.
export const SUBJECT_INFO = {
  'agency-and-partnership': { short: 'agp', ncbe: 'Business Associations (MEE)' },
  'civil-procedure': { short: 'cvp', ncbe: 'Civil Procedure (MBE)' },
  'con-law-ii': { short: 'cl2', ncbe: 'Constitutional Law (MBE)' },
  'contracts-i': { short: 'k1', ncbe: 'Contracts (MBE)' },
  evidence: { short: 'evd', ncbe: 'Evidence (MBE)' },
  'professional-responsibility': { short: 'prs', ncbe: 'Professional Responsibility (MPRE)' },
  'sales-and-leases': { short: 'sal', ncbe: 'Contracts: UCC Article 2 (MBE/MEE)' },
};

const read = (file) => fs.readFileSync(file, 'utf8');

/** Every subject folder in content/, in the site's order, with the documents the demo uses. */
export function loadSubjectDefs() {
  const defs = [];
  for (const dirent of fs.readdirSync(CONTENT, { withFileTypes: true })) {
    if (!dirent.isDirectory() || dirent.name.startsWith('.') || dirent.name.startsWith('_')) continue;
    const dir = path.join(CONTENT, dirent.name);
    const metaFile = path.join(dir, 'subject.json');
    const meta = fs.existsSync(metaFile) ? JSON.parse(read(metaFile)) : {};
    const id = meta.slug || slugify(dirent.name);
    const docs = Object.entries(meta.documents || {}).map(([file, dm]) => ({
      file, path: path.join(dir, file), slug: dm.slug || slugify(path.basename(file, path.extname(file))),
      title: dm.title || path.basename(file, path.extname(file)).replace(/[_-]+/g, ' ').trim(), type: dm.type, theme: dm.theme, outsideColor: dm.outsideColor, order: dm.order ?? 999,
    })).filter((d) => fs.existsSync(d.path));
    const refs = meta.refs || {};
    defs.push({
      id, folder: dirent.name, dir, title: meta.title || dirent.name, description: meta.description || '', accent: meta.accent || '#1e3a5f',
      order: meta.order ?? 999, refs, docs,
      sets: docs.filter((d) => d.type === 'practice' && d.file.endsWith('.html')),
      outlineDoc: docs.find((d) => d.slug === refs.outline) || null,
      statutesDoc: docs.find((d) => d.slug === refs.statutes) || null,
      ...SUBJECT_INFO[id],
    });
  }
  return defs.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

/**
 * The questions in one practice set, each with the rule codes it covers (`cov`), its area, and the
 * set-local id of the question it varies (`parentKey`) where the set says so, plus the set's COV map.
 */
export function readSet(file) {
  const html = read(file);
  const questions = extractQuestions(html);
  const QB = literalNamed(html, 'QB');
  const COV = literalNamed(html, 'COV');
  if (Array.isArray(QB) && Array.isArray(QB[0]?.o?.[0])) {
    const byId = new Map(QB.map((q) => [String(q.id), q]));
    for (const q of questions) {
      const src = byId.get(String(q.n));
      if (!src) continue;
      if (Array.isArray(src.cov)) q.cov = src.cov.map(String);
      q.qArea = src.area == null ? null : String(src.area);
      const parent = src.v || (String(src.id).match(/^(.*\d)V\d*$/) || [])[1];
      if (parent) q.parentKey = String(parent);
      q.srcId = String(src.id);
    }
  }
  return { questions, COV: COV && typeof COV === 'object' ? COV : null };
}
