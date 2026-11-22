// Audio courses (listen/v1, docs/listen-format.md): a course's scripted, multi-day listening course,
// a `<Name>.listen.json` file in content/<Subject>/. The build checks it here and hands the result to
// the course's Listen page (listen/<course>/data.json, played by src/assets/listen.js). Read with
// JSON.parse only, never executed.

const str = (x) => (typeof x === 'string' ? x.trim() : '');
const WORDS_PER_MINUTE = 150;

/** The raw course in a `.listen.json` text, or null. */
export function readListen(text) {
  try {
    const j = JSON.parse(String(text).replace(/^﻿/, ''));
    return j && typeof j === 'object' && !Array.isArray(j) && j.format === 'listen/v1' ? j : null;
  } catch { return null; }
}

/** About how many minutes a list of checked segments takes to say. */
export function segmentMinutes(segments) {
  let words = 0, secs = 0;
  for (const s of segments) {
    for (const t of [s.say, s.ask, s.answer]) words += (str(t).match(/\S+/g) || []).length;
    if (s.ask != null) secs += s.pause ?? 7;
    else if (s.say == null) secs += s.pause || 0;
  }
  return words / WORDS_PER_MINUTE + secs / 60;
}

/**
 * Checks a listen/v1 course. Returns { course, errors, warnings }: `course` keeps only what can be
 * played (bad segments, empty episodes and empty days are dropped), with ids and titles filled in.
 */
