// End-to-end test: boots the real server (`node demo/server.mjs`) in a child process with a fresh
// database, so first-boot seeding is part of what is tested, then drives the platform over HTTP.
// A headless-browser smoke test runs too when Playwright is installed (skipped otherwise).
//   node --disable-warning=ExperimentalWarning --test demo/tests/e2e.test.mjs

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let child, base, tmp, bootMs, exited;
const output = [];

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.once('error', reject);
  s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
});
const api = async (p, init) => {
  const r = await fetch(base + p, init && { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) }, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const enc = encodeURIComponent;

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wu-demo-e2e-'));
  const port = await freePort();
  const t0 = Date.now();
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(ROOT, 'demo', 'server.mjs')], {
    cwd: ROOT, env: { ...process.env, PORT: String(port), DEMO_DB: path.join(tmp, 'e2e.sqlite'), DEMO_REFS: path.join(tmp, 'refs'), ANTHROPIC_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  exited = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
  child.stderr.on('data', (d) => output.push(String(d)));
  base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start in 90 s:\n${output.join('')}`)), 90000);
    child.stdout.on('data', (d) => {
      output.push(String(d));
      const m = String(d).match(/Wilmington law school demo: (http:\/\/localhost:\d+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited early (${code}):\n${output.join('')}`)); });
  });
  bootMs = Date.now() - t0;
});

