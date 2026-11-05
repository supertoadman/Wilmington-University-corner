// Builds a believable law school around the real question bank: 6 switchable personas, 150 cohort
// students (2027 3Ls, 2028 2Ls, 2029 1Ls) and ~35,000 attempts, all from a deterministic PRNG.
//
// The structure the portals are meant to show is produced by the generator, never written into the
// rows afterwards:
//   * accuracy: ~74% on base questions vs ~51% on one-fact variations
//   * trap magnets: each question has one wrong choice that attracts most wrong answers, preferring
//     the doctrinal trap that dominates its rule
//   * forgetting: accuracy decays 6 months after a course unless the student reviewed in between
//   * at-risk students: 12 3Ls who rush, collapse on variations, or have gone quiet
//   * inverted items: 5 questions where stronger students miss more (negative point-biserial),
//     plus a dozen that barely discriminate at all
// Every statistic the API shows is computed from the events this file writes.

import { rng, logistic, hash32 } from './prng.mjs';

const DAY = 86400000;
const FIRST = ['Amara', 'Andre', 'Beatriz', 'Caleb', 'Camila', 'Dario', 'Eleni', 'Elias', 'Farah', 'Gabriel', 'Hana', 'Idris', 'Imani', 'Jasper', 'Kavya', 'Kwame', 'Leila', 'Mateo', 'Nadia', 'Noah', 'Olivia', 'Omar', 'Priya', 'Quinn', 'Rafael', 'Sana', 'Tariq', 'Uma', 'Victor', 'Zoe'];
const LAST = ['Abara', 'Bianchi', 'Castillo', 'Dang', 'Eriksen', 'Farouk', 'Goldberg', 'Hargrove', 'Ito', 'Jovanovic', 'Kowalski', 'Lindqvist', 'Moreau', 'Nwosu', 'Okonkwo', 'Park', 'Quintero', 'Rahman', 'Sato', 'Thibodeaux', 'Usman', 'Vasquez', 'Whitfield', 'Xu', 'Yilmaz', 'Zielinski', 'Alvarado', 'Brennan', 'Chaudhry', 'Delacroix'];

export const PERSONAS = [
  { id: 'stu-maya', name: 'Maya Okafor', role: 'student', cohort_year: 2028, assigned_subject_id: 'sales-and-leases', persona_badge: '2L · strong performer · weak on § 2-207 variations' },
  { id: 'stu-jordan', name: 'Jordan Reyes', role: 'student', cohort_year: 2027, assigned_subject_id: 'evidence', persona_badge: '3L · at risk · rushing at 24s/Q, no cross-outs' },
  { id: 'fac-richardson', name: 'Prof. Richardson', role: 'faculty', cohort_year: null, assigned_subject_id: 'sales-and-leases', persona_badge: 'Faculty · Sales & Leases' },
  { id: 'fac-vance', name: 'Prof. Vance', role: 'faculty', cohort_year: null, assigned_subject_id: 'evidence', persona_badge: 'Faculty · Evidence' },
  { id: 'dean-carter', name: 'Dean Carter', role: 'dean', cohort_year: null, assigned_subject_id: null, persona_badge: 'Bar Success Dean' },
  { id: 'adm-ta', name: 'T. Alvarez', role: 'admin', cohort_year: null, assigned_subject_id: null, persona_badge: 'Law Review SME Admin' },
];

// Which subjects each class is working on now, and which it finished a year or two ago.
const PLAN = {
  2029: { cur: ['contracts-i', 'civil-procedure'], past: [] },
  2028: { cur: ['sales-and-leases', 'evidence', 'agency-and-partnership'], past: ['contracts-i', 'civil-procedure'] },
  2027: { cur: ['con-law-ii', 'professional-responsibility'], past: ['contracts-i', 'civil-procedure', 'sales-and-leases', 'evidence', 'agency-and-partnership'] },
};
const FIRST_YEAR = new Set(['contracts-i', 'civil-procedure']);

// Tuned so the whole population lands near 74% (base) and 51% (variation).
const INTERCEPT = 1.36;
const VARIATION_PENALTY = -1.2;
const KIND_OFFSET = { eoc: 0, spaced: -0.1, six_unreviewed: -1.0, six_refresher: -0.25, bar: -0.3, now: 0 };

const WEAK_RE = /2-207|battle of the forms|additional terms|different terms|expressly conditional/i;

const iso = (ms) => new Date(ms).toISOString();

