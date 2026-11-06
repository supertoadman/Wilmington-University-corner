// The canonical multiple-choice format, "mcq/v1" (spec: docs/mcq-format.md). A set is one JSON
// object: metadata plus questions. It arrives as a `<Name>.mcq.json` file in content/<Subject>/, or
// inside any HTML page as `<script id="mcq-data" type="application/json">…</script>`; the build
// renders either into the standalone Shuffle-mode practice page (scripts/lib/practice-shell.mjs),
// and the game reader (scripts/lib/quiz.mjs) reads the questions back out of that page.
//
// Sets can come from anyone through submissions, and the build runs on those pull requests, so
// nothing here runs page code: the data is read with JSON.parse and every field is checked.

import { slugify } from './text.mjs';

export const MCQ_SCHEMA = 'mcq/v1';
export const MCQ_DATA_ID = 'mcq-data';
const BLOCK = /<script\b[^>]*\bid\s*=\s*["']mcq-data["'][^>]*>([\s\S]*?)<\/script>/i;
const MAX_CHOICES = 8;
const LETTERS = 'ABCDEFGH';

/** Choices that refer to each other, so their letters must not move when choices are shuffled. */
const L = String.raw`\(?[A-H]\)?`;
const FIXED_CHOICE = [
  /\b(?:all|none|both|neither|any)\s+of\s+the\s+(?:above|foregoing|other\s+(?:choices|answers))\b/i, // "None of the above"
  new RegExp(String.raw`^\s*(?:both\s+|either\s+|neither\s+)?${L}(?:\s*,\s*${L})*\s*,?\s*(?:and|or|nor|&)\s+${L}(?:\s+only)?(?:,?\s+but\s+not\s+${L})?\s*[.!]?\s*$`, 'i'), // "B and C", "A, B, and C"
  new RegExp(String.raw`^\s*(?:only\s+${L}|${L}\s+only)\s*\.?\s*$`, 'i'), // "A only"
  /\b(?:choices|answers|options)\s+\(?[A-H]\)?\s*(?:,|and|or|through)\s*\(?[A-H]\)?(?![\w])/i, // "choices A and B are both correct"
];
export const isFixedChoice = (text) => FIXED_CHOICE.some((re) => re.test(text));
// A rationale that names another choice by letter ("unlike choice B") breaks once the choices shuffle.
const LETTER_REF = /\b(?:choices?|options?|answers?)\s+\(?[A-H]\)?(?![\w])/;

/** The raw set in a `.mcq.json` text or an HTML page's mcq-data block, or null. Never executes anything. */
export function readMcq(text) {
  // Comments can't hide or fake a data block.
  const src = String(text).replace(/^\uFEFF/, '').replace(/<!--[\s\S]*?-->/g, '');
  let json = null;
  if (/^\s*\{/.test(src)) json = src;
  else {
    const m = src.match(BLOCK);
    if (m) json = m[1];
  }
  if (json == null) return null;
  let raw;
  try { raw = JSON.parse(json); } catch { return null; }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.questions)) return null;
  // A later major version is a different format; v1 readers leave it alone.
  if (raw.schema != null && !/^mcq\/v1(?:\.\d+)?$/.test(String(raw.schema))) return null;
  return raw;
}

/** True when an HTML page carries a canonical set (so the build renders it from the data). */
export const hasMcqBlock = (html) => BLOCK.test(String(html).replace(/<!--[\s\S]*?-->/g, ''));

/** The set as a script block that can sit in any HTML page: JSON with every "<" escaped. */
export function mcqDataBlock(set) {
  return `<script id="${MCQ_DATA_ID}" type="application/json">${JSON.stringify(set).replace(/</g, '\\u003c')}</script>`;
}

const str = (v) => (v == null ? '' : String(v).replace(/\r\n?/g, '\n').trim());
const isText = (v) => typeof v === 'string' || typeof v === 'number';

/**
 * Check and complete a raw set. Returns { set, errors, warnings }. A question with an error is left
 * out of `set` (the rest still work); a warning names something that works but should be fixed.
 */