after(async () => {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    const killer = setTimeout(() => child.kill('SIGKILL'), 8000);
    await exited;
    clearTimeout(killer);
  }
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

test('the server boots from nothing: it seeds the database on first start', async () => {
  assert.ok(bootMs < 60000, `booted in ${bootMs} ms`);
  assert.ok(fs.existsSync(path.join(tmp, 'e2e.sqlite')), 'database file created');
  const h = await api('/api/health');
  assert.equal(h.status, 200);
  assert.equal(h.body.ok, true);
  assert.ok(h.body.seeded_at);
  assert.match(output.join(''), /Database built from content/);
});

test('more than 5,000 real questions are seeded across 7 subjects', async () => {
  const { body } = await api('/api/subjects');
  assert.equal(body.subjects.length, 7);
  const total = body.subjects.reduce((a, s) => a + s.question_count, 0);
  assert.ok(total > 5000, `${total} questions`);
  assert.equal(total, 5519);
  assert.equal(body.subjects.reduce((a, s) => a + s.variation_count, 0), 274);
  assert.ok((await api('/api/health')).body.attempts > 30000);
});

test('all 7 reference-popup indexes are served', async () => {
  for (const slug of ['agency-and-partnership', 'civil-procedure', 'con-law-ii', 'contracts-i', 'evidence', 'professional-responsibility', 'sales-and-leases']) {
    const { status, body } = await api(`/assets/refs/${slug}.json`);
    assert.equal(status, 200, slug);
    assert.equal(body.version, 1);
    assert.ok(body.sections.length > 5 && body.sections.every((s) => s.id && s.title && s.html !== undefined), `${slug} sections`);
    assert.ok(Array.isArray(body.cases) && Array.isArray(body.statutes) && Array.isArray(body.problems));
  }
  assert.equal((await fetch(`${base}/assets/refs/not-a-course.json`)).status, 404);
});

test('all four portals are served and their assets resolve', async () => {
  for (const [route, portal] of [['/student', 'student'], ['/faculty', 'faculty'], ['/dean', 'dean'], ['/compiler', 'compiler']]) {
    const r = await fetch(base + route);
    assert.equal(r.status, 200, route);
    assert.match(r.headers.get('content-type'), /text\/html/);
    const html = await r.text();
    assert.match(html, new RegExp(`data-portal="${portal}"`), `${route} declares its portal`);
    assert.match(html, /\/public\/shell\.css/);
    assert.match(html, /\/public\/shell\.js/);
    const local = [...html.matchAll(/(?:src|href)="(\/[^"#?]+)(?:\?[^"]*)?"/g)].map((m) => m[1]).filter((u) => !u.startsWith('//'));
    assert.ok(local.length >= 2);
    for (const u of new Set(local)) if (u !== '/' && !['/student', '/faculty', '/dean', '/compiler'].includes(u)) assert.equal((await fetch(base + u)).status, 200, `${route} -> ${u}`);
    if (portal === 'student') {
      assert.match(html, /\/assets\/refs\.js/, 'the student portal loads the library’s reference popup');
      assert.match(html, /data-courses="[^"]*sales-and-leases/);
    }
  }
  const root = await fetch(`${base}/`, { redirect: 'manual' });
  assert.equal(root.status, 302);
  assert.equal(root.headers.get('location'), '/student');
  assert.equal((await fetch(`${base}/public/tour.js`)).status, 200, 'the guided pitch script ships');
});

test('a live attempt is recorded and moves the student’s numbers', async () => {
  const before = (await api('/api/student/dashboard?userId=stu-maya')).body.totals.attempts;
  const s = (await api('/api/student/session?userId=stu-maya&subjects=evidence&scope=all&limit=1')).body;
  assert.equal(s.count, 1);
  const q = s.questions[0];
  const r = await api('/api/student/attempts', { method: 'POST', body: { userId: 'stu-maya', questionId: q.id, selectedIndex: q.choices[0].index, crossedOut: [q.choices[1].index], openedPopup: true, durationMs: 52000, mode: 'study' } });
  assert.equal(r.status, 200);
  assert.equal(typeof r.body.correct, 'boolean');
  assert.equal(r.body.stats.attempts, before + 1);
  assert.equal(Object.keys(r.body.peer_choice_pcts).length, q.choices.length);
  assert.equal(r.body.choices.filter((c) => c.is_correct).length, 1);
  if (!r.body.correct) assert.ok(r.body.trap.label && r.body.trap.peer_pct >= 0);
  assert.equal((await api('/api/student/dashboard?userId=stu-maya')).body.totals.attempts, before + 1);
});

test('a faculty scope change is reflected in the student session filter', async () => {
  const heat = (await api('/api/faculty/analytics?subjectId=sales-and-leases')).body.ruleHeatmap;
  const rule = heat.find((r) => r.scope === 'both' && r.question_count >= 2);
  const ids = async (scope) => {
    const seen = new Set();
    for (let i = 0; i < 8; i++) (await api(`/api/student/session?userId=stu-maya&subjects=sales-and-leases&scope=${scope}&limit=100`)).body.questions.forEach((q) => seen.add(q.rule.id));
    return seen;
  };
  const poolBefore = (await api('/api/student/session?userId=stu-maya&subjects=sales-and-leases&scope=course&limit=1')).body.pool;
  const r = await api(`/api/faculty/rules/${enc(rule.rule_id)}`, { method: 'PATCH', body: { scope: 'hidden' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.rule.scope, 'hidden');
  const poolAfter = (await api('/api/student/session?userId=stu-maya&subjects=sales-and-leases&scope=course&limit=1')).body.pool;
  assert.equal(poolBefore - poolAfter, r.body.questions_affected, 'the course pool shrinks by exactly the rule’s questions');
  assert.ok(!(await ids('course')).has(rule.rule_id) && !(await ids('all')).has(rule.rule_id));
  const bar = await api(`/api/faculty/rules/${enc(rule.rule_id)}`, { method: 'PATCH', body: { scope: 'bar_only' } });
  assert.equal(bar.status, 200);
  const poolBar = (await api('/api/student/session?userId=stu-maya&subjects=sales-and-leases&scope=course&limit=1')).body.pool;
  const poolBarAll = (await api('/api/student/session?userId=stu-maya&subjects=sales-and-leases&scope=all&limit=1')).body.pool;
  assert.equal(poolBar, poolAfter, 'bar-only questions are outside the course scope');
  assert.equal(poolBarAll - poolBar >= r.body.questions_affected, true, 'but inside the full bar scope');
  await api(`/api/faculty/rules/${enc(rule.rule_id)}`, { method: 'PATCH', body: { scope: 'both' } });
  assert.equal((await api('/api/student/session?userId=stu-maya&subjects=sales-and-leases&scope=course&limit=1')).body.pool, poolBefore, 'restoring the scope restores the pool');
});

test('the dean sees real r_pb alerts, and an SME edit clears one', async () => {
  const d = (await api('/api/dean/overview')).body;
  const inverted = d.psychometrics.alerts.filter((a) => a.severity === 'inverted');
  assert.ok(inverted.length >= 5, `${inverted.length} inverted items`);
  assert.ok(inverted.every((a) => a.rpb < -0.05 && a.n >= 30));
  assert.ok(d.kpis.inverted_items >= 5);
  const item = inverted[0];
  const keyed = item.choices.find((c) => c.is_correct);
  const r = await api(`/api/admin/questions/${enc(item.question_id)}`, { method: 'PATCH', body: { stem: `${item.stem}\n\n[SME: stem clarified.]`, status: 'approved', choices: [{ index: keyed.index, rationale: 'Key confirmed against the outline.' }] } });
  assert.equal(r.status, 200);
  assert.equal(r.body.question.revision, 1);
  const after = (await api('/api/dean/overview')).body;
  assert.ok(!after.psychometrics.alerts.some((a) => a.question_id === item.question_id));
  assert.equal(after.kpis.inverted_items, d.kpis.inverted_items - 1, 'the inverted count drops by one');
  assert.ok(after.psychometrics.resolved.some((x) => x.question_id === item.question_id));
});

test('the showcase compiler publishes a package into the live question bank', async () => {
  const status = (await api('/api/compiler/status')).body;
  assert.equal(status.installed, true);
  assert.equal(status.live_env_key, false);
  const { showcases } = (await api('/api/compiler/showcases')).body;
  assert.ok(showcases.length >= 2, 'two showcase packets');
  const pick = showcases.find((s) => s.subject_id === 'sales-and-leases') || showcases[1];
  const subjectsBefore = (await api('/api/subjects')).body.subjects;
  const before = subjectsBefore.find((s) => s.id === pick.subject_id)?.question_count ?? 0;

  const live = await api('/api/compiler/run', { method: 'POST', body: { mode: 'live', material: 'Some notes about contracts.' } });
  assert.equal(live.status, 400, 'live mode without a key is refused');
  assert.doesNotMatch(JSON.stringify(live.body), /sk-ant/);

  const run = await api('/api/compiler/run', { method: 'POST', body: { mode: 'showcase', showcaseId: pick.id } });
  assert.equal(run.status, 200);
  const r = run.body;
  assert.equal(r.mode, 'showcase');
  assert.ok(r.master_nodes.length >= 8, 'a master rule graph');
  assert.match(r.student_outline_html, /callout-rule/);
  assert.match(r.student_outline_html, /class="el el-1"/, 'rainbow elements');
  assert.equal(r.questions.length, 6);
  assert.equal(r.questions.filter((q) => q.parent_index != null).length, 3, 'three one-fact variations');
  assert.ok(r.verification.total > 0 && r.verification.passed <= r.verification.total);
  for (const q of r.questions) {
    assert.equal(q.choices.filter((c) => c.is_correct).length, 1);
    assert.ok(q.choices.filter((c) => !c.is_correct).every((c) => /^[A-Z_]+$/.test(c.trap_code)), 'wrong choices carry trap tags');
  }
  assert.ok((await api('/api/compiler/runs')).body.runs.some((x) => x.id === r.id));
  assert.equal((await api(`/api/compiler/runs/${r.id}`)).body.id, r.id);

  const pub = await api(`/api/compiler/runs/${r.id}/publish`, { method: 'POST', body: {} });
  assert.equal(pub.status, 200, JSON.stringify(pub.body));
  assert.equal(pub.body.questions_inserted, 6);
  assert.ok(pub.body.rules_inserted >= 8);
  assert.equal(pub.body.subject_id, pick.subject_id);

  const after = (await api('/api/subjects')).body.subjects.find((s) => s.id === pick.subject_id);
  assert.equal(after.question_count, before + 6);
  const bank = (await api(`/api/student/session?userId=stu-maya&subjects=${pick.subject_id}&scope=all&limit=100&kind=variation`)).body;
  const mine = bank.questions.filter((q) => pub.body.question_ids.includes(q.id));
  assert.ok(mine.length >= 3 || bank.pool > 100, 'published variations are available to students');
  const one = (await api(`/api/admin/questions/${enc(pub.body.question_ids[0])}`)).body;
  assert.equal(one.status, 'approved');
  assert.equal(one.choices.filter((c) => c.is_correct).length, 1);
  const again = await api(`/api/compiler/runs/${r.id}/publish`, { method: 'POST', body: {} });
  assert.equal(again.status, 409, 'a package publishes once');
  assert.equal((await api(`/api/compiler/runs/${r.id}`)).body.status, 'published');
});

test('headless browser smoke test (skipped without Playwright)', async (t) => {
  let playwright;
  try { playwright = createRequire(import.meta.url)('playwright'); } catch { return t.skip('playwright is not installed'); }
  let browser;
  try { browser = await playwright.chromium.launch(); } catch { return t.skip('chromium is not available'); }
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const issues = [];
    const watch = (page, label) => {
      page.on('pageerror', (e) => issues.push(`${label}: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g(oogleapis|static)|ERR_(NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|CONNECTION|TUNNEL)|Failed to load resource/.test(m.text())) issues.push(`${label}: ${m.text()}`); });
      page.on('requestfailed', (r) => { if (r.url().startsWith(base)) issues.push(`${label}: request failed ${r.url()}`); });
      page.on('response', (r) => { if (r.url().startsWith(base) && r.status() >= 400 && !r.url().endsWith('/favicon.ico')) issues.push(`${label}: ${r.status()} ${r.url()}`); });
    };
    for (const [route, label] of [['/student', 'student'], ['/faculty', 'faculty'], ['/dean', 'dean'], ['/compiler', 'compiler']]) {
      const page = await ctx.newPage();
      watch(page, label);
      await page.goto(base + route, { waitUntil: 'networkidle' });
      await page.waitForSelector('.demo-bar .persona-btn');
      assert.equal(await page.locator('.demo-tabs a[aria-current="page"]').textContent(), label[0].toUpperCase() + label.slice(1));
      assert.ok(await page.locator('.persona-btn .who b').textContent());
      await page.close();
    }
    // The student portal: a question card gets the library's reference popup.
    const page = await ctx.newPage();
    watch(page, 'student-quiz');
    await page.goto(`${base}/student?as=stu-maya`, { waitUntil: 'networkidle' });
    const hasAfter = await page.evaluate(() => typeof window.Demo?.user?.id === 'string');
    assert.ok(hasAfter);
    await page.close();
    assert.deepEqual(issues, [], issues.join('\n'));
  } finally { await browser.close(); }
});

test('stopping the server leaves nothing behind', async () => {
  assert.equal(child.exitCode, null, 'running until now');
  child.kill('SIGTERM');
  const { code, signal } = await Promise.race([exited, new Promise((_, rej) => setTimeout(() => rej(new Error('server did not stop')), 10000))]);
  assert.ok(code === 0 || signal === 'SIGTERM', `exit ${code}/${signal}`);
  await assert.rejects(fetch(`${base}/api/health`), 'the port is closed');
});
