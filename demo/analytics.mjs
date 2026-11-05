// Everything the portals ask the database. Pure functions of (db, params) returning plain JSON;
// server.mjs only routes to them. Conventions: *_acc and *_rate are fractions 0..1, *_pct are whole
// percents, deltas are var - base (so a drop is negative), timestamps are ISO strings.

import { hash32 } from './lib/prng.mjs';
import { TRAPS } from './lib/traps.mjs';

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

export const SCOPE_SETS = { course: ['course', 'both'], all: ['course', 'both', 'bar_only'] };
export const SCOPES = ['course', 'bar_only', 'both', 'hidden'];
export const STATUSES = ['approved', 'flagged', 'draft', 'retired'];
export const RPB_THRESHOLD = 0.15; // an item that discriminates less than this goes to the audit queue
export const RPB_MIN_N = 30;       // ... once this many different students have answered it
const DAY = 86400000;

const ratio = (c, n) => (n ? c / n : null);
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const marks = (n) => Array.from({ length: n }, () => '?').join(',');
const json = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };
const trapLabel = (code) => TRAPS[code] || code;
const classLabel = (y) => ({ 2027: '3L', 2028: '2L', 2029: '1L' }[y] || String(y ?? ''));

function user(db, id) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) throw new HttpError(404, `No such user: ${id}`);
  return u;
}
function oneSubject(db, id) {
  const s = db.prepare('SELECT id, title, ncbe_category, accent, question_count, variation_count, rule_count, description FROM subjects WHERE id = ?').get(id);
  if (!s) throw new HttpError(404, `No such subject: ${id}`);
  return s;
}
const cohortFilter = (cohort) => {
  const c = String(cohort ?? 'all');
  if (c === 'all') return { sql: '', args: [], cohort: 'all' };
  if (!/^\d{4}$/.test(c)) throw new HttpError(400, 'cohort must be all, 2027, 2028 or 2029');
  return { sql: ' AND u.cohort_year = ?', args: [Number(c)], cohort: Number(c) };
};

// ---- personas and subjects ----------------------------------------------------------------

export function listPersonas(db) {
  return db.prepare("SELECT id, name, email, role, cohort_year, assigned_subject_id, persona_badge FROM users WHERE is_persona = 1 ORDER BY CASE role WHEN 'student' THEN 1 WHEN 'faculty' THEN 2 WHEN 'dean' THEN 3 ELSE 4 END, id").all()
    .map((u) => ({ ...u, class_label: classLabel(u.cohort_year), home: { student: '/student', faculty: '/faculty', dean: '/dean', admin: '/compiler' }[u.role] }));
}

export function listSubjects(db) {
  const scopes = db.prepare('SELECT subject_id, scope, COUNT(*) n FROM master_rule_nodes GROUP BY subject_id, scope').all();
  const qs = db.prepare("SELECT subject_id, COUNT(*) n FROM questions WHERE status = 'approved' GROUP BY subject_id").all();
  return db.prepare('SELECT id, title, ncbe_category, accent, question_count, variation_count, rule_count, description, sort_order FROM subjects ORDER BY sort_order, title').all().map((s) => ({
    ...s,
    scope_counts: Object.fromEntries(['course', 'both', 'bar_only', 'hidden'].map((k) => [k, scopes.find((x) => x.subject_id === s.id && x.scope === k)?.n || 0])),
    approved_count: qs.find((x) => x.subject_id === s.id)?.n || 0,
  }));
}

// ---- student ------------------------------------------------------------------------------

function streakDays(db, userId, now = Date.now()) {
  const days = new Set(db.prepare('SELECT DISTINCT substr(created_at, 1, 10) d FROM attempt_events WHERE user_id = ?').all(userId).map((r) => r.d));
  let n = 0;
  let t = now;
  // Today may not have started yet; the streak is still alive if yesterday had work.
  if (!days.has(new Date(t).toISOString().slice(0, 10))) t -= DAY;
  while (days.has(new Date(t).toISOString().slice(0, 10))) { n++; t -= DAY; }
  return n;
}

