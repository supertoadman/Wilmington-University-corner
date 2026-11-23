// The hands-free Listen page (listen/<course>/, drawn by src/assets/listen.js): what it reads aloud,
// in order. Pure functions with no DOM or storage access, so tests/listen.test.mjs runs them under
// Node. The page hands buildQueue() the course's data (outline sections, flashcards, questions) and
// the listener's choices, and speaks each item's segments one after another, pausing after each.
//
// Order: the outline, section by section (heading, then text); then the flashcards (front, a pause,
// then back); then the questions (stem and choices, a pause to think, then the answer and its
// explanation). Nothing is graded.
//
// An audio course (listen/v1, docs/listen-format.md) plays instead through courseQueue(): one item
// per episode, its scripted segments in order, day after day.

import { forEar } from './listen-voice.js';

export const PAUSES = [3, 6, 10, 15];          // seconds to think: after a card's front, after a question's choices
export const RATES = [0.75, 0.85, 0.95, 1, 1.1, 1.25, 1.5, 1.75, 2];
export const MODES = ['course', 'materials'];
export const DEFAULTS = { outline: true, cards: true, questions: true, pause: 6, rate: 0.95, pitch: 0.95, gender: 'female', mode: 'course' };
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
  return forEar(String(text || '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-•▪◦]\s+/gm, '')
    .replace(/\s*\|\s*/g, '. '))
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
const seg = (text, pause, role, extra) => ({ text, say: speakable(text), pause, role, ...extra });

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

/**
 * Saved settings, checked field by field. `audio` holds each audio course's place and finished
 * episodes: { [course id]: { key: episode id, seg: segment id, done: [episode ids] } }.
 */
export function readSettings(raw) {
  const s = { ...DEFAULTS, skipParts: [], skipTopics: [], skipAreas: [], voice: '', key: '', course: '', audio: {} };
  if (!raw || typeof raw !== 'object') return s;
  for (const k of ['outline', 'cards', 'questions']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
  if (PAUSES.includes(Number(raw.pause))) s.pause = Number(raw.pause);
  if (RATES.includes(Number(raw.rate))) s.rate = Number(raw.rate);
  if (raw.gender === 'male' || raw.gender === 'female') s.gender = raw.gender;
  if (MODES.includes(raw.mode)) s.mode = raw.mode;
  for (const k of ['skipParts', 'skipTopics', 'skipAreas']) if (Array.isArray(raw[k])) s[k] = raw[k].filter((x) => typeof x === 'string');
  for (const k of ['voice', 'key', 'course']) if (typeof raw[k] === 'string') s[k] = raw[k];
  if (raw.audio && typeof raw.audio === 'object' && !Array.isArray(raw.audio)) {
    for (const [id, p] of Object.entries(raw.audio)) {
      if (!p || typeof p !== 'object') continue;
      s.audio[id] = {
        key: typeof p.key === 'string' ? p.key : '',
        seg: typeof p.seg === 'string' ? p.seg : '',
        done: Array.isArray(p.done) ? [...new Set(p.done.filter((x) => typeof x === 'string'))] : [],
      };
    }
  }
  return s;
}

// ---------------------------------------------------------------------------
// Audio courses (listen/v1). The build hands over a checked course (scripts/lib/listen.mjs).
// ---------------------------------------------------------------------------
const COURSE_GAP = { say: 450, alt: 550, answer: 1200, end: 1800 };
export const ASK_PAUSE = 7;                     // seconds after an ask with no pause of its own

/**
 * The play list for an audio course: one item per episode, in day order. Each listen/v1 segment
 * becomes one or two player segments, each with `sid` (the script's segment id, else "s<index>")
 * so the place survives edits; an ask becomes the question (then the pause, `pause` seconds times
 * `scale`) and the answer. `voice` is "main" or "alt".
 */
export function courseQueue(course, { scale = 1 } = {}) {
  const items = [];
  const days = course?.days || [];
  for (const d of days) {
    const eps = d.episodes || [];
    eps.forEach((ep, e) => {
      const segments = [];
      (ep.segments || []).forEach((s, i) => {
        const sid = typeof s.id === 'string' && s.id ? s.id : `s${i}`;
        if (typeof s.ask === 'string') {
          const wait = Math.round((Number.isFinite(s.pause) && s.pause >= 0 ? s.pause : ASK_PAUSE) * scale * 1000);
          segments.push(seg(s.ask, wait, 'ask', { sid, voice: s.voice === 'alt' ? 'alt' : 'main' }));
          segments.push(seg(String(s.answer || ''), COURSE_GAP.answer, 'answer', { sid: `${sid}:a`, voice: 'main' }));
        } else if (typeof s.say === 'string') {
          const alt = s.voice === 'alt';
          segments.push(seg(s.say, alt ? COURSE_GAP.alt : COURSE_GAP.say, alt ? 'alt' : 'say', { sid, voice: alt ? 'alt' : 'main' }));
        } else if (Number.isFinite(s.pause)) {
          segments.push({ text: '', say: '', pause: Math.round(s.pause * 1000), role: 'pause', sid, voice: 'main' });
        }
      });
      if (!segments.length) return;
      segments.at(-1).pause = Math.max(segments.at(-1).pause, COURSE_GAP.end);
      items.push({
        key: ep.id, kind: 'episode', day: d.day, dayTitle: d.title || '', group: `Day ${d.day}`,
        label: `Day ${d.day} · Episode ${e + 1} of ${eps.length}`, title: ep.title, minutes: ep.minutes || 0, segments,
      });
    });
  }
  return items;
}

/** Where an audio course picks up: { idx, seg } from a saved { key, seg }, else the first unfinished episode. */
export function courseResume(queue, place = {}) {
  let idx = place.key ? queue.findIndex((x) => x.key === place.key) : -1;
  if (idx < 0) {
    const done = new Set(place.done || []);
    idx = Math.max(0, queue.findIndex((x) => !done.has(x.key)));
    return { idx, seg: 0 };
  }
  const seg = place.seg ? queue[idx].segments.findIndex((s) => s.sid === place.seg) : 0;
  return { idx, seg: Math.max(0, seg) };
}

/** The days of a course queue, each with its episodes' places: [{ day, title, items: [index] }]. */
export function daysOf(queue) {
  const out = [];
  queue.forEach((it, i) => {
    let d = out.at(-1);
    if (!d || d.day !== it.day) out.push(d = { day: it.day, title: it.dayTitle, items: [] });
    d.items.push(i);
  });
  return out;
}

/** About how long the queue takes to read, in minutes, at `rate` (about 160 words a minute, plus the pauses). */
export function minutesOf(queue, rate = 1) {
  let words = 0, ms = 0;
  for (const it of queue) for (const s of it.segments) { words += (s.say.match(/\S+/g) || []).length; ms += s.pause; }
  return Math.round(words / (160 * rate) + ms / 60000);
}
