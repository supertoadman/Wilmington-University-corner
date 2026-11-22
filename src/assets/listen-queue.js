// The hands-free Listen page (listen/<course>/, drawn by src/assets/listen.js): what it reads aloud,
// in order. Pure functions with no DOM or storage access, so tests/listen.test.mjs runs them under
// Node. The page hands buildQueue() the course's data (outline sections, flashcards, questions) and
// the listener's choices, and speaks each item's segments one after another, pausing after each.
//
// Order: the outline, section by section (heading, then text); then the flashcards (front, a pause,
// then back); then the questions (stem and choices, a pause to think, then the answer and its
// explanation). Nothing is graded.

export const PAUSES = [3, 6, 10, 15];          // seconds to think: after a card's front, after a question's choices
export const RATES = [0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2];
export const DEFAULTS = { outline: true, cards: true, questions: true, pause: 6, rate: 1 };
const LETTERS = 'ABCDEFGH';
const GAP = { heading: 700, line: 350, item: 1200, choice: 250 };

/** "Area — tag" → "Area" (as Your stats and Shuffle mode file questions). */
export const areaOf = (topic) => {
  const s = String(topic || '').trim();
  const i = s.indexOf(' — ');
  return (i < 0 ? s : s.slice(0, i)).trim() || 'Other';
};

/**
 * Text as the speech engine should hear it: outline markup ("## ", "- ", table bars) dropped, and the
 * abbreviations law text is full of spelled out ("§ 2-207" → "section 2-207", "v." → "versus").
 */