export function studentDashboard(db, userId, now = Date.now()) {
  const u = user(db, userId);
  const tot = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(a.is_correct),0) c, COALESCE(SUM(q.is_variation),0) vn,
      COALESCE(SUM(CASE WHEN q.is_variation=1 THEN a.is_correct ELSE 0 END),0) vc, COALESCE(AVG(a.duration_ms),0) ms,
      COALESCE(SUM(a.crossed_out_json != '[]'),0) xo, COALESCE(SUM(a.opened_popup),0) pop
    FROM attempt_events a JOIN questions q ON q.id = a.question_id WHERE a.user_id = ?`).get(userId);
  const baseN = tot.n - tot.vn;
  const bySubject = db.prepare(`SELECT s.id subject_id, s.title, s.accent, s.ncbe_category, COUNT(a.id) n, COALESCE(SUM(a.is_correct),0) c,
      COALESCE(SUM(q.is_variation),0) vn, COALESCE(SUM(CASE WHEN q.is_variation=1 THEN a.is_correct ELSE 0 END),0) vc
    FROM subjects s LEFT JOIN attempt_events a ON a.subject_id = s.id AND a.user_id = ? LEFT JOIN questions q ON q.id = a.question_id GROUP BY s.id ORDER BY s.sort_order`).all(userId)
    .map((r) => ({ subject_id: r.subject_id, title: r.title, accent: r.accent, ncbe_category: r.ncbe_category, attempts: r.n, acc: r3(ratio(r.c, r.n)), base_acc: r3(ratio(r.c - r.vc, r.n - r.vn)), var_acc: r3(ratio(r.vc, r.vn)) }));
  const weakRules = db.prepare(`SELECT r.id rule_id, r.title, r.area_title, r.scope, r.subject_id, s.title subject_title, s.accent, COUNT(*) n, SUM(a.is_correct) c,
      SUM(q.is_variation) vn, SUM(CASE WHEN q.is_variation=1 THEN a.is_correct ELSE 0 END) vc
    FROM attempt_events a JOIN master_rule_nodes r ON r.id = a.rule_node_id JOIN questions q ON q.id = a.question_id JOIN subjects s ON s.id = r.subject_id
    WHERE a.user_id = ? AND r.scope != 'hidden' GROUP BY r.id HAVING n >= 3 ORDER BY (1.0 * c / n) ASC, n DESC LIMIT 8`).all(userId)
    .map((r) => ({ rule_id: r.rule_id, title: r.title, area_title: r.area_title, scope: r.scope, subject_id: r.subject_id, subject_title: r.subject_title, accent: r.accent, attempts: r.n, acc: r3(r.c / r.n), var_attempts: r.vn, var_acc: r3(ratio(r.vc, r.vn)) }));
  const traps = db.prepare('SELECT trap_code, COUNT(*) n FROM attempt_events WHERE user_id = ? AND is_correct = 0 AND trap_code IS NOT NULL GROUP BY trap_code ORDER BY n DESC').all(userId);
  const wrong = traps.reduce((a, t) => a + t.n, 0);
  const daily = db.prepare(`SELECT substr(created_at,1,10) d, COUNT(*) n, SUM(is_correct) c FROM attempt_events WHERE user_id = ? AND created_at >= ? GROUP BY d ORDER BY d`)
    .all(userId, new Date(now - 13 * DAY).toISOString().slice(0, 10));
  const cohortAcc = u.cohort_year == null ? null : db.prepare('SELECT AVG(a.is_correct) a FROM attempt_events a JOIN users x ON x.id = a.user_id WHERE x.cohort_year = ? AND x.is_persona = 0').get(u.cohort_year).a;
  return {
    user: { id: u.id, name: u.name, role: u.role, cohort_year: u.cohort_year, class_label: classLabel(u.cohort_year), assigned_subject_id: u.assigned_subject_id, persona_badge: u.persona_badge },
    totals: { attempts: tot.n, accuracy: r3(ratio(tot.c, tot.n)), base_acc: r3(ratio(tot.c - tot.vc, baseN)), var_acc: r3(ratio(tot.vc, tot.vn)), base_attempts: baseN, var_attempts: tot.vn, drop_off: tot.vn && baseN ? r3(ratio(tot.vc, tot.vn) - ratio(tot.c - tot.vc, baseN)) : null },
    streak_days: streakDays(db, userId, now),
    habits: { avg_seconds: Math.round(tot.ms / 100) / 10, crossout_rate: r3(ratio(tot.xo, tot.n)), popup_rate: r3(ratio(tot.pop, tot.n)), cohort_acc: r3(cohortAcc) },
    by_subject: bySubject,
    weak_rules: weakRules,
    trap_breakdown: traps.map((t) => ({ trap_code: t.trap_code, label: trapLabel(t.trap_code), count: t.n, pct: Math.round((100 * t.n) / wrong) })),
    daily: daily.map((d) => ({ date: d.d, attempts: d.n, acc: r3(d.c / d.n) })),
  };
}

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Share of peers who picked each choice, smoothed lightly toward "mostly right" when few have answered. */
function peerShares(db, questionIds, choiceCounts) {
  if (!questionIds.length) return new Map();
  const rows = db.prepare(`SELECT question_id, selected_index, COUNT(*) n FROM attempt_events WHERE question_id IN (${marks(questionIds.length)}) GROUP BY question_id, selected_index`).all(...questionIds);
  const byQ = new Map();
  for (const r of rows) (byQ.get(r.question_id) || byQ.set(r.question_id, []).get(r.question_id)).push(r);
  const out = new Map();
  for (const q of questionIds) {
    const info = choiceCounts.get(q);
    const got = byQ.get(q) || [];
    const n = got.reduce((a, r) => a + r.n, 0);
    const K = 4;
    const prior = (idx) => (idx === info.correct ? 0.7 : 0.3 / Math.max(1, info.count - 1));
    const pcts = {};
    for (let i = 0; i < info.count; i++) {
      const c = got.find((r) => r.selected_index === i)?.n || 0;
      pcts[i] = Math.round((100 * (c + K * prior(i))) / (n + K));
    }
    out.set(q, { pcts, n });
  }
  return out;
}

export function studentSession(db, p) {
  const userId = p.userId || 'stu-maya';
  user(db, userId);
  const subjects = String(p.subjects || '').split(',').map((s) => s.trim()).filter(Boolean);
  const all = db.prepare('SELECT id FROM subjects').all().map((r) => r.id);
  for (const s of subjects) if (!all.includes(s)) throw new HttpError(400, `Unknown subject: ${s}`);
  const picked = subjects.length ? subjects : all;
  const scope = p.scope === 'all' ? 'all' : 'course';
  const kind = ['base', 'variation'].includes(p.kind) ? p.kind : 'all';
  const focus = ['weak', 'missed'].includes(p.focus) ? p.focus : 'all';
  const limit = Math.min(100, Math.max(1, parseInt(p.limit, 10) || 20));

  const where = [`q.subject_id IN (${marks(picked.length)})`, "q.status = 'approved'", `r.scope IN (${marks(SCOPE_SETS[scope].length)})`];
  const args = [...picked, ...SCOPE_SETS[scope]];
  if (kind === 'base') where.push('q.is_variation = 0');
  if (kind === 'variation') where.push('q.is_variation = 1');
  let note = null;
  if (focus === 'weak') {
    const weak = db.prepare(`SELECT a.rule_node_id id FROM attempt_events a WHERE a.user_id = ? AND a.subject_id IN (${marks(picked.length)}) GROUP BY a.rule_node_id HAVING COUNT(*) >= 2 AND 1.0 * SUM(a.is_correct) / COUNT(*) < 0.75 ORDER BY 1.0 * SUM(a.is_correct) / COUNT(*) ASC, COUNT(*) DESC LIMIT 12`).all(userId, ...picked).map((r) => r.id);
    if (weak.length) { where.push(`q.rule_node_id IN (${marks(weak.length)})`); args.push(...weak); } else note = 'No weak rules yet in these subjects, so this is a mixed set.';
  } else if (focus === 'missed') {
    const missed = db.prepare(`SELECT question_id id FROM (SELECT question_id, is_correct, ROW_NUMBER() OVER (PARTITION BY question_id ORDER BY created_at DESC, id DESC) rn FROM attempt_events WHERE user_id = ?) WHERE rn = 1 AND is_correct = 0`).all(userId).map((r) => r.id);
    if (missed.length) { where.push(`q.id IN (${marks(missed.length)})`); args.push(...missed); } else note = 'Nothing is currently missed in these subjects, so this is a mixed set.';
  }
  const sql = `SELECT q.id, q.subject_id, q.source_set, q.is_variation, q.pre_facts, q.parent_question_id, q.fixed_order, q.stem, q.correct_index, q.rule_node_id,
      r.title rule_title, r.area_title, r.scope, r.outline_anchor, s.title subject_title, s.accent,
      (SELECT COUNT(*) FROM attempt_events a WHERE a.user_id = ? AND a.question_id = q.id) seen
    FROM questions q JOIN master_rule_nodes r ON r.id = q.rule_node_id JOIN subjects s ON s.id = q.subject_id WHERE ${where.join(' AND ')}`;
  let pool = db.prepare(sql).all(userId, ...args);
  if (!pool.length && focus !== 'all') {
    // Fall back to a mixed set rather than an empty quiz.
    const w2 = where.filter((w) => !/rule_node_id IN|q\.id IN/.test(w));
    const a2 = [...picked, ...SCOPE_SETS[scope]];
    pool = db.prepare(sql.replace(where.join(' AND '), w2.join(' AND '))).all(userId, ...a2);
    note = note || 'No questions matched that focus, so this is a mixed set.';
  }
  const total = pool.length;
  // Unseen questions first, then random.
  pool = shuffled(pool).sort((a, b) => Math.min(a.seen, 1) - Math.min(b.seen, 1)).slice(0, limit);
  const ids = pool.map((q) => q.id);
  const ch = ids.length ? db.prepare(`SELECT question_id, choice_index, choice_text FROM question_choices WHERE question_id IN (${marks(ids.length)}) ORDER BY question_id, choice_index`).all(...ids) : [];
  const chBy = new Map();
  for (const c of ch) (chBy.get(c.question_id) || chBy.set(c.question_id, []).get(c.question_id)).push(c);
  const counts = new Map(pool.map((q) => [q.id, { correct: q.correct_index, count: (chBy.get(q.id) || []).length }]));
  const peers = peerShares(db, ids, counts);
  const questions = shuffled(pool).map((q) => {
    const list = chBy.get(q.id) || [];
    const ordered = q.fixed_order ? list : shuffled(list);
    const pc = peers.get(q.id);
    return {
      id: q.id, subject_id: q.subject_id, subject_title: q.subject_title, accent: q.accent, source_set: q.source_set,
      rule: { id: q.rule_node_id, title: q.rule_title, area_title: q.area_title, scope: q.scope, outline_anchor: q.outline_anchor },
      is_variation: !!q.is_variation, pre_facts: q.pre_facts, parent_question_id: q.parent_question_id, fixed_order: !!q.fixed_order, seen_before: q.seen > 0,
      stem: q.stem, peer_n: pc.n,
      choices: ordered.map((c) => ({ index: c.choice_index, text: c.choice_text, peer_pick_pct: pc.pcts[c.choice_index] })),
    };
  });
  return { user_id: userId, filters: { subjects: picked, scope, kind, focus, limit }, pool: total, count: questions.length, note, questions };
}

export function recordAttempt(db, b, now = Date.now()) {
  const u = user(db, b.userId);
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(b.questionId);
  if (!q) throw new HttpError(404, `No such question: ${b.questionId}`);
  const choices = db.prepare('SELECT * FROM question_choices WHERE question_id = ? ORDER BY choice_index').all(q.id);
  const sel = Number(b.selectedIndex);
  const chosen = choices.find((c) => c.choice_index === sel);
  if (!Number.isInteger(sel) || !chosen) throw new HttpError(400, 'selectedIndex is not a choice of this question');
  const crossed = (Array.isArray(b.crossedOut) ? b.crossedOut : []).map(Number).filter((i) => choices.some((c) => c.choice_index === i));
  const mode = b.mode === 'timed' ? 'timed' : 'study';
  const duration = Math.min(3600000, Math.max(0, Math.round(Number(b.durationMs) || 0)));
  const correct = chosen.is_correct ? 1 : 0;
  db.prepare(`INSERT INTO attempt_events (user_id, question_id, subject_id, rule_node_id, selected_index, is_correct, trap_code, crossed_out_json, opened_popup, duration_ms, mode, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(u.id, q.id, q.subject_id, q.rule_node_id, sel, correct, correct ? null : chosen.trap_code, JSON.stringify([...new Set(crossed)].sort((a, b2) => a - b2)), b.openedPopup ? 1 : 0, duration, mode, new Date(now).toISOString());
  const peers = peerShares(db, [q.id], new Map([[q.id, { correct: q.correct_index, count: choices.length }]])).get(q.id);
  const dash = db.prepare('SELECT COUNT(*) n, SUM(is_correct) c FROM attempt_events WHERE user_id = ?').get(u.id);
  const trapPeer = chosen.trap_code && !correct ? peers.pcts[sel] : null;
  return {
    ok: true, correct: !!correct, correct_index: q.correct_index, selected_index: sel,
    explanation: q.explanation || choices.find((c) => c.is_correct)?.rationale || null,
    choices: choices.map((c) => ({ index: c.choice_index, text: c.choice_text, rationale: c.rationale, is_correct: !!c.is_correct, trap_code: c.trap_code, trap_label: c.trap_label, peer_pick_pct: peers.pcts[c.choice_index] })),
    peer_choice_pcts: peers.pcts, peer_n: peers.n,
    trap: chosen.trap_code && !correct ? { code: chosen.trap_code, label: chosen.trap_label, peer_pct: trapPeer } : null,
    stats: { attempts: dash.n, accuracy: r3(dash.c / dash.n), streak_days: streakDays(db, u.id, now) },
  };
}

