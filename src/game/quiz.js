// Question data, run sessions, and what the game remembers between visits.

const DATA = new URL('./data/', import.meta.url);
const KEY = 'sanctum-run.v1';

let index = null;
const sets = new Map();

export async function loadIndex() {
  if (!index) index = await (await fetch(new URL('index.json', DATA))).json();
  return index;
}

export const course = (slug) => index?.courses.find((c) => c.slug === slug);

async function loadSet(courseSlug, setSlug) {
  const key = `${courseSlug}/${setSlug}`;
  if (!sets.has(key)) sets.set(key, fetch(new URL(`${key}.json`, DATA)).then((r) => r.json()));
  return sets.get(key);
}

// ---------------------------------------------------------------------------
// Saved state: settings, best score, and the questions missed (until answered right).
// ---------------------------------------------------------------------------
const blank = () => ({ settings: {}, best: 0, missed: {} });
let saved = blank();
try { saved = { ...blank(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* storage unavailable */ }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* private mode */ } };

export const store = {
  get settings() { return saved.settings; },
  setting(k, v) { saved.settings[k] = v; persist(); },
  get best() { return saved.best || 0; },
  recordScore(score) { const isBest = score > (saved.best || 0); if (isBest) { saved.best = score; persist(); } return isBest; },
  isMissed: (id) => !!saved.missed[id],
  missedIn: (courseSlug, setSlug) => Object.keys(saved.missed).filter((id) => id.startsWith(`${courseSlug}/${setSlug}/`)).length,
  mark(id, right) {
    if (right) delete saved.missed[id]; else saved.missed[id] = 1;
    persist();
  },
};

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/**
 * A run's questions. picks: [{ course, set }]. Each question gets an id, its set's title,
 * its course, a review link, and its choices shuffled (q.order maps shown -> original index).
 */
export async function buildSession(picks, { shuffled = true, missedOnly = false, only = null } = {}) {
  const groups = await Promise.all(picks.map(async ({ course: c, set: s }) => {
    const cs = course(c);
    const meta = cs.sets.find((x) => x.slug === s);
    const qs = await loadSet(c, s);
    return qs.map((q, k) => ({
      ...q,
      id: `${c}/${s}/${k}`,
      course: cs,
      setTitle: meta.title,
      setUrl: meta.url,
      review: q.s != null && cs.sections[q.s] ? { title: cs.sections[q.s][0], url: cs.sections[q.s][1] } : cs.outline ? { title: cs.outline.title, url: cs.outline.url } : null,
    }));
  }));
  let all = groups.flat();
  if (only) all = all.filter((q) => only.has(q.id));
  else if (missedOnly) all = all.filter((q) => store.isMissed(q.id));
  if (shuffled) shuffle(all);
  for (const q of all) q.order = shuffle(q.o.map((_, i) => i));
  return all;
}