export function normalizeMcq(raw) {
  const errors = [], warnings = [];
  const set = {
    schema: MCQ_SCHEMA,
    title: str(raw.title),
    description: str(raw.description),
    id: '',
    course: str(raw.course),
    modeDefault: raw.modeDefault === 'exam' ? 'exam' : 'study',
    areas: [],
    exams: [],
    hypos: {},
    questions: [],
  };
  if (!set.title) { warnings.push('set: no "title"; using "Practice Questions"'); set.title = 'Practice Questions'; }
  set.id = slugify(str(raw.id) || set.title) || 'practice';
  if (raw.modeDefault != null && !['study', 'exam'].includes(raw.modeDefault)) warnings.push(`set: "modeDefault" must be "study" or "exam", not ${JSON.stringify(raw.modeDefault)}`);
  if (raw.accent != null) {
    if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(String(raw.accent))) set.accent = String(raw.accent);
    else warnings.push('set: "accent" must be a hex color like "#3f6b4a"');
  }

  // Topic areas, in filter order. Questions may add areas the list doesn't name (with a warning).
  const areaList = Array.isArray(raw.areas) ? raw.areas.map(str).filter(Boolean) : [];
  if (raw.areas != null && !Array.isArray(raw.areas)) warnings.push('set: "areas" must be an array of strings');
  const areas = new Set(areaList);

  // Exams: [1, 2] or [{ "id": 1, "title": "Exam 1", "description": "…" }].
  const exams = new Map();
  for (const e of Array.isArray(raw.exams) ? raw.exams : []) {
    const id = isText(e) ? String(e) : e && isText(e.id) ? String(e.id) : '';
    if (!id) { warnings.push('set: every exam needs an "id"'); continue; }
    exams.set(id, { id, title: str(e?.title) || `Exam ${id}`, description: str(e?.description) });
  }
  const examsGiven = exams.size > 0;

  // Shared fact patterns: { "h1": "text" } or { "h1": { "label": "Q4–6 hypo", "text": "…" } }.
  for (const [id, h] of Object.entries(raw.hypos && typeof raw.hypos === 'object' ? raw.hypos : {})) {
    const text = str(typeof h === 'string' ? h : h?.text);
    if (!text) { warnings.push(`hypo ${id}: no text`); continue; }
    set.hypos[id] = { label: str(h?.label) || 'Facts', text };
  }

  const ids = new Set();
  raw.questions.forEach((r, i) => {
    const where = `question ${i + 1}${r && isText(r.id) ? ` (id ${r.id})` : ''}`;
    if (!r || typeof r !== 'object') { errors.push(`${where}: not an object`); return; }
    let id = isText(r.id) ? String(r.id).trim() : '';
    if (!id) { id = String(i + 1); warnings.push(`${where}: no "id"; using "${id}" (ids keep saved progress and variations stable)`); }
    if (ids.has(id)) { errors.push(`${where}: duplicate id "${id}"`); return; }
    const q = str(r.q ?? r.stem);
    if (!q) { errors.push(`${where}: no question text ("q")`); return; }
    // Choices: ["…", "…"], or the bar-style [["choice", "why"], …] pairs.
    let o = r.o, oe = r.oe;
    if (Array.isArray(o) && o.length && o.every(Array.isArray)) { oe = oe ?? o.map((x) => x[1]); o = o.map((x) => x[0]); }
    if (!Array.isArray(o) || o.length < 2 || o.length > MAX_CHOICES || !o.every((x) => isText(x) && str(x))) {
      errors.push(`${where}: "o" must be 2–${MAX_CHOICES} non-empty choices`);
      return;
    }
    o = o.map(str);
    let a = r.a;
    if (typeof a === 'string' && /^[A-H]$/i.test(a.trim())) a = LETTERS.indexOf(a.trim().toUpperCase());
    if (!Number.isInteger(a) || a < 0 || a >= o.length) { errors.push(`${where}: "a" must be the index (0–${o.length - 1}) of the correct choice`); return; }
    if (!Array.isArray(oe) || oe.length !== o.length || !oe.every((x) => isText(x) && str(x))) {
      errors.push(`${where}: "oe" must give a rationale for every choice (${o.length})`);
      return;
    }
    oe = oe.map(str);
    if (new Set(o.map((x) => x.toLowerCase())).size !== o.length) warnings.push(`${where}: two choices have the same text`);

    const area = str(r.area ?? r.topic);
    if (!area) warnings.push(`${where}: no "area" (the topic filter and the outline match use it)`);
    else if (!areas.has(area)) { if (areaList.length) warnings.push(`${where}: area "${area}" isn't in "areas"`); areas.add(area); }

    let exam = isText(r.exam) ? String(r.exam) : '';
    if (exam && !exams.has(exam)) {
      if (examsGiven) warnings.push(`${where}: exam "${exam}" isn't in "exams"`);
      exams.set(exam, { id: exam, title: `Exam ${exam}`, description: '' });
    }

    let hypo = str(r.hypo ?? r.h);
    if (hypo && !set.hypos[hypo]) { warnings.push(`${where}: hypo "${hypo}" isn't in "hypos"`); hypo = ''; }

    // "None of the above", "B and C": the choices keep their letters even if the author forgot to say so.
    let fixed = r.fixed === true;
    if (!fixed && o.some(isFixedChoice)) {
      if (r.fixed === false) warnings.push(`${where}: kept "fixed" because its choices refer to each other`);
      fixed = true;
    }
    if (!fixed && [...oe, str(r.e)].some((x) => LETTER_REF.test(x))) warnings.push(`${where}: a rationale names a choice by letter, but the choices shuffle (set "fixed": true or reword)`);

    const out = { id, q, o, a, oe };
    if (exam) out.exam = exam;
    if (area) out.area = area;
    if (str(r.tag)) out.tag = str(r.tag);
    if (hypo) out.hypo = hypo;
    if (str(r.e)) out.e = str(r.e);
    if (isText(r.v) && String(r.v).trim()) out.v = String(r.v).trim();
    if (str(r.pre)) out.pre = str(r.pre);
    if (fixed) out.fixed = true;
    ids.add(id);
    set.questions.push(out);
  });

  // Variations: the original's facts, for the "Show the question this varies" toggle.
  const byId = new Map(set.questions.map((q) => [q.id, q]));
  for (const q of set.questions) {
    if (!q.v) continue;
    const parent = byId.get(q.v);
    if (!parent) { warnings.push(`question ${q.id}: varies "${q.v}", which isn't in the set`); delete q.v; continue; }
    if (parent === q) { warnings.push(`question ${q.id}: varies itself`); delete q.v; continue; }
    q.pre ||= [parent.hypo && set.hypos[parent.hypo].text, parent.q].filter(Boolean).join('\n\n');
  }
  // Numbers within each exam (or the set), in order.
  const count = new Map();
  for (const q of set.questions) { const k = q.exam ?? ''; count.set(k, (count.get(k) || 0) + 1); q.n = count.get(k); }

  set.areas = [...areas];
  set.exams = [...exams.values()];
  if (!set.questions.length) errors.push('set: no usable questions');
  return { set, errors, warnings };
}