// ---- outline -------------------------------------------------------------------------------

/** The outline cut into h2 sections: { start, end, ids } plus the preamble before the first one. */
function cutSections(html) {
  const heads = [...html.matchAll(/(?:<div class="section-band">)?<h2\b[^>]*>/g)];
  const cuts = heads.map((m) => m.index);
  const out = [];
  cuts.forEach((start, i) => {
    const end = cuts[i + 1] ?? html.length;
    const body = html.slice(start, end);
    out.push({ start, end, id: body.match(/<h2\b[^>]*\sid="([^"]+)"/)?.[1] || null, ids: [...body.matchAll(/<h[23]\b[^>]*\sid="([^"]+)"/g)].map((m) => m[1]), title: (body.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/)?.[1] || '').replace(/<[^>]+>/g, '').trim() });
  });
  return out;
}

export function subjectOutline(db, subjectId, scopeParam) {
  const s = db.prepare('SELECT id, title, ncbe_category, accent, outline_html FROM subjects WHERE id = ?').get(subjectId);
  if (!s) throw new HttpError(404, `No such subject: ${subjectId}`);
  const scope = scopeParam === 'all' ? 'all' : 'course';
  const rules = db.prepare(`SELECT r.id, r.area_title, r.code, r.title, r.scope, r.outline_anchor, r.statute_cites_json, r.case_cites_json,
      (SELECT COUNT(*) FROM questions q WHERE q.rule_node_id = r.id AND q.status = 'approved') question_count FROM master_rule_nodes r WHERE r.subject_id = ? AND r.scope != 'hidden' ORDER BY r.rowid`).all(subjectId);
  const html = s.outline_html || '';
  const secs = cutSections(html);
  const byAnchor = new Map();
  for (const r of rules) if (r.outline_anchor) (byAnchor.get(r.outline_anchor.slice(1)) || byAnchor.set(r.outline_anchor.slice(1), []).get(r.outline_anchor.slice(1))).push(r.scope);
  const sections = secs.map((sec) => {
    const scopes = sec.ids.flatMap((id) => byAnchor.get(id) || []);
    let kind = 'both';
    if (scopes.length) {
      const hasCourse = scopes.some((x) => x === 'course' || x === 'both');
      kind = !hasCourse ? 'bar_only' : scopes.every((x) => x === 'course') ? 'course' : 'both';
    }
    return { ...sec, scope: scopes.length ? kind : null, rules: scopes.length };
  });
  let out = '';
  let at = 0;
  const label = { bar_only: 'Bar only', course: 'In your course', both: 'Course + Bar' };
  for (const sec of sections) {
    out += html.slice(at, sec.start);
    at = sec.end;
    if (scope === 'course' && sec.scope === 'bar_only') continue;
    let body = html.slice(sec.start, sec.end);
    if (sec.scope) body = body.replace(/(<h2\b[^>]*>[\s\S]*?<\/h2>)/, `$1<span class="scope-badge scope-${sec.scope}" title="${sec.rules} rule${sec.rules === 1 ? '' : 's'} map here">${label[sec.scope]}</span>`);
    out += body;
  }
  out += html.slice(at);
  const keep = (r) => scope === 'all' || r.scope === 'course' || r.scope === 'both';
  return {
    subject: { id: s.id, title: s.title, accent: s.accent, ncbe_category: s.ncbe_category }, scope,
    sections: sections.map((x) => ({ id: x.id, anchor: x.id ? `#${x.id}` : null, title: x.title, scope: x.scope, rules: x.rules, hidden: scope === 'course' && x.scope === 'bar_only' })),
    rules: rules.filter(keep).map((r) => ({ id: r.id, area_title: r.area_title, code: r.code, title: r.title, scope: r.scope, outline_anchor: r.outline_anchor, statute_cites: json(r.statute_cites_json, []), case_cites: json(r.case_cites_json, []), question_count: r.question_count })),
    html: out,
  };
}