export function simulate({ dataset, now = Date.now(), seed = 'wilmington-demo-v1' }) {
  const R = rng(seed);
  const { questions, choices, nodes } = dataset;

  // ---- users --------------------------------------------------------------------------------
  const users = PERSONAS.map((p) => ({ ...p, email: `${p.id.replace(/^[a-z]+-/, '')}@demo.wilmington.example`, is_persona: 1 }));
  const names = R.shuffle(FIRST.flatMap((f) => LAST.map((l) => `${f} ${l}`)));
  const students = []; // simulation state for everyone who answers questions
  const mk = (u, extra) => { const s = { u, theta: 0, speed: 60, cross: 0.36, popup: 0.18, weight: 1, varExtra: 0, tags: [], inactive: false, pairs: new Map(), ...extra }; students.push(s); return s; };

  let ni = 0;
  const cohortStudents = { 2027: [], 2028: [], 2029: [] };
  for (const year of [2027, 2028, 2029]) {
    for (let i = 1; i <= 50; i++) {
      const name = names[ni++];
      const u = { id: `s${String(year).slice(2)}-${String(i).padStart(3, '0')}`, name, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@students.wilmington.example`, role: 'student', cohort_year: year, assigned_subject_id: null, persona_badge: null, is_persona: 0 };
      const cur = PLAN[year].cur;
      u.assigned_subject_id = cur[(i - 1) % cur.length];
      users.push(u);
      cohortStudents[year].push(mk(u, { theta: Math.min(2, Math.max(-0.95, R.normal() * 0.75)), speed: 52 + R.range(0, 26), cross: R.range(0.22, 0.52), popup: R.range(0.1, 0.28) }));
    }
  }

  // Twelve at-risk 3Ls: four rush, four collapse on variations, four have gone quiet. A few have two problems.
  const risk = R.shuffle(cohortStudents[2027]).slice(0, 12);
  risk.forEach((s, i) => {
    if (i < 4) Object.assign(s, { speed: R.range(21, 33), cross: 0.02, popup: 0.03, theta: s.theta - 1.0, tags: ['rusher'] });
    else if (i < 8) Object.assign(s, { varExtra: -2.2, theta: Math.max(s.theta, 0.1), tags: ['variation'] });
    else Object.assign(s, { weight: 0.22, inactive: true, theta: s.theta - 0.8, tags: ['quiet'] });
  });
  Object.assign(risk[1], { varExtra: -1.8, tags: ['rusher', 'variation'] });
  Object.assign(risk[9], { speed: 26, cross: 0.03, tags: ['quiet', 'rusher'] });

  const maya = mk(users.find((u) => u.id === 'stu-maya'), { theta: 1.55, speed: 66, cross: 0.55, popup: 0.3, weight: 0, persona: 'maya' });
  const jordan = mk(users.find((u) => u.id === 'stu-jordan'), { theta: -1.45, speed: 32, cross: 0, popup: 0.03, weight: 0, persona: 'jordan', tags: ['rusher'] });

  // ---- per-student, per-subject timelines ----------------------------------------------------
  const week = (lo, hi) => R.range(lo, hi);
  for (const s of students) {
    const year = s.u.cohort_year;
    const plan = PLAN[year];
    for (const sub of plan.cur) { const t0 = week(20, 110); s.pairs.set(sub, { cur: true, t0, kinds: [{ k: 'eoc', w: 1, lo: 0, hi: t0 }] }); } // still in progress: activity runs up to today
    for (const sub of plan.past) {
      const t0 = year === 2027 ? (FIRST_YEAR.has(sub) ? week(690, 780) : week(340, 420)) : week(330, 400);
      const refresher = R.chance(0.5);
      const kinds = [{ k: 'eoc', w: 2.2, lo: 0, hi: 40 }, { k: refresher ? 'six_refresher' : 'six_unreviewed', w: 1.4, lo: 165, hi: 235 }];
      if (refresher) kinds.push({ k: 'spaced', w: 1.1, lo: 50, hi: 145 });
      if (year === 2027) kinds.push({ k: 'bar', w: 1.2, lo: 1, hi: 70, absolute: true });
      s.pairs.set(sub, { cur: false, t0, refresher, kinds });
    }
  }
  const candidates = {}; // subject -> [{ s, w }]
  for (const s of students) for (const [sub, p] of s.pairs) (candidates[sub] ||= []).push({ s, w: s.weight * (p.cur ? 1 : 0.55) });

  // ---- questions: difficulty, discrimination, trap magnets -----------------------------------
  const byQ = new Map(questions.map((q) => [q.id, q]));
  const wrongBy = new Map(); // question -> wrong choices
  for (const c of choices) if (!c.is_correct) (wrongBy.get(c.question_id) || wrongBy.set(c.question_id, []).get(c.question_id)).push(c);
  // Rules outside the professor's syllabus (bar_only) are studied less, so they are missed more; how much varies by subject.
  const barPenalty = {};
  const nodeBias = new Map(nodes.map((n) => {
    barPenalty[n.subject_id] ??= -0.4 - rng(`bar:${n.subject_id}`).next() * 0.5;
    return [n.id, rng(`node:${n.id}`).normal() * 0.55 - (n.scope === 'bar_only' ? barPenalty[n.subject_id] : n.scope === 'course' ? 0.12 : 0)];
  }));
  // The trap that dominates each rule, so wrong answers cluster on it.
  const dominant = new Map();
  {
    const tally = new Map();
    for (const q of questions) for (const c of wrongBy.get(q.id) || []) {
      if (c.trap_code === 'ELEMENT_BOUNDARY_MISS') continue;
      const m = tally.get(q.rule_node_id) || tally.set(q.rule_node_id, new Map()).get(q.rule_node_id);
      m.set(c.trap_code, (m.get(c.trap_code) || 0) + 1);
    }
    for (const [node, m] of tally) dominant.set(node, [...m].sort((a, b) => b[1] - a[1])[0][0]);
  }
  const info = new Map();
  for (const q of questions) {
    const wrong = wrongBy.get(q.id) || [];
    const rq = rng(`q:${q.id}`);
    const magnet = wrong.find((c) => c.trap_code === dominant.get(q.rule_node_id)) || wrong.find((c) => c.trap_code !== 'ELEMENT_BOUNDARY_MISS') || wrong[Math.floor(rq.next() * wrong.length)];
    info.set(q.id, { q, diff: (nodeBias.get(q.rule_node_id) || 0) + rq.normal() * 0.5, a: 1, wrong, magnet, len: q.stem.length });
  }

  // Audit pool: 5 inverted items, 12 that barely discriminate, and ~133 ordinary ones with enough attempts to test.
  const base = questions.filter((q) => !q.is_variation && (byQ.get(q.id) && (wrongBy.get(q.id) || []).length >= 2));
  const pickFrom = (sub, k, taken) => R.shuffle(base.filter((q) => q.subject_id === sub && !taken.has(q.id))).slice(0, k);
  const taken = new Set();
  const flagged = [];
  for (const [sub, k] of [['sales-and-leases', 2], ['evidence', 1], ['contracts-i', 1], ['civil-procedure', 1]]) for (const q of pickFrom(sub, k, taken)) { taken.add(q.id); flagged.push(q.id); }
  const weak = R.shuffle(base.filter((q) => !taken.has(q.id))).slice(0, 12).map((q) => { taken.add(q.id); return q.id; });
  const ordinary = R.shuffle(base.filter((q) => !taken.has(q.id) && (q.subject_id !== 'professional-responsibility' || R.chance(0.2)))).slice(0, 133).map((q) => { taken.add(q.id); return q.id; });
  flagged.forEach((id) => { info.get(id).a = -1.8; });
  weak.forEach((id) => { info.get(id).a = 0.2; });
  const audit = new Set([...flagged, ...weak, ...ordinary]);

  // ---- attempts ------------------------------------------------------------------------------
  const events = [];
  const emit = (s, q, { kind = 'now', daysAgo, mode, forceP } = {}) => {
    const it = info.get(q.id);
    const isVar = q.is_variation;
    let z = it.a * s.theta + INTERCEPT - it.diff + KIND_OFFSET[kind] + (isVar ? VARIATION_PENALTY + s.varExtra : 0);
    let p = logistic(z);
    if (forceP != null) p = forceP;
    const correct = R.next() < p;
    let sel;
    if (correct) sel = q.correct_index;
    else {
      const w = it.wrong;
      const weights = w.map((c) => (c === it.magnet ? 0.55 * (w.length - 1) : 0.45));
      sel = w[R.weighted(w.length === 1 ? [1] : weights)].choice_index;
    }
    const chosen = correct ? null : it.wrong.find((c) => c.choice_index === sel);
    // cross-outs: wrong choices the student struck before answering
    let crossed = [];
    if (R.chance(s.cross)) {
      const pool = it.wrong.map((c) => c.choice_index).filter((i) => i !== sel);
      crossed = R.shuffle(pool).slice(0, 1 + (R.chance(0.4) ? 1 : 0));
    }
    const lenF = Math.min(1.8, Math.max(0.6, 0.55 + it.len / 1100));
    let secs = s.speed * lenF * Math.exp(R.normal() * 0.33);
    const m = mode || (R.chance(0.3) ? 'timed' : 'study');
    if (m === 'timed') secs *= 0.8;
    if (!correct) secs *= s.speed < 30 ? 0.85 : 1.12;
    secs = Math.min(240, Math.max(6, secs));
    const when = now - daysAgo * DAY - R.range(0, 1) * DAY * 0.6;
    events.push({
      user_id: s.u.id, question_id: q.id, subject_id: q.subject_id, rule_node_id: q.rule_node_id, selected_index: sel, is_correct: correct ? 1 : 0,
      trap_code: chosen?.trap_code ?? null, crossed_out_json: JSON.stringify(crossed.sort((a, b) => a - b)), opened_popup: R.chance(correct ? s.popup : Math.min(0.6, s.popup * 1.6)) ? 1 : 0,
      duration_ms: Math.round(secs * 1000), mode: m, created_at: iso(Math.min(when, now - 60000)),
    });
  };

  // When a student attempts this subject: a block (end of course, spaced review, +6 months, bar prep).
  const slot = (s, sub) => {
    const pair = s.pairs.get(sub);
    const kind = pair.kinds[R.weighted(pair.kinds.map((k) => k.w))];
    let daysAgo = kind.absolute ? R.range(kind.lo, kind.hi) : pair.t0 - R.range(kind.lo, Math.min(kind.hi, pair.t0));
    if (s.inactive) daysAgo += 24;
    return { kind: kind.k, daysAgo: Math.max(0.05, daysAgo) };
  };
  const pickStudent = (sub) => candidates[sub][R.weighted(candidates[sub].map((c) => c.w))].s;

  // 1) The audit pool: each item is answered once by 40-85 different students.
  for (const id of audit) {
    const q = byQ.get(id);
    const pool = R.shuffle(candidates[q.subject_id].filter((c) => c.w > 0).map((c) => c.s));
    const m = Math.min(pool.length, (flagged.includes(id) ? 62 : 40) + R.int(flagged.includes(id) ? 28 : 46));
    for (let i = 0; i < m; i++) emit(pool[i], q, slot(pool[i], q.subject_id));
  }
  // 2) Coverage: every other question is answered 4-5 times, variations 8 (they are what the portals compare).
  for (const q of questions) {
    if (audit.has(q.id)) continue;
    const n = q.is_variation ? 8 : 4 + (R.chance(0.35) ? 1 : 0);
    for (let i = 0; i < n; i++) { const s = pickStudent(q.subject_id); emit(s, q, slot(s, q.subject_id)); }
  }

  // 3) Maya: strong overall, but the battle of the forms (and any one-fact variation of it) trips her up.
  //    She has studied for the last nine days running, with a gap before that.
  const nodeTitle = new Map(nodes.map((n) => [n.id, n.title]));
  const weakText = /2-207|battle of the forms|additional terms?|different terms?|knock-?out|expressly conditional/i;
  const mayaWeak = questions.filter((q) => q.subject_id === 'sales-and-leases' && q.status === 'approved'
    && (WEAK_RE.test(nodeTitle.get(q.rule_node_id) || '') || (q.is_variation && weakText.test(`${q.stem} ${q.pre_facts || ''}`))));
  const weakIds = new Set(mayaWeak.map((q) => q.id));
  for (const q of R.shuffle(mayaWeak)) {
    for (let r = 0; r < (q.is_variation ? 4 : 2); r++) emit(maya, q, { daysAgo: 12 + R.range(0, 45), mode: 'study', forceP: q.is_variation ? 0.12 : 0.66 });
  }
  const mayaSubjects = [['sales-and-leases', 90], ['evidence', 60], ['agency-and-partnership', 60], ['contracts-i', 40], ['civil-procedure', 30]];
  for (const [sub, n] of mayaSubjects) R.shuffle(questions.filter((q) => q.subject_id === sub && !weakIds.has(q.id))).slice(0, n).forEach((q) => emit(maya, q, { daysAgo: 12 + R.range(0, 40) }));
  const salesQs = questions.filter((q) => q.subject_id === 'sales-and-leases' && !weakIds.has(q.id));
  for (let d = 0; d < 9; d++) for (let i = 0; i < 4; i++) emit(maya, R.pick(salesQs), { daysAgo: d + 0.05 + i * 0.01, mode: 'study' });

  // 4) Jordan: rushes through Evidence, Professional Responsibility and Con Law, mostly in the last month.
  for (const [sub, n] of [['evidence', 130], ['professional-responsibility', 110], ['con-law-ii', 110]]) {
    R.shuffle(questions.filter((q) => q.subject_id === sub)).slice(0, n).forEach((q) => emit(jordan, q, { daysAgo: R.chance(0.65) ? R.range(0.1, 30) : R.range(30, 70) }));
  }

  events.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  return { users, events, flagged, weak, audit: [...audit], tags: Object.fromEntries(students.filter((s) => s.tags.length).map((s) => [s.u.id, s.tags])) };
}

export { hash32 };
