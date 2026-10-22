// Reads the multiple-choice questions out of the site's HTML practice sets, so the game
// (Sanctum Run, /play/) can ask them. Each practice tool keeps its bank in an inline script;
// the formats below cover every tool in content/ today. Detection goes by what the page
// contains, not its file name, so a new set in a known format joins the game automatically.
//
// Every question comes out in one shape:
//   { q: stem, o: [choices], a: index of the correct choice, e: explanation or null,
//     oe: [per-choice explanations] or null, topic: label or null, n: number in its set,
//     pre: the original facts, for a variation of another question (only when there is one),
//     fixed: true when the choices must keep their order (only when set) }
// Most source formats store the correct choice first; the game shuffles them.
//
// Practice sets can arrive from anyone through submissions, and the build runs on those pull
// requests, so nothing here executes page code: data is read by a parser that accepts only
// literals (strings, numbers, true/false/null, arrays, objects) and fails on anything else.

import { decodeEntities } from './text.mjs';

const BS = String.fromCharCode(92);
const ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };

/** Parse one JavaScript data literal starting at src[i]. Returns { value, end } or throws. */
function parseLiteral(src, i) {
  const ws = () => {
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src.startsWith('//', i)) { const n = src.indexOf('\n', i); i = n < 0 ? src.length : n; } else if (src.startsWith('/*', i)) { const n = src.indexOf('*/', i); if (n < 0) throw new Error('comment'); i = n + 2; } else return;
    }
  };
  const string = () => {
    const quote = src[i++];
    let out = '';
    while (i < src.length && src[i] !== quote) {
      const c = src[i++];
      if (quote === '`' && c === '$' && src[i] === '{') throw new Error('template expression');
      if (c !== BS) { out += c; continue; }
      const e = src[i++];
      if (e === 'u') {
        const hex = src[i] === '{' ? src.slice(i + 1, src.indexOf('}', i)) : src.slice(i, i + 4);
        i += src[i] === '{' ? hex.length + 2 : 4;
        out += String.fromCodePoint(parseInt(hex, 16));
      } else if (e === 'x') { out += String.fromCharCode(parseInt(src.slice(i, i + 2), 16)); i += 2; } else if (e === '\r' || e === '\n') { if (e === '\r' && src[i] === '\n') i++; } else out += ESCAPES[e] ?? e;
    }
    if (src[i++] !== quote) throw new Error('unterminated string');
    return out;
  };
  const value = () => {
    ws();
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') return string();
    if (c === '[') {
      i++;
      const arr = [];
      for (;;) {
        ws();
        if (src[i] === ']') { i++; return arr; }
        arr.push(value());
        ws();
        if (src[i] === ',') i++; else if (src[i] !== ']') throw new Error('array');
      }
    }
    if (c === '{') {
      i++;
      const obj = Object.create(null);
      for (;;) {
        ws();
        if (src[i] === '}') { i++; return obj; }
        let key;
        if (src[i] === '"' || src[i] === "'") key = string();
        else { const m = /^[A-Za-z_$][\w$]*|^\d+(?:\.\d+)?/.exec(src.slice(i, i + 200)); if (!m) throw new Error('key'); key = m[0]; i += key.length; }
        ws();
        if (src[i++] !== ':') throw new Error('colon');
        obj[key] = value();
        ws();
        if (src[i] === ',') i++; else if (src[i] !== '}') throw new Error('object');
      }
    }
    const m = /^(?:-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|true|false|null|undefined)(?![\w$])/i.exec(src.slice(i, i + 40));
    if (!m) throw new Error('not a literal');
    i += m[0].length;
    return { true: true, false: false, null: null, undefined: undefined }[m[0]] ?? Number(m[0]);
  };
  const v = value();
  return { value: v, end: i };
}