// ---- item statistics -----------------------------------------------------------------------

/**
 * Per-question difficulty and point-biserial discrimination. Each student counts once per question
 * (their first attempt); their "rest score" is their accuracy on everything else they answered.
 * A question edited in the SME workbench is measured from its edit onward.
 */
export function itemStats(db, { subjectId = null, cohort = 'all', minN = 1 } = {}) {
  const cf = cohortFilter(cohort);
  const totals = new Map(db.prepare(`SELECT a.user_id u, COUNT(*) n, SUM(a.is_correct) c FROM attempt_events a JOIN users u ON u.id = a.user_id WHERE 1=1${cf.sql} GROUP BY a.user_id`).all(...cf.args).map((r) => [r.u, [r.n, r.c]]));
  const rows = db.prepare(`SELECT a.user_id u, a.question_id q, a.is_correct c, MIN(a.created_at) t FROM attempt_events a JOIN questions q ON q.id = a.question_id JOIN users u ON u.id = a.user_id
    WHERE (q.updated_at IS NULL OR a.created_at >= q.updated_at)${subjectId ? ' AND q.subject_id = ?' : ''}${cf.sql} GROUP BY a.user_id, a.question_id`).all(...(subjectId ? [subjectId] : []), ...cf.args);
  const byQ = new Map();
  for (const r of rows) (byQ.get(r.q) || byQ.set(r.q, []).get(r.q)).push(r);
  const out = new Map();
  for (const [qid, list] of byQ) {
    const n = list.length;
    if (n < minN) continue;
    const ys = list.map((e) => e.c);
    const p = ys.reduce((a, b) => a + b, 0) / n;
    let rpb = null;
    if (n >= 3 && p > 0 && p < 1) {
      const xs = list.map((e) => { const [tn, tc] = totals.get(e.u) || [1, 0]; return tn > 1 ? (tc - e.c) / (tn - 1) : 0; });
      const m = xs.reduce((a, b) => a + b, 0) / n;
      const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / n);
      if (sd > 0) {
        let s1 = 0, s0 = 0, n1 = 0, n0 = 0;
        xs.forEach((x, i) => { if (ys[i]) { s1 += x; n1++; } else { s0 += x; n0++; } });
        rpb = ((s1 / n1 - s0 / n0) / sd) * Math.sqrt(p * (1 - p));
      }
    }
    out.set(qid, { n, p: r3(p), rpb: r3(rpb) });
  }
  return out;
}

function auditRows(db, ids) {
  if (!ids.length) return [];
  const qs = db.prepare(`SELECT q.id, q.subject_id, q.source_set, q.stem, q.status, q.revision, q.updated_at, q.explanation, q.correct_index, q.rule_node_id, q.is_variation, q.pre_facts,
      r.title rule_title, r.area_title, s.title subject_title, s.accent FROM questions q JOIN master_rule_nodes r ON r.id = q.rule_node_id JOIN subjects s ON s.id = q.subject_id WHERE q.id IN (${marks(ids.length)})`).all(...ids);
  const ch = db.prepare(`SELECT question_id, choice_index, choice_text, rationale, is_correct, trap_code, trap_label FROM question_choices WHERE question_id IN (${marks(ids.length)}) ORDER BY question_id, choice_index`).all(...ids);
  const picks = db.prepare(`SELECT question_id, selected_index, COUNT(*) n FROM attempt_events WHERE question_id IN (${marks(ids.length)}) GROUP BY question_id, selected_index`).all(...ids);
  return qs.map((q) => {
    const mine = picks.filter((p) => p.question_id === q.id);
    const total = mine.reduce((a, p) => a + p.n, 0);
    return {
      ...q, is_variation: !!q.is_variation,
      choices: ch.filter((c) => c.question_id === q.id).map((c) => ({ index: c.choice_index, text: c.choice_text, rationale: c.rationale, is_correct: !!c.is_correct, trap_code: c.trap_code, trap_label: c.trap_label, pick_pct: total ? Math.round((100 * (mine.find((p) => p.selected_index === c.choice_index)?.n || 0)) / total) : null })),
    };
  });
}

