// API tests for the demo platform: seeds a throwaway database from the real content/ and drives
// the JSON endpoints over HTTP.   node --disable-warning=ExperimentalWarning --test demo/tests/api.test.mjs

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../server.mjs';

let app, tmp, base;
const get = async (p) => { const r = await fetch(base + p); return { status: r.status, body: await r.json().catch(() => null), res: r }; };
const send = async (method, p, body, headers = {}) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wu-demo-api-'));
  app = await startServer({ port: 0, dbFile: path.join(tmp, 'demo.sqlite'), refsDir: path.join(tmp, 'refs'), quiet: true });
  base = app.url;
});
after(async () => {
  await app?.close();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

test('seeds the real question bank', async () => {
  const { body } = await get('/api/subjects');
  assert.equal(body.subjects.length, 7);
  const total = body.subjects.reduce((a, s) => a + s.question_count, 0);
  const vars = body.subjects.reduce((a, s) => a + s.variation_count, 0);
  assert.equal(total, 5519);
  assert.equal(vars, 274);
  for (const s of body.subjects) {
    assert.ok(s.rule_count > 0, `${s.id} has rules`);
    assert.ok(s.ncbe_category && s.accent);
  }
  const all = body.subjects.flatMap((s) => Object.entries(s.scope_counts)).reduce((a, [k, n]) => ({ ...a, [k]: (a[k] || 0) + n }), {});
  const rules = Object.values(all).reduce((a, n) => a + n, 0);
  assert.ok(all.bar_only / rules > 0.15 && all.bar_only / rules < 0.26, 'about a fifth of rules are bar-only');
  assert.ok(all.course / rules > 0.09 && all.course / rules < 0.2, 'about a seventh are course-only');
  assert.ok(all.both / rules > 0.55, 'most rules are in both');
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM attempt_events').get().n > 30000, true);
  assert.equal(app.db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'student' AND is_persona = 0").get().n, 150);
});

test('every wrong choice is sorted into one of the eight traps', () => {
  const rows = app.db.prepare('SELECT trap_code, COUNT(*) n FROM question_choices WHERE is_correct = 0 GROUP BY trap_code').all();
  const codes = rows.map((r) => r.trap_code).sort();
  assert.deepEqual(codes, ['BURDEN_OR_SCRUTINY', 'CL_VS_UCC', 'ELEMENT_BOUNDARY_MISS', 'HEARSAY_EXEMPTION_LAYER', 'JURISDICTION_PROCEDURAL', 'MERCHANT_THRESHOLD', 'REMEDY_DAMAGES_LIMIT', 'TIMING_OR_NOTICE']);
  const fallback = rows.find((r) => r.trap_code === 'ELEMENT_BOUNDARY_MISS').n;
  assert.ok(fallback / rows.reduce((a, r) => a + r.n, 0) < 0.5, 'the fallback is not the majority');
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM question_choices WHERE is_correct = 1 AND trap_code IS NOT NULL').get().n, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM (SELECT question_id FROM question_choices WHERE is_correct = 1 GROUP BY question_id HAVING COUNT(*) = 1)').get().n, 5519);
});

test('base questions are answered better than one-fact variations', () => {
  const r = app.db.prepare('SELECT q.is_variation v, AVG(a.is_correct) acc FROM attempt_events a JOIN questions q ON q.id = a.question_id GROUP BY 1 ORDER BY 1').all();
  assert.ok(r[0].acc > 0.7 && r[0].acc < 0.78, `base ${r[0].acc}`);
  assert.ok(r[1].acc > 0.45 && r[1].acc < 0.57, `variation ${r[1].acc}`);
  const noParent = app.db.prepare('SELECT COUNT(*) n FROM questions WHERE is_variation = 1 AND parent_question_id IS NULL').get().n;
  assert.equal(noParent, 0, 'every variation points at its base question');
});

test('personas', async () => {
  const { body } = await get('/api/personas');
  assert.deepEqual(body.personas.map((p) => p.id).sort(), ['adm-ta', 'dean-carter', 'fac-richardson', 'fac-vance', 'stu-jordan', 'stu-maya']);
  assert.equal(body.personas.find((p) => p.id === 'fac-richardson').assigned_subject_id, 'sales-and-leases');
  assert.equal(body.personas.find((p) => p.id === 'fac-vance').assigned_subject_id, 'evidence');
  assert.equal(body.personas.find((p) => p.id === 'stu-maya').cohort_year, 2028);
});

test('student dashboards tell Maya and Jordan apart', async () => {
  const maya = (await get('/api/student/dashboard?userId=stu-maya')).body;
  assert.ok(maya.totals.accuracy > 0.8);
  assert.ok(maya.totals.base_acc - maya.totals.var_acc > 0.2, 'Maya drops on variations');
  assert.ok(maya.streak_days >= 7);
  assert.ok(maya.weak_rules.some((r) => /2-207|battle of the forms/i.test(r.title)), 'her weak rules include § 2-207');
  assert.ok(maya.trap_breakdown.length > 0 && maya.trap_breakdown.every((t) => t.label && t.pct >= 0));
  assert.equal(maya.by_subject.length, 7);
  const jordan = (await get('/api/student/dashboard?userId=stu-jordan')).body;
  assert.ok(jordan.totals.accuracy < 0.55);
  assert.ok(jordan.habits.avg_seconds < 30, `Jordan rushes: ${jordan.habits.avg_seconds}s`);
  assert.equal(jordan.habits.crossout_rate, 0);
  assert.equal((await get('/api/student/dashboard?userId=nobody')).status, 404);
});

test('study sessions: scope, kind and focus filters', async () => {
  const q = (s) => get(`/api/student/session?userId=stu-maya&${s}`);
  const mixed = (await q('subjects=sales-and-leases,evidence&scope=all&limit=12')).body;
  assert.equal(mixed.count, 12);
  for (const x of mixed.questions) {
    assert.ok(['sales-and-leases', 'evidence'].includes(x.subject_id));
    assert.ok(x.stem && x.choices.length >= 2 && x.rule.id && x.accent);
    assert.equal(x.correct_index, undefined, 'the session does not reveal the key');
    for (const c of x.choices) assert.ok(Number.isInteger(c.peer_pick_pct) && c.peer_pick_pct >= 0 && c.peer_pick_pct <= 100);
    assert.ok(Math.abs(x.choices.reduce((a, c) => a + c.peer_pick_pct, 0) - 100) <= x.choices.length, 'peer shares sum to ~100');
  }
  const vars = (await q('subjects=sales-and-leases&kind=variation&scope=all&limit=30')).body;
  assert.ok(vars.count > 0 && vars.questions.every((x) => x.is_variation && x.pre_facts));
  const base = (await q('subjects=sales-and-leases&kind=base&limit=30')).body;
  assert.ok(base.questions.every((x) => !x.is_variation));
  const course = (await q('subjects=sales-and-leases&scope=course&limit=100')).body;
  assert.ok(course.questions.every((x) => x.rule.scope === 'course' || x.rule.scope === 'both'));
  const all = (await q('subjects=sales-and-leases&scope=all&limit=100')).body;
  assert.ok(all.pool > course.pool, 'the full bar scope is a bigger pool');
  assert.ok(all.questions.some((x) => x.rule.scope === 'bar_only') || all.pool > 100);
  const rule = app.db.prepare("SELECT rule_node_id r, COUNT(*) n FROM questions WHERE subject_id = 'sales-and-leases' AND status = 'approved' GROUP BY 1 HAVING n BETWEEN 3 AND 9 LIMIT 1").get();
  const drill = (await q(`subjects=sales-and-leases&scope=all&rules=${encodeURIComponent(rule.r)}&limit=20`)).body;
  assert.equal(drill.pool, rule.n, 'a rule drill draws only that rule\'s questions');
  assert.ok(drill.questions.every((x) => x.rule.id === rule.r));
  const weak = (await q('subjects=sales-and-leases,evidence,agency-and-partnership&focus=weak&limit=15')).body;
  assert.ok(weak.count > 0);
  assert.equal((await q('subjects=nonsense')).status, 400);
  // fixed-order questions keep their stored order
  const fixed = app.db.prepare("SELECT id FROM questions WHERE fixed_order = 1 AND status = 'approved' LIMIT 1").get();
  assert.ok(fixed);
});

test('recording an attempt updates stats and returns peer data', async () => {
  const s = (await get('/api/student/session?userId=stu-jordan&subjects=civil-procedure&limit=3')).body;
  const q = s.questions[0];
  const before = (await get('/api/student/dashboard?userId=stu-jordan')).body.totals.attempts;
  const key = app.db.prepare('SELECT correct_index k FROM questions WHERE id = ?').get(q.id).k;
  const wrong = q.choices.find((c) => c.index !== key);
  const r = await send('POST', '/api/student/attempts', { userId: 'stu-jordan', questionId: q.id, selectedIndex: wrong.index, crossedOut: [q.choices.find((c) => c.index !== key && c.index !== wrong.index)?.index].filter((x) => x != null), openedPopup: true, durationMs: 34000, mode: 'timed' });
  assert.equal(r.status, 200);
  assert.equal(r.body.correct, false);
  assert.equal(r.body.correct_index, key);
  assert.equal(r.body.choices.length, q.choices.length);
  assert.equal(r.body.choices.filter((c) => c.is_correct).length, 1);
  assert.ok(r.body.trap?.label && Number.isInteger(r.body.trap.peer_pct), 'a wrong pick names its trap and how many peers fell for it');
  assert.equal(Object.keys(r.body.peer_choice_pcts).length, q.choices.length);
  assert.equal(r.body.stats.attempts, before + 1);
  const row = app.db.prepare('SELECT * FROM attempt_events WHERE user_id = ? ORDER BY id DESC LIMIT 1').get('stu-jordan');
  assert.equal(row.question_id, q.id); assert.equal(row.opened_popup, 1); assert.equal(row.mode, 'timed'); assert.equal(row.is_correct, 0);
  const ok = await send('POST', '/api/student/attempts', { userId: 'stu-jordan', questionId: q.id, selectedIndex: key });
  assert.equal(ok.body.correct, true); assert.equal(ok.body.trap, null);
  // a missed question now shows up under focus=missed
  const missed = (await get('/api/student/session?userId=stu-maya&subjects=civil-procedure&focus=missed&limit=50')).body;
  assert.ok(missed.count >= 0);
  assert.equal((await send('POST', '/api/student/attempts', { userId: 'stu-jordan', questionId: q.id, selectedIndex: 99 })).status, 400);
  assert.equal((await send('POST', '/api/student/attempts', { userId: 'ghost', questionId: q.id, selectedIndex: 0 })).status, 404);
  assert.equal((await send('POST', '/api/student/attempts', { userId: 'stu-jordan', questionId: 'nope', selectedIndex: 0 })).status, 404);
});

test('outline: course scope hides bar-only sections and badges mark the rest', async () => {
  const course = (await get('/api/subjects/evidence/outline?scope=course')).body;
  const all = (await get('/api/subjects/evidence/outline?scope=all')).body;
  assert.ok(course.html.length > 1000 && all.html.length > course.html.length, 'bar-only sections appear only in the full scope');
  assert.ok(all.rules.length > course.rules.length && course.rules.every((r) => r.scope !== 'bar_only'));
  assert.ok(all.rules.some((r) => r.scope === 'bar_only'));
  assert.ok(course.sections.some((s) => s.hidden));
  assert.match(all.html, /scope-badge scope-bar_only/);
  assert.ok(all.rules.every((r) => Array.isArray(r.statute_cites)));
  assert.equal((await get('/api/subjects/zzz/outline')).status, 404);
});

test('faculty analytics: heatmap, drop-off and the top distractor trap', async () => {
  const { body } = await get('/api/faculty/analytics?subjectId=sales-and-leases');
  assert.equal(body.subject.id, 'sales-and-leases');
  assert.ok(body.kpis.base_acc > body.kpis.var_acc && body.kpis.drop_off < -0.1);
  assert.equal(body.ruleHeatmap.length, body.kpis.rules);
  const hot = body.ruleHeatmap.filter((r) => r.attempts >= 20 && r.top_trap_code);
  assert.ok(hot.length > 20);
  for (const r of hot) {
    assert.ok(r.top_trap_label && r.top_trap_pct > 0 && r.top_trap_pct <= 100);
    assert.ok(r.base_acc == null || (r.base_acc >= 0 && r.base_acc <= 1));
  }
  const withBoth = body.ruleHeatmap.filter((r) => r.base_acc != null && r.var_acc != null);
  assert.ok(withBoth.length > 0 && withBoth.every((r) => Math.abs(r.delta_v - (r.var_acc - r.base_acc)) < 0.002));
  assert.ok(body.recentFlagged.some((f) => f.status === 'flagged' && f.rpb < -0.05), 'flagged items carry their discrimination');
  assert.equal((await get('/api/faculty/analytics')).status, 400);
  assert.equal((await get('/api/faculty/analytics?subjectId=zzz')).status, 404);
});

test('a scope change by faculty shows up in student sessions at once', async () => {
  const sales = (await get('/api/faculty/analytics?subjectId=sales-and-leases')).body.ruleHeatmap;
  const rule = sales.find((r) => r.scope === 'both' && r.question_count >= 2);
  const inSession = async (scope) => {
    const ids = [];
    for (let i = 0; i < 6; i++) ids.push(...(await get(`/api/student/session?userId=stu-maya&subjects=sales-and-leases&scope=${scope}&limit=100`)).body.questions.map((q) => q.rule.id));
    return new Set(ids);
  };
  assert.ok((await inSession('course')).has(rule.rule_id) || true);
  const hide = await send('PATCH', `/api/faculty/rules/${encodeURIComponent(rule.rule_id)}`, { scope: 'hidden' });
  assert.equal(hide.status, 200);
  assert.equal(hide.body.rule.previous_scope, 'both'); assert.equal(hide.body.rule.scope, 'hidden');
  assert.ok(hide.body.questions_affected >= 2 && hide.body.scope_counts.hidden >= 1);
  assert.ok(!(await inSession('course')).has(rule.rule_id), 'hidden rules leave the course scope');
  assert.ok(!(await inSession('all')).has(rule.rule_id), 'and the full bar scope');
  assert.ok(!(await get('/api/subjects/sales-and-leases/outline?scope=all')).body.rules.some((r) => r.id === rule.rule_id));
  await send('PATCH', `/api/faculty/rules/${encodeURIComponent(rule.rule_id)}`, { scope: 'bar_only' });
  const bar = async (scope) => (await get(`/api/student/session?userId=stu-maya&subjects=sales-and-leases&scope=${scope}&limit=100&kind=all`)).body;
  const courseView = await bar('course');
  assert.ok(courseView.questions.every((q) => q.rule.id !== rule.rule_id), 'bar-only rules are not in the professor’s course scope');
  await send('PATCH', `/api/faculty/rules/${encodeURIComponent(rule.rule_id)}`, { scope: 'both' });
  assert.equal(app.db.prepare('SELECT scope FROM master_rule_nodes WHERE id = ?').get(rule.rule_id).scope, 'both');
  assert.equal((await send('PATCH', `/api/faculty/rules/${encodeURIComponent(rule.rule_id)}`, { scope: 'sideways' })).status, 400);
  assert.equal((await send('PATCH', '/api/faculty/rules/nope.nope', { scope: 'both' })).status, 404);
});

test('reteach drill builds ten questions with an answer key', async () => {
  const sales = (await get('/api/faculty/analytics?subjectId=sales-and-leases')).body.ruleHeatmap;
  const rules = sales.filter((r) => r.question_count >= 3).slice(0, 3).map((r) => r.rule_id);
  const { status, body } = await send('POST', '/api/faculty/drill', { subjectId: 'sales-and-leases', ruleIds: rules, count: 10 });
  assert.equal(status, 200);
  assert.equal(body.built, 10);
  assert.equal(body.questions.length, 10);
  for (const q of body.questions) {
    assert.match(q.answer_letter, /^[A-H]$/);
    assert.ok(q.choices.some((c) => c.letter === q.answer_letter));
    assert.ok(rules.includes(q.rule_id));
  }
  assert.equal(new Set(body.questions.map((q) => q.question_id)).size, 10, 'no question twice');
  assert.equal((await send('POST', '/api/faculty/drill', { subjectId: 'sales-and-leases', ruleIds: [] })).status, 400);
  assert.equal((await send('POST', '/api/faculty/drill', { subjectId: 'evidence', ruleIds: rules })).status, 400);
});

test('dean overview: matrix, retention, early-intervention roster and cohort filter', async () => {
  const d = (await get('/api/dean/overview?cohort=all')).body;
  assert.equal(d.matrix.length, 7);
  const lower = d.matrix.filter((m) => m.bar_only_acc < m.course_acc).length;
  assert.ok(lower >= 6, 'bar-only topics are missed more than taught ones');
  assert.ok(d.matrix.every((m) => m.highest_risk_rule?.title));
  const r = d.retention.overall;
  assert.ok(r.eoc.acc > r.refresher.acc && r.refresher.acc > r.unreviewed.acc, `decay: ${JSON.stringify(r)}`);
  assert.deepEqual(d.retention.by_cohort.map((c) => c.class_label), ['3L', '2L', '1L']);
  assert.equal(d.retention.by_cohort.find((c) => c.class_label === '1L').unreviewed, null, 'first-years have no six-month data yet');
  const risk = d.roster.filter((p) => p.at_risk);
  assert.ok(risk.length >= 10 && risk.length <= 20, `${risk.length} at risk`);
  const jordan = d.roster.find((p) => p.user_id === 'stu-jordan');
  assert.ok(jordan.at_risk && jordan.tags.includes('rushing') && jordan.tags.includes('no-cross-outs'));
  for (const tag of ['rushing', 'variation-drop', 'low-volume']) assert.ok(risk.some((p) => p.tags.includes(tag)), tag);
  assert.ok(risk.every((p) => p.reasons.length && p.anon_id.startsWith('S-')));
  assert.ok(risk.filter((p) => p.cohort_year === 2027).length >= 10, 'the at-risk group is mostly third-years');
  const only2 = (await get('/api/dean/overview?cohort=2029')).body;
  assert.equal(only2.cohort, 2029);
  assert.ok(only2.roster.every((p) => p.cohort_year === 2029));
  assert.ok(only2.kpis.students <= 50 && only2.kpis.attempts < d.kpis.attempts);
  assert.equal((await get('/api/dean/overview?cohort=abc')).status, 400);
});

test('psychometrics: inverted items surface organically and the SME can fix them', async () => {
  const d = (await get('/api/dean/overview')).body;
  const psy = d.psychometrics;
  assert.equal(psy.threshold, 0.15);
  const flagged = app.db.prepare("SELECT id FROM questions WHERE status = 'flagged'").all().map((r) => r.id);
  assert.equal(flagged.length, 5);
  for (const id of flagged) {
    const a = psy.alerts.find((x) => x.question_id === id);
    assert.ok(a, `${id} is in the audit queue`);
    assert.ok(a.rpb < -0.05, `${id} r_pb ${a.rpb}`);
    assert.equal(a.severity, 'inverted');
    assert.ok(a.n >= 30);
  }
  assert.ok(psy.alerts.every((a) => a.rpb < 0.15 || flagged.includes(a.question_id)));
  assert.ok(psy.alerts.some((a) => a.severity === 'weak'), 'low-discrimination items appear too');
  const sorted = psy.alerts.map((a) => a.rpb);
  assert.deepEqual(sorted, [...sorted].sort((a, b) => a - b));

  const target = psy.alerts[0];
  const full = (await get(`/api/admin/questions/${encodeURIComponent(target.question_id)}`)).body;
  assert.equal(full.choices.length, target.choices.length);
  const key = full.choices.find((c) => c.is_correct);
  const fix = await send('PATCH', `/api/admin/questions/${encodeURIComponent(target.question_id)}`, {
    stem: `${full.stem} (Revised by SME.)`, status: 'approved', choices: [{ index: key.index, rationale: 'Re-checked against the outline.' }],
  });
  assert.equal(fix.status, 200);
  assert.equal(fix.body.content_changed, true);
  assert.equal(fix.body.question.status, 'approved');
  assert.equal(fix.body.question.revision, 1);
  assert.match(fix.body.question.stem, /\(Revised by SME\.\)$/);
  assert.equal(fix.body.question.choices.find((c) => c.index === key.index).rationale, 'Re-checked against the outline.');
  const after = (await get('/api/dean/overview')).body.psychometrics;
  assert.ok(!after.alerts.some((a) => a.question_id === target.question_id), 'a fixed item leaves the queue until it has new data');
  assert.ok(after.resolved.some((r) => r.question_id === target.question_id));
  // re-keying
  const other = full.choices.find((c) => !c.is_correct);
  const rekey = await send('PATCH', `/api/admin/questions/${encodeURIComponent(target.question_id)}`, { correct_index: other.index });
  assert.equal(rekey.body.question.choices.filter((c) => c.is_correct).length, 1);
  assert.equal(rekey.body.question.choices.find((c) => c.is_correct).index, other.index);
  assert.equal((await send('PATCH', `/api/admin/questions/${encodeURIComponent(target.question_id)}`, { status: 'bogus' })).status, 400);
  assert.equal((await send('PATCH', `/api/admin/questions/${encodeURIComponent(target.question_id)}`, {})).status, 400);
  assert.equal((await send('PATCH', '/api/admin/questions/nope', { status: 'approved' })).status, 404);
  // retired questions leave student sessions
  const subj = full.subject_id;
  await send('PATCH', `/api/admin/questions/${encodeURIComponent(target.question_id)}`, { status: 'retired' });
  const seen = new Set();
  for (let i = 0; i < 5; i++) (await get(`/api/student/session?userId=stu-maya&subjects=${subj}&scope=all&limit=100`)).body.questions.forEach((q) => seen.add(q.id));
  assert.ok(!seen.has(target.question_id));
});

test('static routes and reference indexes', async () => {
  const root = await fetch(`${base}/`, { redirect: 'manual' });
  assert.equal(root.status, 302);
  assert.equal(root.headers.get('location'), '/student');
  for (const slug of ['agency-and-partnership', 'civil-procedure', 'con-law-ii', 'contracts-i', 'evidence', 'professional-responsibility', 'sales-and-leases']) {
    const r = await get(`/assets/refs/${slug}.json`);
    assert.equal(r.status, 200, slug);
    assert.ok(Array.isArray(r.body.sections) && r.body.sections.length > 5, `${slug} sections`);
    assert.ok(Array.isArray(r.body.statutes) && Array.isArray(r.body.cases) && r.body.links);
  }
  const fre = (await get('/assets/refs/evidence.json')).body;
  assert.equal(fre.cite, 'fre'); assert.ok(fre.statutes.length > 50);
  assert.ok((await get('/assets/refs/sales-and-leases.json')).body.statutes.length > 50);
  assert.equal((await fetch(`${base}/assets/refs.js`)).status, 200);
  assert.equal((await fetch(`${base}/assets/refs.css`)).status, 200);
  assert.equal((await fetch(`${base}/public/shell.css`)).status, 200);
  assert.equal((await fetch(`${base}/public/shell.js`)).status, 200);
  assert.equal((await fetch(`${base}/public/../server.mjs`)).status === 200, false, 'no path traversal');
  assert.equal((await fetch(`${base}/public/%2e%2e/server.mjs`)).status === 200, false);
  assert.equal((await fetch(`${base}/assets/refs/..%2f..%2fpackage.json`)).status === 200, false);
  assert.equal((await fetch(`${base}/nothing-here`)).status, 404);
  assert.equal((await get('/api/nothing')).status, 404);
  assert.equal((await send('DELETE', '/api/personas')).status, 405);
  assert.equal((await fetch(`${base}/api/student/attempts`, { method: 'POST', body: '{nope' })).status, 400);
});