export function speakable(text) {
  return String(text || '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-•▪◦]\s+/gm, '')
    .replace(/\s*\|\s*/g, '. ')
    .replace(/§§\s*/g, 'sections ')
    .replace(/§\s*/g, 'section ')
    .replace(/¶\s*/g, 'paragraph ')
    .replace(/\bv\.\s/g, 'versus ')
    .replace(/\be\.g\.,?\s*/gi, 'for example, ')
    .replace(/\bi\.e\.,?\s*/gi, 'that is, ')
    .replace(/\bcf\.\s/gi, 'compare ')
    .replace(/\betc\./gi, 'etcetera')
    .replace(/\bU\.?C\.?C\.?(?=\s|$|[),.;])/g, 'U C C')
    .replace(/\bFRE\b/g, 'F R E')
    .replace(/\bMRPC\b/g, 'Model Rules')
    .replace(/\bFRCP\b/g, 'F R C P')
    .replace(/\bU\.S\.C\./g, 'U S C')
    .replace(/→/g, ' leads to ')
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * Text cut into pieces the speech engine reads reliably (some browsers stop a long utterance part
 * way): whole sentences up to `max` characters, then clauses, then words.
 */
export function speechChunks(text, max = 220) {
  const out = [];
  for (const para of String(text || '').split(/\n+/).map((p) => p.trim()).filter(Boolean)) {
    const sentences = para.match(/[^.!?;:]+(?:[.!?;:]+["')\]]*|$)\s*/g) || [para];
    let cur = '';
    const flush = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
    for (const s of sentences) {
      if ((cur + s).length <= max) { cur += s; continue; }
      flush();
      if (s.length <= max) { cur = s; continue; }
      // A long sentence: break at commas, then at spaces.
      for (const part of s.split(/(?<=,)\s+/)) {
        if ((cur + ' ' + part).trim().length <= max) { cur = `${cur} ${part}`.trim(); continue; }
        flush();
        if (part.length <= max) { cur = part; continue; }
        let line = '';
        for (const w of part.split(/\s+/)) {
          if ((line + ' ' + w).trim().length > max) { if (line) out.push(line); line = w; } else line = `${line} ${w}`.trim();
        }
        cur = line;
      }
    }
    flush();
  }
  return out;
}

/** One spoken piece: `text` is shown in the transcript, `say` is spoken, then `pause` ms of silence. */
const seg = (text, pause, role) => ({ text, say: speakable(text), pause, role });

function outlineItem(sec, total, n) {
  const segments = [seg(sec.title, GAP.heading, 'heading')];
  const body = String(sec.text || '').trim();
  if (body) {
    const paras = body.split(/\n+/).map((p) => p.trim()).filter(Boolean);
    paras.forEach((p, i) => segments.push(seg(p, i === paras.length - 1 ? GAP.item : GAP.line, 'text')));
  } else segments[0].pause = GAP.item;
  return { key: `o:${sec.id}`, kind: 'outline', group: sec.part || sec.title, label: `Outline section ${n} of ${total}`, title: sec.title, segments };
}

function cardItem(c, pause, total, n) {
  const front = c.cite ? `${c.cite}. ${c.front}` : c.front;
  const segments = [seg(front, pause * 1000, 'front')];
  const back = [c.back, ...(c.points || [])].filter(Boolean);
  back.forEach((b, i) => segments.push(seg(b, i === back.length - 1 && !c.note ? GAP.item : GAP.line, 'back')));
  if (c.note) segments.push(seg(`Tip: ${c.note}`, GAP.item, 'back'));
  return { key: `c:${c.deck}/${c.id}`, kind: 'card', group: c.topic || 'Flashcards', label: `Flashcard ${n} of ${total}`, title: c.topic || c.deckTitle || 'Flashcards', segments };
}

function questionItem(q, pause, total, n) {
  const segments = [seg(q.q, GAP.line, 'stem')];
  q.o.forEach((o, i) => segments.push(seg(`${LETTERS[i]}. ${o}`, i === q.o.length - 1 ? pause * 1000 : GAP.choice, 'choice')));
  segments.push(seg(`The answer is ${LETTERS[q.a]}: ${q.o[q.a]}`, GAP.line, 'answer'));
  const why = String(q.oe?.[q.a] || '').replace(/^\s*correct[.!:]?\s*/i, '').trim();
  const rule = String(q.e || '').trim();
  if (why) segments.push(seg(why, rule && rule !== why ? GAP.line : GAP.item, 'explain'));
  if (rule && rule !== why) segments.push(seg(`Rule: ${rule}`, GAP.item, 'explain'));
  if (!why && !rule) segments.at(-1).pause = GAP.item;
  return { key: `q:${q.set}/${q.n}`, kind: 'question', group: areaOf(q.topic), label: `Question ${n} of ${total}`, title: areaOf(q.topic), segments };
}

/**
 * The play list. `data` is { outline: [{ id, title, level, part, text }], cards: [{ deck, id, topic,
 * front, back, points, note, cite }], questions: [{ set, n, topic, q, o, a, oe, e }] }; `opts` is
 * { outline, cards, questions (true to include), skipParts, skipTopics, skipAreas (Sets of names
 * left out), pause (seconds) }. Returns [{ key, kind, group, label, title, segments }].
 */
export function buildQueue(data, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const off = (set, v) => !!set && set.has(v);
  const pause = PAUSES.includes(Number(o.pause)) ? Number(o.pause) : DEFAULTS.pause;
  const secs = o.outline ? (data.outline || []).filter((s) => !off(o.skipParts, s.part || s.title)) : [];
  const cards = o.cards ? (data.cards || []).filter((c) => !off(o.skipTopics, c.topic || 'Flashcards')) : [];
  const qs = o.questions ? (data.questions || []).filter((q) => Array.isArray(q.o) && q.o[q.a] != null && !off(o.skipAreas, areaOf(q.topic))) : [];
  return [
    ...secs.map((s, i) => outlineItem(s, secs.length, i + 1)),
    ...cards.map((c, i) => cardItem(c, pause, cards.length, i + 1)),
    ...qs.map((q, i) => questionItem(q, pause, qs.length, i + 1)),
  ];
}

/** Where to pick up: the saved item's place in the queue, else the first item (0). */
export function resumeAt(queue, key) {
  const i = key ? queue.findIndex((x) => x.key === key) : -1;
  return i < 0 ? 0 : i;
}

/** The groups a listener can switch off, in order, each with how many items it holds. */
export function groupsOf(list, nameOf) {
  const m = new Map();
  for (const x of list) { const k = nameOf(x); m.set(k, (m.get(k) || 0) + 1); }
  return [...m].map(([name, count]) => ({ name, count }));
}

/** Saved settings, checked field by field. */
export function readSettings(raw) {
  const s = { ...DEFAULTS, skipParts: [], skipTopics: [], skipAreas: [], voice: '', key: '' };
  if (!raw || typeof raw !== 'object') return s;
  for (const k of ['outline', 'cards', 'questions']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
  if (PAUSES.includes(Number(raw.pause))) s.pause = Number(raw.pause);
  if (RATES.includes(Number(raw.rate))) s.rate = Number(raw.rate);
  for (const k of ['skipParts', 'skipTopics', 'skipAreas']) if (Array.isArray(raw[k])) s[k] = raw[k].filter((x) => typeof x === 'string');
  if (typeof raw.voice === 'string') s.voice = raw.voice;
  if (typeof raw.key === 'string') s.key = raw.key;
  return s;
}

/** About how long the queue takes to read, in minutes, at `rate` (about 160 words a minute, plus the pauses). */
export function minutesOf(queue, rate = 1) {
  let words = 0, ms = 0;
  for (const it of queue) for (const s of it.segments) { words += (s.say.match(/\S+/g) || []).length; ms += s.pause; }
  return Math.round(words / (160 * rate) + ms / 60000);
}