/** Audit queue: tested items below the discrimination threshold, worst first, plus items fixed recently. */
export function psychometrics(db, { cohort = 'all', subjectId = null, limit = 40 } = {}) {
  const stats = itemStats(db, { subjectId, cohort, minN: 1 });
  const tested = [...stats].filter(([, s]) => s.n >= RPB_MIN_N && s.rpb != null);
  const flagged = new Map(db.prepare(`SELECT id FROM questions WHERE status = 'flagged'${subjectId ? ' AND subject_id = ?' : ''}`).all(...(subjectId ? [subjectId] : [])).map((r) => [r.id, true]));
  const hits = tested.filter(([id, s]) => s.rpb < RPB_THRESHOLD || flagged.has(id)).sort((a, b) => a[1].rpb - b[1].rpb).slice(0, limit);
  const rows = auditRows(db, hits.map(([id]) => id));
  const alerts = hits.map(([id, s]) => {
    const q = rows.find((x) => x.id === id);
    const severity = s.rpb < -0.05 ? 'inverted' : s.p >= 0.95 ? 'ceiling' : 'weak';
    return { question_id: id, ...q, id: undefined, n: s.n, p: s.p, rpb: s.rpb, severity, stem_preview: q.stem.length > 190 ? `${q.stem.slice(0, 189)}…` : q.stem,
      note: severity === 'inverted' ? 'Stronger students miss this more than weaker ones: look for a keyed-wrong answer or an ambiguous stem.' : severity === 'ceiling' ? 'Nearly everyone gets it right, so it cannot separate students.' : 'Barely separates strong from weak students.' };
  });
  // Items that were flagged but have no tested attempts yet (just edited, now monitored) are "resolved".
  const edited = db.prepare(`SELECT q.id, q.revision, q.updated_at, q.status FROM questions q WHERE q.revision > 0${subjectId ? ' AND q.subject_id = ?' : ''} ORDER BY q.updated_at DESC LIMIT 20`).all(...(subjectId ? [subjectId] : []));
  const resolved = auditRows(db, edited.map((e) => e.id)).map((q) => ({ question_id: q.id, subject_id: q.subject_id, subject_title: q.subject_title, rule_title: q.rule_title, stem_preview: q.stem.length > 190 ? `${q.stem.slice(0, 189)}…` : q.stem, status: q.status, revision: q.revision, updated_at: q.updated_at, since_edit: stats.get(q.id) || { n: 0, p: null, rpb: null } }));
  return {
    threshold: RPB_THRESHOLD, min_n: RPB_MIN_N,
    summary: { items_tested: tested.length, alerts: alerts.length, inverted: alerts.filter((a) => a.severity === 'inverted').length, flagged: flagged.size, median_rpb: tested.length ? r3(tested.map(([, s]) => s.rpb).sort((a, b) => a - b)[Math.floor(tested.length / 2)]) : null },
    alerts: alerts.map(({ id: _drop, ...a }) => a), resolved,
  };
}

// ---- faculty -------------------------------------------------------------------------------

export function ruleHeatmap(db, subjectId, cohort = 'all') {
  const cf = cohortFilter(cohort);
  const rows = db.prepare(`SELECT r.id rule_id, r.area_title, r.code, r.title, r.scope, r.outline_anchor, r.statute_cites_json,
      COUNT(a.id) n, COALESCE(SUM(a.is_correct),0) c,
      COALESCE(SUM(CASE WHEN q.is_variation = 0 THEN 1 END),0) base_n, COALESCE(SUM(CASE WHEN q.is_variation = 0 THEN a.is_correct END),0) base_c,
      COALESCE(SUM(CASE WHEN q.is_variation = 1 THEN 1 END),0) var_n, COALESCE(SUM(CASE WHEN q.is_variation = 1 THEN a.is_correct END),0) var_c,
      (SELECT COUNT(*) FROM questions x WHERE x.rule_node_id = r.id AND x.status != 'retired') question_count,
      (SELECT COUNT(*) FROM questions x WHERE x.rule_node_id = r.id AND x.is_variation = 1 AND x.status != 'retired') variation_count
    FROM master_rule_nodes r LEFT JOIN attempt_events a ON a.rule_node_id = r.id LEFT JOIN questions q ON q.id = a.question_id LEFT JOIN users u ON u.id = a.user_id
    WHERE r.subject_id = ?${cf.sql} GROUP BY r.id ORDER BY r.rowid`).all(subjectId, ...cf.args);
  const trapRows = db.prepare(`SELECT a.rule_node_id rule_id, a.trap_code, COUNT(*) n FROM attempt_events a JOIN users u ON u.id = a.user_id WHERE a.subject_id = ? AND a.is_correct = 0 AND a.trap_code IS NOT NULL${cf.sql} GROUP BY a.rule_node_id, a.trap_code`).all(subjectId, ...cf.args);
  const trapBy = new Map();
  for (const t of trapRows) { const o = trapBy.get(t.rule_id) || { total: 0, top: null }; o.total += t.n; if (!o.top || t.n > o.top.n) o.top = t; trapBy.set(t.rule_id, o); }
  return rows.map((r) => {
    const baseAcc = ratio(r.base_c, r.base_n), varAcc = ratio(r.var_c, r.var_n), t = trapBy.get(r.rule_id);
    return {
      rule_id: r.rule_id, area_title: r.area_title, code: r.code, title: r.title, scope: r.scope, outline_anchor: r.outline_anchor, statute_cites: json(r.statute_cites_json, []),
      attempts: r.n, acc: r3(ratio(r.c, r.n)), miss_rate: r.n ? r3(1 - r.c / r.n) : null, base_n: r.base_n, var_n: r.var_n, base_acc: r3(baseAcc), var_acc: r3(varAcc),
      delta_v: baseAcc != null && varAcc != null ? r3(varAcc - baseAcc) : null, question_count: r.question_count, variation_count: r.variation_count,
      top_trap_code: t?.top?.trap_code ?? null, top_trap_label: t?.top ? trapLabel(t.top.trap_code) : null, top_trap_pct: t?.top ? Math.round((100 * t.top.n) / t.total) : null, wrong_n: t?.total ?? 0,
    };
  });
}