/** Questions in the shape the game and Shuffle mode use (see scripts/lib/quiz.mjs). */
export function mcqToQuiz(set) {
  return set.questions.map((q) => ({
    q: [q.hypo && set.hypos[q.hypo]?.text, q.q].filter(Boolean).join('\n\n'),
    o: q.o, a: q.a, oe: q.oe, e: q.e ?? null,
    topic: [q.area, q.tag].filter(Boolean).join(' — ') || null,
    n: q.id,
    pre: q.pre,
    fixed: q.fixed,
  }));
}

/** The set as plain text, for the site's API (.txt / .json / llms-full.txt), which can't run the page. */
export function mcqText(set) {
  const exam = new Map(set.exams.map((e) => [e.id, e.title]));
  const lines = [];
  for (const q of set.questions) {
    lines.push(`## ${q.exam ? `${exam.get(q.exam) || `Exam ${q.exam}`} · ` : ''}Q${q.n}${q.area ? ` · ${q.area}` : ''}${q.tag ? ` — ${q.tag}` : ''}`);
    if (q.hypo) lines.push(`Facts: ${set.hypos[q.hypo].text}`);
    if (q.v) lines.push(`(Varies question ${q.v}.)`);
    lines.push(q.q, '');
    q.o.forEach((x, k) => lines.push(`${LETTERS[k]}. ${x}`));
    lines.push('', `Answer: ${LETTERS[q.a]}`);
    q.oe.forEach((x, k) => lines.push(`- ${LETTERS[k]}: ${x}`));
    if (q.e) lines.push(`Rule: ${q.e}`);
    lines.push('');
  }
  return lines.join('\n').trim();
}
