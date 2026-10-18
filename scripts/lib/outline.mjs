// Splits a course outline into sections and finds the section a question is about, so the
// game can send a player who misses a question straight to the part of the outline to review.
// Matching is plain TF-IDF over the section text; it needs no model and runs at build time.

import { decodeEntities, slugify } from './text.mjs';

const STOP = new Set(('the and for that with this from are was were which when what who whom whose will would could should may might must '
  + 'not but its his her their they them she him has have had been being does did done any all each other than then there these those '
  + 'into onto upon about over under after before because while such only also more most some can cannot under question answer correct '
  + 'following best likely court rule rules case cases under one two three under why how does doesn didn isn wasn aren').split(' '));

/** Words plus rule numbers ("404(b)", "1.6", "2-207") as matching terms. */
export function terms(text) {
  const out = [];
  for (const m of text.toLowerCase().matchAll(/\d+(?:[.\-]\d+)*(?:\([a-z0-9]+\))*|[a-z][a-z'’]+/g)) {
    const t = m[0].replace(/['’]s?$/, '');
    if (/^\d/.test(t) ? t.length >= 2 : t.length >= 4 && !STOP.has(t)) out.push(t);
  }
  return out;
}

const strip = (html) => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Give h1–h3 headings without an id one, so links can point at them. */
export function addHeadingIds(html) {
  const used = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  return html.replace(/<h([1-3])((?:(?!\sid=)[^>])*)>([\s\S]*?)<\/h\1>/gi, (whole, level, attrs, inner) => {
    const text = strip(inner);
    if (!text) return whole;
    let id = slugify(text).slice(0, 60) || 'section';
    for (let i = 2; used.has(id); i++) id = `${slugify(text).slice(0, 60)}-${i}`;
    used.add(id);
    return `<h${level}${attrs} id="${id}">${inner}</h${level}>`;
  });
}

/**
 * Sections of an HTML outline: one per h1–h3 heading that has an id, holding the text up to
 * the next heading. Titles carry their parent heading ("II. Formation › § 2-207").
 */
export function htmlSections(html) {
  const body = html.replace(/<(script|style|head|svg)\b[\s\S]*?<\/\1>/gi, '');
  const re = /<h([1-3])\b[^>]*\sid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/gi;
  const heads = [...body.matchAll(re)].map((m) => ({ level: +m[1], id: m[2], title: strip(m[3]), at: m.index, end: m.index + m[0].length }));
  // A lone h1 is the document's title, not a part of it, so it doesn't prefix section names.
  const titled = heads.filter((h) => h.level === 1).length === 1;
  const parents = [];
  return heads.filter((h) => h.title).map((h, i, all) => {
    parents.length = h.level - 1;
    const parent = parents.filter(Boolean).at(-1);
    parents[h.level - 1] = titled && h.level === 1 ? null : h.title;
    const next = all[i + 1]?.at ?? body.length;
    return { anchor: `#${h.id}`, title: parent && h.level > 1 ? `${parent} › ${h.title}` : h.title, text: `${h.title} ${h.title} ${strip(body.slice(h.end, next))}` };
  });
}

/**
 * Sections of a PDF outline: one per page, titled by its chapter (the largest text that starts
 * "Chapter N:") and the cases headed on that page (the next size down, "X v. Y").
 */
export async function pdfSections(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0, isEvalSupported: false }).promise;
  const out = [];
  let chapter = '';
  for (let n = 1; n <= doc.numPages; n++) {
    const items = (await (await doc.getPage(n)).getTextContent()).items.filter((i) => i.str.trim());
    const text = items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
    const start = items.findIndex((i) => /^Chapter \d+\s*:/.test(i.str));
    if (start >= 0) {
      const size = items[start].height;
      const parts = [];
      for (let i = start; i < items.length && Math.abs(items[i].height - size) < 1; i++) parts.push(items[i].str.trim());
      chapter = parts.join(' ').replace(/\s+/g, ' ');
    }
    const cases = [...new Set(items.filter((i) => i.height >= 12.5 && i.height < 16 && / v\. /.test(i.str)).map((i) => i.str.trim()))];
    const title = [chapter, cases.slice(0, 2).join('; ')].filter(Boolean).join(' · ') || `Page ${n}`;
    out.push({ anchor: `#page=${n}`, title: `${title} (p. ${n})`, text: `${cases.join(' ')} ${cases.join(' ')} ${text}` });
  }
  await doc.destroy();
  return out;
}

/** Index sections for matching; returns match(text, boost) => section index or -1. */
export function matcher(sections) {
  const docs = sections.map((s) => {
    const tf = new Map();
    for (const t of terms(s.text)) tf.set(t, (tf.get(t) || 0) + 1);
    return tf;
  });
  const df = new Map();
  for (const tf of docs) for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const idf = (t) => Math.log((sections.length + 1) / ((df.get(t) || 0) + 1));
  const vecs = docs.map((tf) => {
    const v = new Map();
    let norm = 0;
    for (const [t, n] of tf) { const w = (1 + Math.log(n)) * idf(t); v.set(t, w); norm += w * w; }
    return { v, norm: Math.sqrt(norm) || 1 };
  });
  return (text, boost = '') => {
    const q = new Map();
    for (const t of terms(text)) q.set(t, (q.get(t) || 0) + 1);
    for (const t of terms(boost)) q.set(t, (q.get(t) || 0) + 3);
    let best = -1;
    let bestScore = 0.04;
    vecs.forEach(({ v, norm }, i) => {
      let dot = 0;
      for (const [t, n] of q) if (v.has(t)) dot += v.get(t) * n * idf(t);
      const score = dot / norm;
      if (score > bestScore) { bestScore = score; best = i; }
    });
    return best;
  };
}