export function facultyAnalytics(db, subjectId) {
  if (!subjectId) throw new HttpError(400, 'subjectId is required');
  const subject = oneSubject(db, subjectId);
  const k = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(a.is_correct),0) c, COUNT(DISTINCT a.user_id) students, COALESCE(AVG(a.duration_ms),0) ms, COALESCE(SUM(a.opened_popup),0) pop,
      COALESCE(SUM(CASE WHEN q.is_variation=1 THEN 1 END),0) vn, COALESCE(SUM(CASE WHEN q.is_variation=1 THEN a.is_correct END),0) vc
    FROM attempt_events a JOIN questions q ON q.id = a.question_id JOIN users u ON u.id = a.user_id WHERE a.subject_id = ?`).get(subjectId);
  const heat = ruleHeatmap(db, subjectId);
  const stats = itemStats(db, { subjectId, minN: 1 });
  const flaggedQ = db.prepare(`SELECT id FROM questions WHERE subject_id = ? AND status IN ('flagged','draft')`).all(subjectId).map((r) => r.id);
  const watch = [...stats].filter(([id, s]) => s.n >= RPB_MIN_N && s.rpb != null && s.rpb < RPB_THRESHOLD && !flaggedQ.includes(id)).sort((a, b) => a[1].rpb - b[1].rpb).slice(0, 12).map(([id]) => id);
  const ids = [...flaggedQ, ...watch];
  const recentFlagged = auditRows(db, ids).map((q) => {
    const s = stats.get(q.id) || { n: 0, p: null, rpb: null };
    return { question_id: q.id, status: q.status, source_set: q.source_set, rule_id: q.rule_node_id, rule_title: q.rule_title, stem_preview: q.stem.length > 220 ? `${q.stem.slice(0, 219)}…` : q.stem, n: s.n, p: s.p, rpb: s.rpb, revision: q.revision, reason: q.status === 'flagged' ? (s.rpb != null && s.rpb < -0.05 ? 'Inverted discrimination: stronger students miss it more' : 'Flagged for review') : q.status === 'draft' ? 'Draft awaiting approval' : 'Low discrimination: barely separates strong from weak', choices: q.choices };
  }).sort((a, b) => (a.rpb ?? 9) - (b.rpb ?? 9));
  const areas = new Map();
  for (const r of heat) { const a = areas.get(r.area_title) || { area_title: r.area_title, attempts: 0, correct: 0, rules: 0 }; a.attempts += r.attempts; a.correct += r.acc == null ? 0 : r.acc * r.attempts; a.rules++; areas.set(r.area_title, a); }
  const baseN = k.n - k.vn;
  const baseAcc = ratio(k.c - k.vc, baseN), varAcc = ratio(k.vc, k.vn);
  return {
    subject,
    kpis: {
      students: k.students, attempts: k.n, accuracy: r3(ratio(k.c, k.n)), base_acc: r3(baseAcc), var_acc: r3(varAcc), drop_off: baseAcc != null && varAcc != null ? r3(varAcc - baseAcc) : null,
      avg_seconds: Math.round(k.ms / 100) / 10, popup_rate: r3(ratio(k.pop, k.n)), flagged_count: flaggedQ.length,
      rules: heat.length, rules_in_course: heat.filter((r) => r.scope === 'course' || r.scope === 'both').length, rules_bar_only: heat.filter((r) => r.scope === 'bar_only').length, rules_hidden: heat.filter((r) => r.scope === 'hidden').length,
    },
    ruleHeatmap: heat,
    areas: [...areas.values()].map((a) => ({ area_title: a.area_title, rules: a.rules, attempts: a.attempts, acc: a.attempts ? r3(a.correct / a.attempts) : null })),
    recentFlagged,
  };
}

export function setRuleScope(db, ruleId, scope) {
  if (!SCOPES.includes(scope)) throw new HttpError(400, `scope must be one of ${SCOPES.join(', ')}`);
  const r = db.prepare('SELECT * FROM master_rule_nodes WHERE id = ?').get(ruleId);
  if (!r) throw new HttpError(404, `No such rule: ${ruleId}`);
  db.prepare('UPDATE master_rule_nodes SET scope = ? WHERE id = ?').run(scope, ruleId);
  const q = db.prepare("SELECT COUNT(*) n FROM questions WHERE rule_node_id = ? AND status = 'approved'").get(ruleId).n;
  const counts = db.prepare('SELECT scope, COUNT(*) n FROM master_rule_nodes WHERE subject_id = ? GROUP BY scope').all(r.subject_id);
  return { ok: true, rule: { id: r.id, subject_id: r.subject_id, title: r.title, area_title: r.area_title, previous_scope: r.scope, scope }, questions_affected: q, scope_counts: Object.fromEntries(['course', 'both', 'bar_only', 'hidden'].map((k) => [k, counts.find((c) => c.scope === k)?.n || 0])) };
}

const LETTERS = 'ABCDEFGH';

/** A targeted reteach drill: prefers questions students miss on the chosen rules, one-fact variations first. */
export function buildDrill(db, p) {
  const subject = oneSubject(db, p.subjectId);
  const ruleIds = (Array.isArray(p.ruleIds) ? p.ruleIds : []).map(String);
  if (!ruleIds.length) throw new HttpError(400, 'ruleIds must list at least one rule');
  const rules = db.prepare(`SELECT id, title, area_title, subject_id FROM master_rule_nodes WHERE id IN (${marks(ruleIds.length)})`).all(...ruleIds);
  if (rules.some((r) => r.subject_id !== subject.id) || rules.length !== ruleIds.length) throw new HttpError(400, 'Every rule must exist and belong to the subject');
  const count = Math.min(30, Math.max(1, parseInt(p.count, 10) || 10));
  const pool = db.prepare(`SELECT q.id, q.rule_node_id, q.stem, q.pre_facts, q.is_variation, q.fixed_order, q.correct_index, q.explanation,
      (SELECT AVG(1.0 - a.is_correct) FROM attempt_events a WHERE a.question_id = q.id) miss
    FROM questions q WHERE q.rule_node_id IN (${marks(ruleIds.length)}) AND q.status = 'approved'`).all(...ruleIds);
  const byRule = new Map(ruleIds.map((id) => [id, pool.filter((q) => q.rule_node_id === id).sort((a, b) => (b.is_variation - a.is_variation) || ((b.miss ?? 0.3) - (a.miss ?? 0.3)))]));
  const chosen = [];
  for (let round = 0; chosen.length < count && round < 50; round++) {
    let added = false;
    for (const id of ruleIds) {
      const q = byRule.get(id)[round];
      if (q && chosen.length < count) { chosen.push(q); added = true; }
    }
    if (!added) break;
  }
  const ch = chosen.length ? db.prepare(`SELECT * FROM question_choices WHERE question_id IN (${marks(chosen.length)}) ORDER BY question_id, choice_index`).all(...chosen.map((q) => q.id)) : [];
  const items = chosen.map((q, i) => {
    const list = ch.filter((c) => c.question_id === q.id);
    const ordered = q.fixed_order ? list : shuffled(list);
    const right = ordered.findIndex((c) => c.is_correct);
    const rule = rules.find((r) => r.id === q.rule_node_id);
    return {
      number: i + 1, question_id: q.id, rule_id: q.rule_node_id, rule_title: rule.title, is_variation: !!q.is_variation, pre_facts: q.pre_facts, stem: q.stem,
      choices: ordered.map((c, k) => ({ letter: LETTERS[k], text: c.choice_text })),
      answer_letter: LETTERS[right], explanation: q.explanation || ordered[right]?.rationale || null,
      distractors: ordered.map((c, k) => ({ letter: LETTERS[k], rationale: c.rationale, trap_label: c.trap_label })).filter((_, k) => k !== right),
    };
  });
  return {
    title: `${subject.title}: ${rules.length === 1 ? rules[0].title.slice(0, 80) : `${rules.length}-rule`} reteach drill`, subject: { id: subject.id, title: subject.title },
    rules: rules.map((r) => ({ id: r.id, title: r.title, area_title: r.area_title })), requested: count, built: items.length, short: items.length < count, generated_at: new Date().toISOString(), questions: items,
  };
}

// ---- dean ----------------------------------------------------------------------------------

function retention(db, cf) {
  const rows = db.prepare(`SELECT a.user_id u, a.subject_id s, a.is_correct c, a.created_at t, u.cohort_year y FROM attempt_events a JOIN users u ON u.id = a.user_id WHERE u.is_persona = 0${cf.sql} ORDER BY a.user_id, a.subject_id, a.created_at`).all(...cf.args);
  const pairs = new Map();
  for (const r of rows) { const k = `${r.u}|${r.s}`; (pairs.get(k) || pairs.set(k, []).get(k)).push(r); }
  const bucket = () => ({ n: 0, c: 0 });
  const make = () => ({ eoc: bucket(), unreviewed: bucket(), refresher: bucket() });
  const overall = make(), cohorts = new Map(), subjects = new Map();
  for (const list of pairs.values()) {
    if (list.length < 8) continue;
    const t0 = Date.parse(list[0].t);
    const days = list.map((r) => (Date.parse(r.t) - t0) / DAY);
    const reviews = days.filter((d) => d > 45 && d < 150).length;
    list.forEach((r, i) => {
      const d = days[i];
      const key = d <= 45 ? 'eoc' : d >= 165 && d <= 240 ? (reviews >= 3 ? 'refresher' : 'unreviewed') : null;
      if (!key) return;
      for (const t of [overall, cohorts.get(r.y) || cohorts.set(r.y, make()).get(r.y), subjects.get(r.s) || subjects.set(r.s, make()).get(r.s)]) { t[key].n++; t[key].c += r.c; }
    });
  }
  const fin = (m) => Object.fromEntries(Object.entries(m).map(([k, b]) => [k, b.n >= 10 ? { acc: r3(b.c / b.n), n: b.n } : null]));
  const titles = new Map(db.prepare('SELECT id, title FROM subjects').all().map((s) => [s.id, s.title]));
  return {
    labels: { eoc: 'End of course', unreviewed: '+6 months, unreviewed', refresher: '+6 months, spaced refresher' },
    overall: fin(overall),
    by_cohort: [...cohorts].sort((a, b) => a[0] - b[0]).map(([y, m]) => ({ cohort_year: y, class_label: classLabel(y), ...fin(m) })),
    by_subject: [...subjects].map(([id, m]) => ({ subject_id: id, title: titles.get(id), ...fin(m) })),
  };
}

function roster(db, cf, now) {
  const rows = db.prepare(`SELECT u.id, u.name, u.cohort_year, u.persona_badge, u.is_persona, COUNT(*) n, SUM(a.is_correct) c, AVG(a.duration_ms) ms, SUM(a.crossed_out_json != '[]') xo, SUM(a.opened_popup) pop,
      SUM(CASE WHEN q.is_variation=0 THEN 1 ELSE 0 END) bn, SUM(CASE WHEN q.is_variation=0 THEN a.is_correct ELSE 0 END) bc,
      SUM(CASE WHEN q.is_variation=1 THEN 1 ELSE 0 END) vn, SUM(CASE WHEN q.is_variation=1 THEN a.is_correct ELSE 0 END) vc,
      SUM(CASE WHEN a.created_at >= ? THEN 1 ELSE 0 END) n30, MAX(a.created_at) last
    FROM users u JOIN attempt_events a ON a.user_id = u.id JOIN questions q ON q.id = a.question_id WHERE u.role = 'student'${cf.sql} GROUP BY u.id`).all(new Date(now - 30 * DAY).toISOString(), ...cf.args);
  const worst = db.prepare(`SELECT a.user_id u, a.subject_id s, COUNT(*) n, AVG(a.is_correct) acc FROM attempt_events a GROUP BY a.user_id, a.subject_id HAVING n >= 12`).all();
  const everyone = rows.reduce((a, r) => a + r.ms * r.n, 0) / Math.max(1, rows.reduce((a, r) => a + r.n, 0));
  const titles = new Map(db.prepare('SELECT id, title FROM subjects').all().map((s) => [s.id, s.title]));
  return rows.map((r) => {
    const acc = r.c / r.n, secs = r.ms / 1000, cross = r.xo / r.n, base = ratio(r.bc, r.bn), vr = ratio(r.vc, r.vn);
    const gap = base != null && vr != null ? base - vr : null;
    const days = (now - Date.parse(r.last)) / DAY;
    const tags = [], reasons = [];
    let points = 0;
    if (r.n >= 40 && secs < 33) { tags.push('rushing'); points += 2; reasons.push(`Averages ${Math.round(secs)}s per question (class average ${Math.round(everyone / 1000)}s).`); }
    if (r.n >= 40 && cross < 0.06) { tags.push('no-cross-outs'); points += 1; reasons.push(`Crosses out wrong choices on only ${Math.round(cross * 100)}% of questions.`); }
    if (r.vn >= 10 && gap != null && gap >= 0.45) { tags.push('variation-drop'); points += gap >= 0.5 ? 2 : 1; reasons.push(`Scores ${Math.round(base * 100)}% on base questions but ${Math.round(vr * 100)}% when one fact changes.`); }
    if (r.n >= 30 && days > 21) { tags.push('low-volume'); points += 2; reasons.push(`Gone quiet: last active ${Math.round(days)} days ago, ${r.n30} questions in the last 30 days.`); }
    if (r.n >= 40 && acc < 0.5) { tags.push('low-accuracy'); points += 2; reasons.push(`Overall accuracy ${Math.round(acc * 100)}%.`); }
    const w = worst.filter((x) => x.u === r.id).sort((a, b) => a.acc - b.acc)[0];
    return {
      user_id: r.id, name: r.name, anon_id: `S-${hash32(r.id).toString(36).toUpperCase().padStart(5, '0').slice(0, 5)}`, cohort_year: r.cohort_year, class_label: classLabel(r.cohort_year), is_persona: !!r.is_persona,
      attempts: r.n, accuracy: r3(acc), base_acc: r3(base), var_acc: r3(vr), var_gap: r3(gap), avg_seconds: Math.round(secs * 10) / 10, crossout_rate: r3(cross), popup_rate: r3(r.pop / r.n),
      attempts_30d: r.n30, last_active: r.last, days_since_active: Math.round(days * 10) / 10, tags, reasons, risk_score: points, at_risk: points >= 2,
      weakest_subject: w ? { subject_id: w.s, title: titles.get(w.s), acc: r3(w.acc) } : null,
    };
  }).sort((a, b) => b.risk_score - a.risk_score || a.accuracy - b.accuracy);
}

export function deanOverview(db, cohortParam = 'all', now = Date.now()) {
  const cf = cohortFilter(cohortParam);
  const k = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(a.is_correct),0) c, COUNT(DISTINCT a.user_id) students, COALESCE(AVG(a.duration_ms),0) ms,
      COALESCE(SUM(CASE WHEN q.is_variation=1 THEN 1 END),0) vn, COALESCE(SUM(CASE WHEN q.is_variation=1 THEN a.is_correct END),0) vc
    FROM attempt_events a JOIN questions q ON q.id = a.question_id JOIN users u ON u.id = a.user_id WHERE u.role = 'student'${cf.sql}`).get(...cf.args);
  const matrix = db.prepare(`SELECT s.id subject_id, s.title, s.ncbe_category, s.accent,
      COALESCE(SUM(CASE WHEN r.scope IN ('course','both') THEN 1 END),0) cn, COALESCE(SUM(CASE WHEN r.scope IN ('course','both') THEN a.is_correct END),0) cc,
      COALESCE(SUM(CASE WHEN r.scope = 'bar_only' THEN 1 END),0) bn, COALESCE(SUM(CASE WHEN r.scope = 'bar_only' THEN a.is_correct END),0) bc
    FROM subjects s LEFT JOIN attempt_events a ON a.subject_id = s.id LEFT JOIN master_rule_nodes r ON r.id = a.rule_node_id LEFT JOIN users u ON u.id = a.user_id
    WHERE (u.id IS NULL OR u.role = 'student')${cf.sql} GROUP BY s.id ORDER BY s.sort_order`).all(...cf.args);
  const riskRule = db.prepare(`SELECT a.subject_id s, r.id rule_id, r.title, r.scope, COUNT(*) n, AVG(a.is_correct) acc FROM attempt_events a JOIN master_rule_nodes r ON r.id = a.rule_node_id JOIN users u ON u.id = a.user_id
    WHERE u.role = 'student' AND r.scope != 'hidden'${cf.sql} GROUP BY r.id HAVING n >= 12 ORDER BY acc ASC`).all(...cf.args);
  const people = roster(db, cf, now);
  const psy = psychometrics(db, { cohort: cf.cohort });
  const cohorts = db.prepare("SELECT cohort_year y, COUNT(*) n FROM users WHERE role = 'student' AND cohort_year IS NOT NULL GROUP BY cohort_year ORDER BY y").all().map((c) => ({ cohort_year: c.y, class_label: classLabel(c.y), students: c.n }));
  return {
    cohort: cf.cohort, cohorts,
    kpis: {
      students: k.students, attempts: k.n, accuracy: r3(ratio(k.c, k.n)), base_acc: r3(ratio(k.c - k.vc, k.n - k.vn)), var_acc: r3(ratio(k.vc, k.vn)),
      drop_off: k.vn ? r3(ratio(k.vc, k.vn) - ratio(k.c - k.vc, k.n - k.vn)) : null, avg_seconds: Math.round(k.ms / 100) / 10,
      at_risk: people.filter((p) => p.at_risk).length, item_alerts: psy.summary.alerts, inverted_items: psy.summary.inverted,
    },
    matrix: matrix.map((m) => {
      const risk = riskRule.find((x) => x.s === m.subject_id);
      return {
        subject_id: m.subject_id, title: m.title, ncbe_category: m.ncbe_category, accent: m.accent,
        course_acc: r3(ratio(m.cc, m.cn)), course_n: m.cn, bar_only_acc: r3(ratio(m.bc, m.bn)), bar_only_n: m.bn,
        gap: m.cn && m.bn ? r3(ratio(m.bc, m.bn) - ratio(m.cc, m.cn)) : null,
        highest_risk_rule: risk ? { rule_id: risk.rule_id, title: risk.title, scope: risk.scope, acc: r3(risk.acc), n: risk.n } : null,
      };
    }),
    retention: retention(db, cf),
    roster: people,
    psychometrics: psy,
    generated_at: new Date(now).toISOString(),
  };
}