/** The literal assigned to `name` (`const NAME = [...]` or `{...}`), or null. */
function value(src, name) {
  const m = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*(?=[\\[{])`).exec(src);
  if (!m) return null;
  try { return parseLiteral(src, m.index + m[0].length).value; } catch { return null; }
}

const clean = (s) => (s == null ? null : decodeEntities(String(s)).replace(/\r/g, '').trim() || null);

function shaped(raw) {
  const out = [];
  raw.forEach((r, i) => {
    const o = r.o.map(clean);
    if (o.length < 2 || o.some((x) => !x) || !(r.a >= 0 && r.a < o.length) || !clean(r.q)) return;
    const oe = r.oe ? r.oe.map(clean) : null;
    const q = { q: clean(r.q), o, a: r.a, e: clean(r.e), oe: oe && oe.some(Boolean) ? oe : null, topic: clean(r.topic), n: r.n ?? i + 1 };
    if (clean(r.pre)) q.pre = clean(r.pre); // the facts a variation builds on
    if (r.fixed) q.fixed = true; // choices refer to each other by letter ("B and C"), so keep their order
    out.push(q);
  });
  return out;
}

// --- Formats -------------------------------------------------------------------------

// Course quiz: a JSON block, { stem: [paragraphs], choices, answer, explanation, references }.
function courseQuiz(src) {
  const m = src.match(/<script[^>]*id=["']quiz-data["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  let bank;
  try { bank = JSON.parse(m[1]); } catch { return null; }
  const chapters = value(src, 'chapters') || {};
  return bank.filter((q) => Number.isInteger(q.answer) && !q.skipped && !q.reviewOnly).map((q) => ({
    q: [].concat(q.stem).join('\n\n'), o: q.choices, a: q.answer, e: q.explanation,
    topic: [chapters[q.chapter] ? `Ch. ${q.chapter} · ${chapters[q.chapter]}` : null, q.title].filter(Boolean).join(' — '), n: q.number,
  }));
}

// Quick drill: `Q(chapter, kind, tag, stem, options, explanation)` calls after `const QB = [];`.
function drill(src) {
  const start = src.search(/const QB\s*=\s*\[\s*\]\s*;/);
  if (start < 0 || !/function Q\s*\(/.test(src)) return null;
  const end = src.indexOf('</script>', start);
  const QB = [];
  const body = src.slice(start, end < 0 ? undefined : end);
  // Each call's arguments are parsed as data, one literal after another.
  for (const m of body.matchAll(/(?:^|[;\n])\s*Q\(/g)) {
    let i = m.index + m[0].length;
    const args = [];
    try {
      for (;;) {
        const { value: v, end: next } = parseLiteral(body, i);
        args.push(v);
        i = next;
        while (/\s/.test(body[i])) i++;
        if (body[i] === ',') { i++; continue; }
        if (body[i] === ')') break;
        throw new Error('call');
      }
    } catch { continue; }
    const [c, k, t, q, o, e] = args;
    if (typeof q === 'string' && Array.isArray(o)) QB.push({ c, k, t, q, o, e });
  }
  const CH = value(src, 'CH') || {};
  return QB.map((q) => ({ q: q.q, o: q.o, a: 0, e: q.e, topic: [CH[q.c] ? `Ch. ${q.c} · ${CH[q.c]}` : null, q.t].filter(Boolean).join(' — ') }));
}

// MPRE banks: QS = [{ t: topic key, q, a: [choices], e, r: references }].
function mpre(src) {
  const QS = value(src, 'QS');
  if (!Array.isArray(QS) || !QS.length || !Array.isArray(QS[0].a)) return null;
  const TOPICS = value(src, 'TOPICS') || {};
  return QS.map((q) => ({ q: q.q, o: q.a, a: 0, e: [q.e, q.r ? `Sources: ${q.r}` : null].filter(Boolean).join('\n\n'), topic: TOPICS[q.t] || null }));
}

// Conceptual drill: BANK = [[topic, rule, stem, [choices], explanation]].
function bank(src) {
  const BANK = value(src, 'BANK');
  if (!Array.isArray(BANK) || !BANK.length || !Array.isArray(BANK[0])) return null;
  return BANK.map(([topic, rule, q, o, e]) => ({ q, o, a: 0, e, topic: [topic, rule].filter(Boolean).join(' — ') }));
}

// QB banks: bar-style sets and mock exams store { stem, o: [[choice, why]] }, correct choice first
// unless `a` gives its index; exam-style sets may share fact patterns, `h` naming one in HYPOS, and
// mark `fixed` the questions whose choices must keep their order. The case-repetition sets store
// { q, o: [choices], e }.
function qb(src) {
  const QB = value(src, 'QB');
  if (!Array.isArray(QB) || !QB.length) return null;
  if (Array.isArray(QB[0].o?.[0])) {
    const AREAS = value(src, 'AREAS');
    const HYPOS = value(src, 'HYPOS') || {};
    const area = (a) => (AREAS && !Array.isArray(AREAS) && AREAS[a]) || a;
    // Variations change one fact of another question ("Same facts. …"): `v` names it, or the id is "<parent>V".
    const byId = new Map(QB.map((q) => [String(q.id), q]));
    const parent = (q) => byId.get(String(q.v || (String(q.id).match(/^(.*\d)V\d*$/) || [])[1] || ''));
    return QB.map((q) => ({
      q: [HYPOS[q.h], q.stem].filter(Boolean).join('\n\n'), o: q.o.map((x) => x[0]), oe: q.o.map((x) => x[1]),
      a: Number.isInteger(q.a) ? q.a : 0, fixed: q.fixed, e: q.rule ? `Rule: ${q.rule}` : null,
      topic: [area(q.area), q.tag].filter(Boolean).join(' — '), n: q.id, pre: parent(q)?.stem,
    }));
  }
  if (typeof QB[0].o?.[0] === 'string') {
    const CASES = value(src, 'CASES') || {};
    const TOPICS = value(src, 'TOPICS') || {};
    const CH = value(src, 'CH') || {};
    return QB.map((q) => ({
      q: q.q, o: q.o, a: 0, e: q.e,
      topic: [CH[q.c] ? `Ch. ${q.c} · ${CH[q.c]}` : null, (CASES[q.id] || TOPICS[q.id])?.n].filter(Boolean).join(' — '),
    }));
  }
  return null;
}

const FORMATS = [courseQuiz, drill, mpre, bank, qb];

/** The questions in an HTML practice set, or [] if it isn't in a format the game reads. */
export function extractQuestions(html) {
  for (const read of FORMATS) {
    try {
      const raw = read(html);
      if (raw && raw.length) return shaped(raw);
    } catch { /* try the next format */ }
  }
  return [];
}
