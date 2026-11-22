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