// ---- SME workbench -------------------------------------------------------------------------

export function getQuestion(db, id) {
  const q = auditRows(db, [id])[0];
  if (!q) throw new HttpError(404, `No such question: ${id}`);
  return { ...q, stats: itemStats(db, { minN: 1 }).get(id) || { n: 0, p: null, rpb: null } };
}

/** Edit a question in place: stem, explanation, status, choice text/rationale, or which choice is keyed. */
export function patchQuestion(db, id, b, now = Date.now()) {
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
  if (!q) throw new HttpError(404, `No such question: ${id}`);
  const sets = [], args = [];
  let content = false;
  const str = (v, name, max) => { if (typeof v !== 'string' || !v.trim() || v.length > max) throw new HttpError(400, `${name} must be a non-empty string up to ${max} characters`); return v.trim(); };
  if (b.stem !== undefined) { const v = str(b.stem, 'stem', 8000); if (v !== q.stem) { sets.push('stem = ?'); args.push(v); content = true; } }
  if (b.explanation !== undefined) { const v = b.explanation === null ? null : String(b.explanation).slice(0, 8000); sets.push('explanation = ?'); args.push(v); }
  if (b.status !== undefined) { if (!STATUSES.includes(b.status)) throw new HttpError(400, `status must be one of ${STATUSES.join(', ')}`); sets.push('status = ?'); args.push(b.status); }
  const choices = db.prepare('SELECT * FROM question_choices WHERE question_id = ?').all(id);
  const touched = [];
  if (b.correct_index !== undefined) {
    const ci = Number(b.correct_index);
    if (!choices.some((c) => c.choice_index === ci)) throw new HttpError(400, 'correct_index is not a choice of this question');
    if (ci !== q.correct_index) { sets.push('correct_index = ?'); args.push(ci); content = true; touched.push({ type: 'key', ci }); }
  }
  for (const c of Array.isArray(b.choices) ? b.choices : []) {
    const cur = choices.find((x) => x.choice_index === Number(c.index));
    if (!cur) throw new HttpError(400, `No choice with index ${c.index}`);
    if (c.text !== undefined && str(c.text, 'choice text', 4000) !== cur.choice_text) touched.push({ type: 'text', index: cur.choice_index, text: c.text.trim() });
    if (c.rationale !== undefined) touched.push({ type: 'rationale', index: cur.choice_index, rationale: c.rationale === null ? null : String(c.rationale).slice(0, 4000) });
  }
  if (!sets.length && !touched.length) throw new HttpError(400, 'Nothing to change');
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const t of touched) {
      if (t.type === 'text') { db.prepare('UPDATE question_choices SET choice_text = ? WHERE question_id = ? AND choice_index = ?').run(t.text, id, t.index); content = true; }
      if (t.type === 'rationale') db.prepare('UPDATE question_choices SET rationale = ? WHERE question_id = ? AND choice_index = ?').run(t.rationale, id, t.index);
    }
    const newKey = touched.find((t) => t.type === 'key')?.ci;
    if (newKey !== undefined) db.prepare('UPDATE question_choices SET is_correct = (choice_index = ?) WHERE question_id = ?').run(newKey, id);
    if (content) { sets.push('revision = revision + 1', 'updated_at = ?'); args.push(new Date(now).toISOString()); }
    if (sets.length) db.prepare(`UPDATE questions SET ${sets.join(', ')} WHERE id = ?`).run(...args, id);
    db.exec('COMMIT');
  } catch (e) { try { db.exec('ROLLBACK'); } catch { /* ignore */ } throw e; }
  return { ok: true, content_changed: content, question: getQuestion(db, id) };
}