export function normalizeListen(raw, { fallbackId = 'course' } = {}) {
  const errors = [], warnings = [];
  const course = { format: 'listen/v1', id: '', title: '', course: '', description: '', days: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { course, errors: ['not a JSON object'], warnings };
  if (raw.format !== 'listen/v1') errors.push(`"format" must be "listen/v1"${raw.format ? ` (got ${JSON.stringify(raw.format)})` : ''}`);
  course.id = str(raw.id) || fallbackId;
  if (!str(raw.id)) errors.push('"id" is missing: it keys saved progress');
  course.title = str(raw.title) || course.id;
  if (!str(raw.title)) warnings.push('"title" is missing');
  course.course = str(raw.course);
  course.description = str(raw.description);
  if (!course.description) warnings.push('"description" is missing');
  if (!Array.isArray(raw.days) || !raw.days.length) { errors.push('"days" must be a non-empty array'); return { course, errors, warnings }; }

  const epIds = new Set();
  raw.days.forEach((d, di) => {
    const where = `days[${di}]`;
    if (!d || typeof d !== 'object') { errors.push(`${where}: not an object`); return; }
    const day = Number.isInteger(d.day) && d.day > 0 ? d.day : di + 1;
    if (!Number.isInteger(d.day)) warnings.push(`${where}: "day" should be a whole number (using ${day})`);
    const out = { day, title: str(d.title) || `Day ${day}`, minutes: 0, episodes: [] };
    if (!str(d.title)) warnings.push(`${where}: "title" is missing`);
    if (!Array.isArray(d.episodes) || !d.episodes.length) { warnings.push(`Day ${day}: no episodes`); return; }
    d.episodes.forEach((ep, ei) => {
      const at = `Day ${day}, episodes[${ei}]`;
      if (!ep || typeof ep !== 'object') { errors.push(`${at}: not an object`); return; }
      const id = str(ep.id);
      if (!id) { errors.push(`${at}: "id" is missing: it keys saved progress`); return; }
      if (epIds.has(id)) { errors.push(`${at}: episode id "${id}" is used twice`); return; }
      epIds.add(id);
      const segIds = new Set();
      const segments = [];
      (Array.isArray(ep.segments) ? ep.segments : []).forEach((s, si) => {
        const sw = `episode "${id}", segments[${si}]`;
        if (!s || typeof s !== 'object') { errors.push(`${sw}: not an object`); return; }
        const sid = str(s.id);
        if (sid) { if (segIds.has(sid)) warnings.push(`${sw}: segment id "${sid}" is used twice`); segIds.add(sid); }
        const pause = s.pause == null ? null : Number(s.pause);
        if (pause != null && !(Number.isFinite(pause) && pause >= 0 && pause <= 120)) { errors.push(`${sw}: "pause" must be a number of seconds from 0 to 120`); return; }
        if (s.voice != null && s.voice !== 'alt' && s.voice !== 'main') warnings.push(`${sw}: "voice" should be "alt" (or left out for the main voice)`);
        const voice = s.voice === 'alt' ? 'alt' : undefined;
        const keep = (o) => segments.push({ ...(sid ? { id: sid } : {}), ...o });
        if (s.ask != null) {
          if (!str(s.ask) || !str(s.answer)) { errors.push(`${sw}: an "ask" needs non-empty "ask" and "answer" text`); return; }
          keep({ ask: str(s.ask), answer: str(s.answer), ...(pause != null ? { pause } : {}), ...(voice ? { voice } : {}) });
        } else if (s.say != null) {
          if (!str(s.say)) { errors.push(`${sw}: "say" is empty`); return; }
          if (str(s.say).length > 1500) warnings.push(`${sw}: a ${str(s.say).length}-character line; shorter segments make Back and Skip more useful`);
          keep({ say: str(s.say), ...(voice ? { voice } : {}) });
        } else if (pause != null) {
          keep({ pause });
        } else errors.push(`${sw}: needs "say", "ask" (with "answer") or "pause"`);
      });
      if (!segments.some((s) => s.say || s.ask)) { warnings.push(`episode "${id}": empty (nothing to say), left out`); return; }
      const estimate = segmentMinutes(segments);
      const minutes = Number.isFinite(ep.minutes) && ep.minutes > 0 ? ep.minutes : Math.max(1, Math.round(estimate));
      out.episodes.push({ id, title: str(ep.title) || id, minutes, segments });
      if (!str(ep.title)) warnings.push(`episode "${id}": "title" is missing`);
    });
    if (!out.episodes.length) { warnings.push(`Day ${day}: no playable episodes, left out`); return; }
    out.minutes = Number.isFinite(d.minutes) && d.minutes > 0 ? d.minutes : out.episodes.reduce((n, e) => n + e.minutes, 0);
    course.days.push(out);
  });
  if (!course.days.length) errors.push('no playable episodes');
  return { course, errors, warnings };
}

/** A one-line summary for npm run check and the build log. */
export function listenSummary(course) {
  const eps = course.days.flatMap((d) => d.episodes);
  const segs = eps.flatMap((e) => e.segments);
  const est = Math.round(segmentMinutes(segs));
  return [
    `days: ${course.days.length}, episodes: ${eps.length}, segments: ${segs.length} (${segs.filter((s) => s.ask).length} asks, ${segs.filter((s) => s.voice === 'alt').length} alt-voice lines)`,
    `length: about ${est} minutes spoken at normal speed (episodes claim ${eps.reduce((n, e) => n + e.minutes, 0)})`,
    ...course.days.map((d) => `  Day ${d.day}: ${d.title} (${d.episodes.length} episodes, ${Math.round(segmentMinutes(d.episodes.flatMap((e) => e.segments)))} min)`),
  ];
}

// ---------------------------------------------------------------------------
// Recorded audio (scripts/listen-render.mjs). Each spoken line of a course is rendered once with
// Kokoro to listen-audio/<voice>-<hash>.mp3, the hash taken from the model, voice, speed and the
// text as it is spoken, so editing a script re-renders only the lines that changed. The build
// links each segment to its files (`rec`, and `answerRec` for an ask's answer) when they exist;
// a line without a file is read by the browser's voice.
// ---------------------------------------------------------------------------
import { createHash } from 'node:crypto';
import { speakable, REC_VOICES as QUEUE_VOICES, REC_SPEED } from '../../src/assets/listen-queue.js';

export const RENDER = { model: 'onnx-community/Kokoro-82M-v1.0-ONNX', dtype: 'fp32', speed: REC_SPEED, kbps: 24, rate: 24000 };
/** The recorded voices: the main and the other ("alt") voice for each gender setting (shared with the player). */
export const REC_VOICES = QUEUE_VOICES;

/** The file name of one line in one voice. */
export function recFile(voice, text) {
  const h = createHash('sha1').update(`${RENDER.model}|${voice}|${RENDER.speed}|${speakable(text)}`).digest('hex').slice(0, 16);
  return `${voice}-${h}.mp3`;
}

/** The spoken lines of a checked course: [{ text, alt }] (an ask gives two: the question and the answer). */
export function courseLines(course) {
  const out = [];
  for (const d of course.days) for (const e of d.episodes) for (const s of e.segments) {
    if (s.ask) out.push({ text: s.ask, alt: s.voice === 'alt' }, { text: s.answer, alt: false });
    else if (s.say) out.push({ text: s.say, alt: s.voice === 'alt' });
  }
  return out;
}

/** The files to render for `genders`: [{ file, voice, text }], each once. */
export function renderJobs(course, genders = ['female']) {
  const jobs = new Map();
  for (const g of genders) for (const l of courseLines(course)) {
    const voice = l.alt ? REC_VOICES[g].alt : REC_VOICES[g].main;
    const file = recFile(voice, l.text);
    if (!jobs.has(file)) jobs.set(file, { file, voice, text: l.text });
  }
  return [...jobs.values()];
}

/**
 * The course with each segment's recorded files attached, where `has(file)` says they exist:
 * `rec: { <voice>: file }` for a say or an ask's question, `answerRec` for its answer.
 */
export function attachRecordings(course, has) {
  const voices = [...new Set(Object.values(REC_VOICES).flatMap((v) => [v.main, v.alt]))];
  const recs = (text) => {
    const r = {};
    for (const v of voices) { const f = recFile(v, text); if (has(f)) r[v] = f; }
    return Object.keys(r).length ? r : undefined;
  };
  const files = new Set();
  const days = course.days.map((d) => ({ ...d, episodes: d.episodes.map((e) => ({ ...e, segments: e.segments.map((s) => {
    const rec = s.ask ? recs(s.ask) : s.say ? recs(s.say) : undefined;
    const answerRec = s.ask ? recs(s.answer) : undefined;
    for (const r of [rec, answerRec]) if (r) for (const f of Object.values(r)) files.add(f);
    return { ...s, ...(rec ? { rec } : {}), ...(answerRec ? { answerRec } : {}) };
  }) })) }));
  return { course: { ...course, days }, files: [...files] };
}
