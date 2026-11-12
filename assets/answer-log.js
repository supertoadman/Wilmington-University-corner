// The answer history behind Your stats (/stats/). Every place that grades a question (Shuffle mode,
// the canonical practice pages, Sanctum Run, Crypt Survivors) calls record(), and the stats page
// reads the log back with summarize(). It lives in this browser's localStorage only: nothing is
// uploaded, and the footer's progress backup carries it to another device (restoring merges it).
//
// Questions are named as play/data names them (scripts/game.mjs): the set as "<course>/<set slug>"
// and the question by its `n` (its id or number in the set), so the same question answered in
// Shuffle mode, a game, or its own practice page counts as one question. Each answer also keeps the
// question's topic ("Area — tag") as it read then, so edits to a set never re-file old answers.
//
// Stored shape (key LOG_KEY), compact because it can hold tens of thousands of answers:
//   { v: 1, sets: ["evidence/evidence-concepts-test", …], topics: ["Hearsay — Present sense impression", …],
//     a: [[seconds since 1970, set index, n, topic index or -1, 1 right / 0 wrong, source index], …] }
// in time order, oldest first, capped at MAX_ANSWERS (the oldest drop off).
//
// Nothing here touches the DOM or storage at import, so tests/answer-log.test.mjs runs it under Node.

export const LOG_KEY = 'answer-log';
export const SOURCES = ['shuffle', 'practice', 'run', 'survivors'];
export const MAX_ANSWERS = 40000;
export const MIN_ANSWERS = 5; // a topic needs this many answers before it ranks as weak or strong

export const emptyLog = () => ({ v: 1, sets: [], topics: [], a: [] });

/** "Area — tag" → ["Area", "tag"]; a topic with no tag is all area. */
export function splitTopic(topic) {
  const s = String(topic || '').trim();
  const i = s.indexOf(' — ');
  return i < 0 ? [s, ''] : [s.slice(0, i).trim(), s.slice(i + 3).trim()];
}
// Sets in one course can spell an area a little differently ("Overview" / "overview").
export const areaKey = (area) => String(area || '').trim().replace(/\s+/g, ' ').toLowerCase();

/** A stored log (text or object) checked entry by entry; anything malformed is dropped. */
export function parseLog(input) {
  let raw = input;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { return emptyLog(); } }
  if (!raw || raw.v !== 1 || !Array.isArray(raw.sets) || !Array.isArray(raw.topics) || !Array.isArray(raw.a)) return emptyLog();
  const sets = raw.sets.map((s) => (typeof s === 'string' ? s : ''));
  const topics = raw.topics.map((t) => (typeof t === 'string' ? t : ''));
  const a = raw.a.filter((e) => Array.isArray(e) && e.length >= 6
    && Number.isFinite(e[0]) && e[0] > 0
    && Number.isInteger(e[1]) && sets[e[1]]
    && (typeof e[2] === 'string' || typeof e[2] === 'number')
    && Number.isInteger(e[3]) && e[3] >= -1 && e[3] < topics.length
    && (e[4] === 0 || e[4] === 1)
    && Number.isInteger(e[5]) && e[5] >= 0 && e[5] < SOURCES.length)
    .map((e) => [Math.round(e[0]), e[1], String(e[2]), e[3], e[4], e[5]]);
  return { v: 1, sets, topics, a };
}

export const serializeLog = (log) => JSON.stringify(log);

const indexIn = (list, value) => {
  let i = list.indexOf(value);
  if (i < 0) { i = list.length; list.push(value); }
  return i;
};

/**
 * Add one answer to `log` (changed in place, and returned). `answer` is
 * { set: "<course>/<set>", n, topic, right, from: one of SOURCES, at: ms since 1970 (default now) }.
 * Returns the log unchanged for an answer it can't name.
 */
export function addAnswer(log, { set, n, topic, right, from = 'shuffle', at = Date.now() }) {
  if (typeof set !== 'string' || !/^[\w-]+\/[\w-]+$/.test(set) || n == null || n === '') return log;
  const src = SOURCES.indexOf(from);
  const t = Math.round(at / 1000);
  const topicText = String(topic || '').trim();
  const entry = [t, indexIn(log.sets, set), String(n), topicText ? indexIn(log.topics, topicText) : -1, right ? 1 : 0, src < 0 ? 0 : src];
  // Kept in time order; an answer from a clock that ran behind slots in where it belongs.
  let i = log.a.length;
  while (i > 0 && log.a[i - 1][0] > t) i--;
  log.a.splice(i, 0, entry);
  if (log.a.length <= MAX_ANSWERS) return log;
  log.a.splice(0, log.a.length - MAX_ANSWERS);
  // Once the oldest answers fall off, drop the set and topic names no answer uses any more.
  const usedS = new Set(log.a.map((e) => e[1])), usedT = new Set(log.a.map((e) => e[3]).filter((x) => x >= 0));
  return usedS.size === log.sets.length && usedT.size === log.topics.length ? log : Object.assign(log, fromEntries(entries(log)));
}

/** The log's answers as plain objects, oldest first. */
export function entries(log) {
  return log.a.map(([t, s, n, ti, ok, src]) => {
    const set = log.sets[s];
    const topic = ti >= 0 ? log.topics[ti] : '';
    const [area, tag] = splitTopic(topic);
    return { at: t * 1000, set, course: set.split('/')[0], n, topic, area, tag, right: ok === 1, from: SOURCES[src] };
  });
}

function fromEntries(list) {
  const log = emptyLog();
  for (const e of list) {
    const t = Math.round(e.at / 1000);
    log.a.push([t, indexIn(log.sets, e.set), String(e.n), e.topic ? indexIn(log.topics, e.topic) : -1, e.right ? 1 : 0, Math.max(0, SOURCES.indexOf(e.from))]);
  }
  return log;
}

/** Two logs as one: every answer from both, each once, in time order, capped. */
export function mergeLogs(a, b) {
  const seen = new Set();
  const all = [];
  for (const e of [...entries(parseLog(a)), ...entries(parseLog(b))]) {
    const k = `${e.at}|${e.set}|${e.n}|${e.from}|${e.right ? 1 : 0}`;
    if (seen.has(k)) continue;
    seen.add(k);
    all.push(e);
  }
  all.sort((x, y) => x.at - y.at);
  return fromEntries(all.slice(-MAX_ANSWERS));
}

// ---------------------------------------------------------------------------
// Summaries for the stats page
// ---------------------------------------------------------------------------

const dayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
// Weeks start on Monday, in the student's own time zone.
const startOfWeek = (ms) => { const d = new Date(startOfDay(ms)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
const shiftDays = (ms, n) => { const d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime(); };

/** Accuracy with one right and one wrong answer added, so a topic seen twice can't top or tail the list. */
export const smoothed = (right, total) => (right + 1) / (total + 2);

/**
 * Everything the stats page shows, from the log:
 *   total, right, missed (questions whose latest answer was wrong), first, last (ms),
 *   week / prevWeek ({ total, right } for the last 7 days and the 7 before), days (days with an
 *   answer), streak (days in a row with an answer, ending today or yesterday),
 *   weeks: the last `weeks` calendar weeks [{ start, total, right }], oldest first,
 *   courses: [{ slug, total, right, last, missed, areas }], most answered first, where areas are
 *     [{ key, area, total, right, last, score, missed: [{ set, n }], tags: [{ tag, total, right }] }],
 *   weakest: up to `limit` areas across courses with at least `min` answers and at least one
 *     miss, weakest first (each with its `course` slug).
 * `course` limits all of it to one course's answers.
 */
export function summarize(log, { now = Date.now(), weeks = 12, min = MIN_ANSWERS, limit = 8, course = null } = {}) {
  const list = entries(log).filter((e) => !course || e.course === course);
  const out = {
    total: list.length, right: 0, missed: 0, first: list[0]?.at ?? null, last: list.at(-1)?.at ?? null,
    week: { total: 0, right: 0 }, prevWeek: { total: 0, right: 0 }, days: 0, streak: 0, weeks: [], courses: [], weakest: [],
  };
  const today = startOfDay(now);
  const weekFrom = shiftDays(today, -6), prevFrom = shiftDays(today, -13);
  const firstWeek = shiftDays(startOfWeek(now), -7 * (weeks - 1));
  for (let i = 0; i < weeks; i++) out.weeks.push({ start: shiftDays(firstWeek, 7 * i), total: 0, right: 0 });

  const days = new Set();
  const courses = new Map();
  const latest = new Map(); // "<set>#<n>" -> the question's latest answer
  for (const e of list) {
    if (e.right) out.right++;
    days.add(dayKey(e.at));
    if (e.at >= weekFrom) { out.week.total++; if (e.right) out.week.right++; } else if (e.at >= prevFrom) { out.prevWeek.total++; if (e.right) out.prevWeek.right++; }
    if (e.at >= firstWeek) {
      const w = out.weeks[Math.min(weeks - 1, out.weeks.findLastIndex((x) => x.start <= e.at))];
      if (w) { w.total++; if (e.right) w.right++; }
    }
    let c = courses.get(e.course);
    if (!c) courses.set(e.course, c = { slug: e.course, total: 0, right: 0, last: 0, missed: 0, areaMap: new Map() });
    c.total++; if (e.right) c.right++; c.last = Math.max(c.last, e.at);
    const key = areaKey(e.area);
    let a = c.areaMap.get(key);
    if (!a) c.areaMap.set(key, a = { key, area: e.area || 'Other', total: 0, right: 0, last: 0, missed: [], tagMap: new Map() });
    a.total++; if (e.right) a.right++; a.last = Math.max(a.last, e.at);
    if (e.tag) {
      let t = a.tagMap.get(e.tag);
      if (!t) a.tagMap.set(e.tag, t = { tag: e.tag, total: 0, right: 0 });
      t.total++; if (e.right) t.right++;
    }
    latest.set(`${e.set}#${e.n}`, e);
  }
  for (const e of latest.values()) {
    if (e.right) continue;
    out.missed++;
    const c = courses.get(e.course);
    c.missed++;
    c.areaMap.get(areaKey(e.area)).missed.push({ set: e.set, n: e.n });
  }
  out.days = days.size;
  for (let d = days.has(dayKey(today)) ? today : shiftDays(today, -1); days.has(dayKey(d)); d = shiftDays(d, -1)) out.streak++;

  const byWeakness = (x, y) => x.score - y.score || y.total - x.total || x.area.localeCompare(y.area);
  for (const c of courses.values()) {
    const areas = [...c.areaMap.values()].map(({ tagMap, ...a }) => ({
      ...a, score: smoothed(a.right, a.total),
      tags: [...tagMap.values()].sort((x, y) => smoothed(x.right, x.total) - smoothed(y.right, y.total) || y.total - x.total),
    })).sort(byWeakness);
    const { areaMap, ...rest } = c;
    out.courses.push({ ...rest, areas });
  }
  out.courses.sort((x, y) => y.total - x.total || x.slug.localeCompare(y.slug));
  out.weakest = out.courses.flatMap((c) => c.areas.filter((a) => a.total >= min).map((a) => ({ ...a, course: c.slug })))
    .filter((a) => a.right < a.total).sort(byWeakness).slice(0, limit);
  return out;
}

/**
 * The questions to drill, from the log: the keys ("<set>#<n>") of the questions in `course` (and
 * `area`, when given) whose latest answer was wrong.
 */
export function missedKeys(log, { course, area } = {}) {
  const latest = new Map();
  for (const e of entries(log)) {
    if (course && e.course !== course) continue;
    latest.set(`${e.set}#${e.n}`, e);
  }
  const want = area != null && area !== '' ? areaKey(area) : null;
  return new Set([...latest].filter(([, e]) => !e.right && (want == null || areaKey(e.area) === want)).map(([k]) => k));
}

// ---------------------------------------------------------------------------
// In the browser
// ---------------------------------------------------------------------------

const storage = () => { try { return globalThis.localStorage || null; } catch { return null; } };

export function loadLog(store = storage()) {
  try { return parseLog(store?.getItem(LOG_KEY)); } catch { return emptyLog(); }
}

/** Save the log; when the browser is out of room, keep the newest three quarters and try once more. */
export function saveLog(log, store = storage()) {
  if (!store) return false;
  try { store.setItem(LOG_KEY, serializeLog(log)); return true; } catch {
    try {
      const keep = entries(log).slice(-Math.floor(log.a.length * 0.75));
      store.setItem(LOG_KEY, serializeLog(fromEntries(keep)));
      return true;
    } catch { return false; }
  }
}

/** Record one graded answer (see addAnswer). Re-reads storage first, so tabs open side by side all count. */
export function record(answer, store = storage()) {
  if (!store) return false;
  return saveLog(addAnswer(loadLog(store), answer), store);
}

export function clearLog(store = storage()) {
  try { store?.removeItem(LOG_KEY); return true; } catch { return false; }
}
