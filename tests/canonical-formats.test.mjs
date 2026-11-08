// The canonical formats (docs/mcq-format.md, docs/supplement-format.md, docs/outline-format.md):
// the MCQ reader and checker, the practice shell and its build hydration with the reference popup,
// the citation styles in src/assets/refs.js, the outline pipeline round trip into the popup's index,
// the templates, and that none of it leaks into the public site.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readMcq, normalizeMcq, mcqDataBlock, mcqToQuiz, isFixedChoice, hasMcqBlock } from '../scripts/lib/mcq.mjs';
import { renderPracticeShell } from '../scripts/lib/practice-shell.mjs';
import { readSupplement, readSupplementPage, normalizeSupplement, renderSupplement, ID_PATTERNS, CITE_STYLES } from '../scripts/lib/supplement-shell.mjs';
import { extractQuestions } from '../scripts/lib/quiz.mjs';
import { refIndex, supplementStatutes, outlineSections, injectRefs } from '../scripts/lib/refs.mjs';
import { convertDocx } from '../scripts/lib/docx.mjs';
import { buildOutlineDocx } from '../scripts/templates/build-outline-docx.mjs';
import { renderTemplates } from '../scripts/templates/build-templates.mjs';
import { lintCitations } from '../scripts/templates/check.mjs';
import { checkFile } from '../submissions/checks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SAMPLE_MCQ = () => JSON.parse(read('docs/templates/sample.mcq.json'));
const SAMPLE_SUPP = () => JSON.parse(read('docs/templates/sample.supplement.json'));
const SAMPLE_OUTLINE = () => JSON.parse(read('docs/templates/sample-outline.json'));
const SL = 'content/Sales and Leases/';

// refs.js runs without a page under Node and hands its pure cite code to globalThis.refsCites.
const ctx = {};
vm.createContext(ctx);
vm.runInContext(read('src/assets/refs.js'), ctx);
const { STYLES, PROB, problemsIn, caseRegex } = ctx.refsCites;
// Values made inside the vm context have its own Array prototype, so compare them as plain JSON.
const plain = (v) => JSON.parse(JSON.stringify(v));
const cites = (style, text) => plain(STYLES[style].cites(text).map((c) => [text.slice(c.at, c.end), c.id, c.sub, ...(c.cmt ? [c.cmt] : [])]));

// ---------------------------------------------------------------------------
// mcq/v1: reading and checking
// ---------------------------------------------------------------------------
test('the sample set is a clean mcq/v1 set', () => {
  const { set, errors, warnings } = normalizeMcq(SAMPLE_MCQ());
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.equal(set.schema, 'mcq/v1');
  assert.equal(set.id, 'sample-sales-and-leases');
  assert.equal(set.questions.length, 6);
  assert.deepEqual(set.exams.map((e) => e.id), ['1', '2']);
  assert.deepEqual(set.questions.map((q) => q.n), [1, 2, 3, 4, 1, 2]);
  const variation = set.questions.find((q) => q.id === '2.1');
  assert.match(variation.pre, /^Dana buys a refrigerator[\s\S]*\n\nWho bears the loss of the refrigerator\?$/, 'a variation shows the original facts and stem');
  assert.equal(set.questions.find((q) => q.id === '1.4').fixed, true);
});

test('choices that refer to each other keep their order even when the author forgets "fixed"', () => {
  for (const t of ['None of the above.', 'All of the above', 'B and C', 'A, B, and C.', 'Both A and C', 'Neither A nor B', 'A only', 'B and C, but not A']) assert.ok(isFixedChoice(t), t);
  for (const t of ['A and T are both liable.', 'Buyer wins, because none of the defenses apply.', 'Only a merchant can make a firm offer.', 'C.I.F. and C. & F. terms']) assert.ok(!isFixedChoice(t), t);
  const raw = SAMPLE_MCQ();
  delete raw.questions[3].fixed;
  assert.equal(normalizeMcq(raw).set.questions[3].fixed, true);
  raw.questions[3].fixed = false;
  const { set, warnings } = normalizeMcq(raw);
  assert.equal(set.questions[3].fixed, true);
  assert.ok(warnings.some((w) => /kept "fixed"/.test(w)));
});

test('questions with errors are left out and the rest are kept, with clear messages', () => {
  const ok = { area: 'A', o: ['x', 'y'], a: 0, oe: ['why x', 'why y'] };
  const { set, errors, warnings } = normalizeMcq({
    title: 'Checks',
    areas: ['A'],
    questions: [
      { id: 'a', q: 'fine', ...ok },
      { id: 'a', q: 'duplicate id', ...ok },
      { id: 'b', q: 'answer out of range', ...ok, a: 2 },
      { id: 'c', q: 'no rationales', area: 'A', o: ['x', 'y'], a: 0 },
      { id: 'd', q: 'one rationale short', ...ok, oe: ['only one'] },
      { id: 'e', q: 'letter answer, legacy pairs', area: 'A', o: [['x', 'why x'], ['y', 'why y']], a: 'B' },
      { id: 'f', q: 'names a letter', ...ok, oe: ['Unlike choice B, x works.', 'y fails'] },
      { id: 'g', q: 'unknown references', ...ok, area: 'Z', v: 'nope', hypo: 'nope' },
      { q: 'no id', ...ok },
    ],
  });
  assert.deepEqual(set.questions.map((q) => q.id), ['a', 'e', 'f', 'g', '9']);
  assert.equal(errors.length, 4);
  assert.ok(errors.some((e) => /duplicate id "a"/.test(e)));
  assert.ok(errors.some((e) => /"a" must be the index/.test(e)));
  assert.equal(errors.filter((e) => /"oe" must give a rationale/.test(e)).length, 2);
  const e = set.questions.find((q) => q.id === 'e');
  assert.deepEqual([e.o, e.oe, e.a], [['x', 'y'], ['why x', 'why y'], 1]);
  for (const re of [/names a choice by letter/, /area "Z" isn't in "areas"/, /varies "nope"/, /hypo "nope"/, /no "id"; using "9"/]) assert.ok(warnings.some((w) => re.test(w)), String(re));
});

test('readMcq only parses JSON: comments, scripts and other schemas are not sets', () => {
  assert.equal(readMcq('{"questions": "nope"}'), null);
  assert.equal(readMcq(JSON.stringify({ schema: 'mcq/v2', questions: [] })), null);
  assert.ok(readMcq(JSON.stringify({ schema: 'mcq/v1.1', questions: [] })));
  // A code block posing as data is never run.
  const code = '<script id="mcq-data" type="application/json">{ "questions": [ (globalThis.pwned = 1) ] }</script>';
  assert.equal(readMcq(code), null);
  assert.deepEqual(extractQuestions(code), []);
  assert.equal(globalThis.pwned, undefined);
  // A block mentioned inside a comment is ignored.
  assert.equal(hasMcqBlock('<!-- <script id="mcq-data" type="application/json">{}</script> -->'), false);
});

// ---------------------------------------------------------------------------
// The practice shell and the game reader
// ---------------------------------------------------------------------------
test('the practice shell embeds the set safely and the game reader reads it back', () => {
  const raw = SAMPLE_MCQ();
  raw.questions[0].q += ' </script><script>globalThis.pwned = 1</script> <!--';
  const { set } = normalizeMcq(raw);
  const html = renderPracticeShell(set, { accent: '#3f6b4a' });
  assert.equal(html.match(/<\/script>/g).length, 2, 'only the data block and the runtime close a script');
  assert.match(html, /<meta name="generator" content="mcq\/v1 practice shell">/);
  assert.match(html, /data-mcq-shell style="--accent:#3f6b4a"/);
  for (const id of ['sh-score', 'sh-grade', 'sh-missed', 'sh-flagged', 'sh-reset', 'sh-m-study', 'sh-m-exam', 'sh-exam', 'sh-area', 'sh-shufq', 'sh-shufo', 'sh-meter', 'sh-list']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /class="shuffle-bar"/);

  const qs = extractQuestions(html);
  assert.equal(qs.length, 6);
  assert.ok(qs[0].q.endsWith('</script><script>globalThis.pwned = 1</script> <!--'));
  assert.equal(globalThis.pwned, undefined);
  const [, , risk, fixed, variation] = qs;
  assert.match(risk.q, /^Dana buys a refrigerator[\s\S]*\n\nWho bears the loss/, 'shared facts print with the question');
  assert.equal(risk.topic, 'Risk of loss — Merchant seller, buyer picks up');
  assert.equal(risk.a, 2);
  assert.equal(risk.oe.length, 5);
  assert.match(risk.e, /§ 2-509\(3\)/);
  assert.equal(risk.n, '1.3');
  assert.equal(fixed.fixed, true);
  assert.equal(risk.fixed, undefined);
  assert.match(variation.pre, /Appliance Mart/);
  assert.deepEqual(mcqToQuiz(set).map((q) => q.n), ['1.1', '1.2', '1.3', '1.4', '2.1', '2.2']);
});

test('a page with nothing but an mcq-data block is a set', () => {
  const { set } = normalizeMcq(SAMPLE_MCQ());
  const page = `<title>Bare</title>\n${mcqDataBlock(set)}`;
  assert.ok(hasMcqBlock(page));
  assert.equal(extractQuestions(page).length, 6);
});

test('the older practice formats still read the same', () => {
  const docs = JSON.parse(read(`${SL}subject.json`)).documents;
  const exams = extractQuestions(read(`${SL}Sales_and_Leases_Practice_Exams.html`));
  assert.equal(exams.length, docs['Sales_and_Leases_Practice_Exams.html'].questions);
  const bar = extractQuestions(read(`${SL}Sales_and_Leases_Bar_Questions.html`));
  assert.equal(bar.length, docs['Sales_and_Leases_Bar_Questions.html'].questions);
  assert.ok(bar.some((q) => q.pre), 'bar-question variations keep their original facts');
  assert.ok(exams.some((q) => q.fixed) && exams.every((q) => q.oe?.length === q.o.length));
});

test('the shell uses Shuffle mode\'s card and bar rules verbatim', () => {
  const site = read('src/assets/styles.css').split('\n');
  const rules = site.filter((l) => /^\.(sq\b|sq-|shuffle-(run|bar|score|meter|list)\b)/.test(l));
  assert.ok(rules.length > 30);
  const shell = read('src/practice/shell.css');
  for (const rule of rules) assert.ok(shell.includes(rule), `src/practice/shell.css is missing: ${rule}`);
});

// ---------------------------------------------------------------------------
// Citation styles (STYLES in src/assets/refs.js)
// ---------------------------------------------------------------------------
test('UCC and FRE cites link as before, and a comment joins its cite', () => {
  assert.deepEqual(cites('ucc', 'Under § 2-207(2)(b) and UCC 2-314, see § 2-209 cmt. 2 and 1-201(b)(20); §§ 2-312, 2-313.'), [
    ['§ 2-207(2)(b)', '2-207', '(2)(b)'], ['2-314', '2-314', ''], ['§ 2-209 cmt. 2', '2-209', '', '2'], ['1-201(b)(20)', '1-201', '(b)(20)'], ['§§ 2-312', '2-312', ''], ['2-313', '2-313', ''],
  ]);
  assert.deepEqual(cites('fre', 'Rule 404(b) and Rules 607, 608, and 609; subject to 403; FRE 803(6); 803(2) applies; 403 balancing; 1,000 dollars'), [
    ['Rule 404(b)', '404', '(b)'], ['Rules 607', '607', ''], ['608', '608', ''], ['609', '609', ''], ['403', '403', ''], ['FRE 803(6)', '803', '(6)'], ['803(2)', '803', '(2)'], ['403', '403', ''],
  ]);
});

test('Model Rules, Civil Procedure, Restatement and section cites', () => {
  assert.deepEqual(cites('mrpc', 'Rule 1.7(a)(2), MRPC 1.6, Model Rule 1.8(e), Rules 1.7 and 1.10, 1.6(b)(1), $1.50, Rule 1.7, Comment [8], version 2.0, MR 1.18 cmt [2], Mr. 1.5'), [
    ['Rule 1.7(a)(2)', '1.7', '(a)(2)'], ['MRPC 1.6', '1.6', ''], ['Model Rule 1.8(e)', '1.8', '(e)'], ['Rules 1.7', '1.7', ''], ['1.10', '1.10', ''], ['1.6(b)(1)', '1.6', '(b)(1)'], ['Rule 1.7, Comment [8]', '1.7', '', '8'],
    ['MR 1.18 cmt [2]', '1.18', '', '2'],
  ]);
  assert.deepEqual(cites('frcp', 'Rule 12(b)(6); FRCP 56(a); Fed. R. Civ. P. 23(b)(3); Rules 12, 13, and 14; Rule 56, 30 days later; 28 U.S.C. § 1332(a)(1) and §§ 1331 and 1367; 12(h)(1); Problem 4-3(b); Section 2(a); Rule 4.1'), [
    ['Rule 12(b)(6)', '12', '(b)(6)'], ['FRCP 56(a)', '56', '(a)'], ['Fed. R. Civ. P. 23(b)(3)', '23', '(b)(3)'], ['Rules 12', '12', ''], ['13', '13', ''], ['14', '14', ''], ['Rule 56', '56', ''],
    ['28 U.S.C. § 1332(a)(1)', '1332', '(a)(1)'], ['§§ 1331', '1331', ''], ['1367', '1367', ''], ['12(h)(1)', '12', '(h)(1)'], ['Rule 4.1', '4.1', ''],
  ]);
  assert.deepEqual(cites('restatement', 'Restatement (Second) of Contracts § 90(1); §§ 71 and 90; Section 87(2); § 2-207 is UCC; § 7.03; Sec. 139'), [
    ['§ 90(1)', '90', '(1)'], ['§§ 71', '71', ''], ['90', '90', ''], ['Section 87(2)', '87', '(2)'], ['§ 7.03', '7.03', ''], ['Sec. 139', '139', ''],
  ]);
  assert.deepEqual(cites('section', '§ 12-345(b) and §§ 1983, 1988; Section 4.01'), [
    ['§ 12-345(b)', '12-345', '(b)'], ['§§ 1983', '1983', ''], ['1988', '1988', ''], ['Section 4.01', '4.01', ''],
  ]);
  assert.equal(STYLES.frcp.name('1332'), '§ 1332');
  assert.equal(STYLES.frcp.name('12'), 'Rule 12');
  assert.equal(STYLES.mrpc.prefix('rule 1.7'), '1.7');
  assert.equal(STYLES.mrpc.prefix('MR 1.18'), '1.18');
  assert.equal(STYLES.restatement.prefix('§ 90'), '90');
});

test('every style the supplement format names is a refs.js style, and its ids are ones refs.js links', () => {
  assert.deepEqual(Object.keys(STYLES).sort(), [...CITE_STYLES].sort());
  const samples = { ucc: '§ 2-207(1)', fre: 'Rule 404(b)', mrpc: 'Rule 1.7(a)', frcp: 'Rule 12(b)(6) and 28 U.S.C. § 1332', restatement: '§ 90', section: '§ 12-345' };
  for (const style of CITE_STYLES) {
    const s = STYLES[style];
    for (const k of ['cites', 'sign', 'name', 'badge', 'group', 'doc', 'hint', 'prefix']) assert.ok(s[k], `${style}.${k}`);
    const found = s.cites(samples[style]);
    assert.ok(found.length, style);
    for (const c of found) assert.match(c.id, ID_PATTERNS[style], `${style} id ${c.id}`);
  }
});

test('problems and case names', () => {
  const m = [...'See Problems 4-10 and 4-11(b), and Problem 3-4(a).'.matchAll(PROB)];
  assert.deepEqual(plain(m.flatMap(problemsIn).map((p) => [p.n, p.sub])), [['4-10', ''], ['4-11', '(b)'], ['3-4', '(a)']]);
  const re = caseRegex([
    { key: 'Johnson', keys: ['Johnson'], vs: ['State'] },
    { key: 'Fenwick', keys: ['Fenwick'], vs: ['Smith'] },
    { key: 'Roth Steel', keys: ['Roth Steel'], vs: ['Sharon'] },
  ]);
  const found = (t) => [...t.matchAll(re)].map((x) => x[0]);
  assert.deepEqual(found('Johnson and Roth Steel apply.'), ['Johnson', 'Roth Steel']);
  assert.deepEqual(found('Johnson v. Lutz and Watteau v. Fenwick'), [], 'another case with the same party, or a party after "v."');
  assert.deepEqual(found('Johnson v. State held'), ['Johnson']);
});

// ---------------------------------------------------------------------------
// Supplements
// ---------------------------------------------------------------------------
test('a supplement/v1 page keeps the one-line DATA contract the popup reads', () => {
  const supp = normalizeSupplement(readSupplement(JSON.stringify(SAMPLE_SUPP())));
  assert.deepEqual([supp.errors, supp.warnings], [[], []]);
  supp.data[0].x[0][1] += ' </script><script>globalThis.pwned = 1</script>';
  const html = renderSupplement(supp);
  assert.equal(html.match(/<\/script>/g).length, 2);
  assert.equal(html.split('\n').filter((l) => /^const (SUPP|AREAS|DATA) = .*;$/.test(l)).length, 3);
  const back = supplementStatutes(html);
  assert.deepEqual(back.map((s) => s.s), ['2-201', '2-207', '2-209', '2-316', '2-501', '2-509', '2-510']);
  assert.ok(back[0].x[0][1].endsWith('</script><script>globalThis.pwned = 1</script>'));
  assert.deepEqual(back[1].cc, ['4', '6']);
  // Re-reading a built page and rendering it again changes nothing.
  assert.equal(renderSupplement(normalizeSupplement(readSupplementPage(html))), html);
});

test('supplement checks', () => {
  const { data, errors, warnings } = normalizeSupplement({
    cite: 'fre', title: 'Rules', areas: ['Relevance'],
    data: [
      { s: '401', t: 'Test for Relevant Evidence', part: 'Article IV', x: [['', 'Evidence is relevant if …']], tp: [1] },
      { s: '401', t: 'Duplicate', part: 'Article IV', x: [['', '…']], tp: [1] },
      { s: '4-01', t: 'Wrong shape', part: 'Article IV', x: [['', '…']], tp: [3], c: [['1', 'note']], cc: ['2'] },
      { s: '403', t: 'No text', part: 'Article IV' },
    ],
  });
  assert.deepEqual(data.map((d) => d.s), ['401', '4-01']);
  assert.equal(errors.length, 2);
  for (const re of [/doesn't look like a fre number/, /topic 3 isn't in "areas"/, /key comment "2" isn't in "c"/]) assert.ok(warnings.some((w) => re.test(w)), String(re));
});

// ---------------------------------------------------------------------------
// Outlines: outline/v1 JSON -> .docx -> structureOutline() -> refIndex()
// ---------------------------------------------------------------------------
test('an outline built from outline/v1 JSON comes out structured and fully indexed', async () => {
  const bytes = buildOutlineDocx(SAMPLE_OUTLINE());
  assert.ok(buildOutlineDocx(SAMPLE_OUTLINE()).equals(bytes), 'the same outline gives the same bytes');
  const { html, toc } = await convertDocx(bytes, { theme: 'structured', outsideColor: '64748B' });

  assert.match(html, /^<header class="doc-masthead"><h1 class="doc-title">Sales &amp; Leases — Sample Study Outline<\/h1><p class="doc-subtitle">Condensed Outline · Weeks 1–5 · UCC Article 2<\/p><p class="doc-meta">/);
  assert.match(html, /<div class="part-band"><h1 id="part-i-formation-and-modification"><span class="part-kicker">Part I<span class="sr-only"> — <\/span><\/span>Formation and Modification<\/h1><\/div>/);
  assert.match(html, /<div class="section-band"><h2 id="ii-formation">II. Formation<\/h2><span class="section-week">week 1<\/span><\/div>/);
  assert.match(html, /<div class="section-band"><h2 id="4-risk-of-loss">4. Risk of Loss<\/h2><span class="section-week">weeks 4–5<\/span><\/div>/, 'a Heading 2 takes a week label too');
  assert.deepEqual(toc.map((t) => [t.level, t.text]), [[1, 'Part I — Formation and Modification'], [2, 'II. Formation'], [2, 'III. Good Faith and Modification'], [1, 'Part II — Performance'], [2, '4. Risk of Loss']]);
  assert.match(html, /<h3 id="battle-of-the-forms-2-207">Battle of the forms — § 2-207<\/h3>/);
  for (const cls of ['callout-key', 'callout-rule', 'callout-tips', 'callout-case case-main', 'callout-case case-cited', 'callout-case case-note']) assert.ok(html.includes(`<aside class="callout ${cls}">`), cls);
  assert.match(html, /<span class="callout-tag">main case <span class="callout-star" title="Has its own class slide">★<\/span><\/span><p class="callout-title">Roth Steel Products v. Sharon Steel Corp\. \(6th Cir\. 1983\) — modification and good faith<\/p><p class="callout-source">/);
  assert.match(html, /<span class="callout-tag">note case · class 5<\/span><p class="callout-title">Ingram River Equip\. v\. Pott Indus\. \(8th Cir\. 1987\)<\/p><p class="case-field case-facts">/);
  assert.match(html, /<p class="callout-title">Traps<\/p>/);
  assert.match(html, /<p class="case-legend"><span class="case-chip case-main">main case<\/span>/);
  assert.match(html, /<span class="el el-1">\(a\) the offer expressly limits/);
  assert.match(html, /<span class="el el-3">\(c\) notification of objection/);
  assert.equal((html.match(/<p class="el-line el-\d">/g) || []).length, 4);
  assert.match(html, /<span class="outside outside-gray">Most courts follow it\.<\/span>/);
  assert.match(html, /<tr class="rb rb-1"><td data-label="Situation">/);

  const ix = refIndex({ outlineHtml: html, links: {} });
  assert.deepEqual(ix.sections.map((s) => [s.level, s.id, s.parent ?? s.week]), [
    [2, 'ii-formation', 'week 1'],
    [3, 'which-law-governs-four-factors', 'ii-formation'],
    [3, 'battle-of-the-forms-2-207', 'ii-formation'],
    [2, 'iii-good-faith-and-modification', 'week 2'],
    [3, 'modification-2-209', 'iii-good-faith-and-modification'],
    [3, 'problem-3-4-modification-and-the-sof', 'iii-good-faith-and-modification'],
    [2, '4-risk-of-loss', 'weeks 4–5'],
  ]);
  assert.ok(ix.sections.every((s) => !s.html.includes('part-band')), 'the next Part\'s divider stays out of the section before it');
  assert.deepEqual(ix.cases.map((c) => [c.keys, c.section]), [
    [['Daitom'], 'battle-of-the-forms-2-207'],
    [['Roth Steel'], 'modification-2-209'],
    [['Windows, Inc. v.'], '4-risk-of-loss'], // "windows" also appears as a word, so the key needs its "v."
    [['Ingram River'], '4-risk-of-loss'],
  ]);
  assert.deepEqual(ix.problems.map((p) => [p.n, p.title, p.parts[0].section]), [
    ['1-2', 'Speedy Offset prints & binds 500 art books', 'which-law-governs-four-factors'],
    ['3-4', 'modification and the SOF', 'problem-3-4-modification-and-the-sof'],
    ['3-5', '10,000 widgets/month, delivery to buyer by the 5th', 'problem-3-4-modification-and-the-sof'],
    ['3-6', '', 'problem-3-4-modification-and-the-sof'],
    ['3-8', '', '4-risk-of-loss'],
  ]);
  const p34 = ix.problems.find((p) => p.n === '3-4').parts[0].html;
  assert.ok(p34.includes('Oral $400 deal') && !p34.includes('Problem 3-5'), 'a problem-headed subsection holds its problem only up to the next one');
  // "In the outline" links: the statutes each section cites, as refs.js finds them.
  const text = (id) => { const s = ix.sections.find((x) => x.id === id); return `${s.title} ${s.html.replace(/<[^>]+>/g, ' ')}`; };
  assert.ok(STYLES.ucc.cites(text('battle-of-the-forms-2-207')).some((c) => c.id === '2-207'));
  assert.ok(STYLES.ucc.cites(text('modification-2-209')).some((c) => c.id === '2-209' && c.cmt === '2'));
});

test('the outline builder refuses blocks the site could not read', () => {
  const bad = [
    { type: 'section', number: 'II', title: 'Formation', weeks: 'Week one' },
    { type: 'case', name: 'Daitom against Pennwalt', court: '1984' },
    { type: 'case', kind: 'MAIN CASE', style: 'inline', name: 'Daitom, Inc. v. Pennwalt Corp.' },
    { type: 'problem', number: '4–3', text: 'en dash' },
    { type: 'steps', items: ['**All bold**', '**Also bold**'] },
    { type: 'callout', kind: 'RULE', body: [{ type: 'list', items: ['a list first'] }] },
    { type: 'callout', kind: 'WARNING', body: ['unknown tag'] },
    { type: 'part', number: '1', title: 'Arabic part' },
  ];
  for (const b of bad) assert.throws(() => buildOutlineDocx({ blocks: [b] }), undefined, JSON.stringify(b));
  // Inside a box, a bold step is fine.
  assert.ok(buildOutlineDocx({ blocks: [{ type: 'callout', kind: 'ROADMAP', title: 'Steps', body: [{ type: 'steps', items: ['**One**', '**Two**'] }] }] }));
});

test('the Sales and Leases outline still indexes the same', async () => {
  const { html } = await convertDocx(fs.readFileSync(path.join(ROOT, SL, 'Sales_and_Leases_Week10_Condensed_Outline.docx')), { theme: 'structured', outsideColor: '64748B' });
  const ix = refIndex({ outlineHtml: html, supplementHtml: read(`${SL}Sales_and_Leases_Statutory_Supplement.html`), links: {} });
  assert.equal(ix.statutes.length, 182);
  assert.equal(ix.sections.filter((s) => s.level === 2).length, 35);
  assert.equal(ix.sections.length, 126);
  assert.equal(ix.cases.length, 18);
  assert.equal(ix.problems.length, 78);
  assert.ok(ix.cases.some((c) => c.key === 'Windows, Inc. v.'));
  assert.deepEqual(ix.problems.find((p) => p.n === '5-1').parts.map((x) => x.part).filter(Boolean).sort(), ['(a)', '(b)']);
});

test('Part titles keep their acronyms', async () => {
  const { html } = await convertDocx(fs.readFileSync(path.join(ROOT, 'content/Evidence/Evidence_Condensed_Outline.docx')), { theme: 'structured', outsideColor: '64748B' });
  assert.match(html, /The Specialized Relevance Rules \(FRE 407–411\)<\/h1>/);
  assert.ok(outlineSections(html).every((s) => !s.html.includes('part-band')));
});

// ---------------------------------------------------------------------------
// Citation check against a course index
// ---------------------------------------------------------------------------
test('the citation check finds cites, cases and problems that would not link', async () => {
  const { html } = await convertDocx(buildOutlineDocx(SAMPLE_OUTLINE()), { theme: 'structured', outsideColor: '64748B' });
  const supp = renderSupplement(normalizeSupplement(SAMPLE_SUPP()));
  const index = refIndex({ outlineHtml: html, supplementHtml: supp, links: {}, cite: 'ucc' });
  const good = lintCitations(normalizeMcq(SAMPLE_MCQ()).set, index, ctx.refsCites);
  assert.deepEqual(good.issues, []);
  assert.equal(good.linked, 6);
  const { set } = normalizeMcq({ title: 'x', questions: [
    { id: '1', area: 'A', q: 'Under § 2-999 and Smith v. Jones, see Problem 9-9(a). Roth Steel too.', o: ['a', 'b'], a: 0, oe: ['x', 'y'] },
    { id: '2', area: 'A', q: 'No cites at all.', o: ['a', 'b'], a: 0, oe: ['x', 'y'] },
  ] });
  const bad = lintCitations(set, index, ctx.refsCites);
  assert.equal(bad.issues.length, 3);
  assert.deepEqual(bad.unlinked, ['2']);
});

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
test('the committed templates match the current shell and viewer (npm run templates)', () => {
  const lf = (s) => s.replace(/\r\n/g, '\n'); // A Windows checkout may hold CRLF, in the sources too.
  for (const [file, html] of Object.entries(renderTemplates())) assert.ok(lf(read(`docs/templates/${file}`)) === lf(html), `docs/templates/${file} is stale: run npm run templates`);
});

test('the templates and a generated outline pass the submission safety checks', async () => {
  for (const f of ['mcq-shuffle-template.html', 'supplement-template.html']) assert.deepEqual(await checkFile(f, new Uint8Array(fs.readFileSync(path.join(ROOT, 'docs/templates', f)))), [], f);
  assert.deepEqual(await checkFile('Outline.docx', new Uint8Array(buildOutlineDocx(SAMPLE_OUTLINE()))), []);
});

test('a pull request may add canonical data files: the safety checks read them as data', async () => {
  const check = (name, text) => checkFile(name, new TextEncoder().encode(text));
  assert.deepEqual(await check('Set.mcq.json', read('docs/templates/sample.mcq.json')), []);
  assert.deepEqual(await check('Rules.supplement.json', read('docs/templates/sample.supplement.json')), []);
  const notASet = await check('Set.mcq.json', '{ "questions": [ (globalThis.pwned = 1) ] }');
  assert.equal(notASet[0].level, 'block');
  assert.equal(globalThis.pwned, undefined);
  const flawed = JSON.parse(read('docs/templates/sample.mcq.json'));
  delete flawed.questions[0].oe;
  assert.deepEqual((await check('Set.mcq.json', JSON.stringify(flawed))).map((f) => f.level), ['warn']);
  assert.equal((await check('notes.json', '{}'))[0].level, 'block', 'other JSON is still not a document');
});

test('refs tags go in just before </body>', () => {
  const tags = injectRefs('<html><body><p>Q</p></body></html>', { slug: 'evidence', version: 'abc' });
  assert.equal(tags, '<html><body><p>Q</p><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..600&amp;family=Inter:wght@400;500;600&amp;family=JetBrains+Mono:wght@500&amp;display=swap"><link rel="stylesheet" href="../../assets/refs.css?v=abc"><script src="../../assets/refs.js?v=abc" data-root="../../" data-index="assets/refs/evidence.json?v=abc" defer></script></body></html>');
  assert.ok(injectRefs('<p>fragment</p>', { slug: 's', version: 'v' }).startsWith('<p>fragment</p><link'));
});

// ---------------------------------------------------------------------------
// The build: hydration, the popup, the games, the API, and nothing public
// ---------------------------------------------------------------------------
test('the build renders canonical sources, wires the popup, and keeps the specs off the public site', { timeout: 120000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-'));
  try {
    const dir = path.join(tmp, 'content', 'Sample Course');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'Sample_Outline.docx'), buildOutlineDocx(SAMPLE_OUTLINE()));
    fs.writeFileSync(path.join(dir, 'Sample_Set.mcq.json'), read('docs/templates/sample.mcq.json'));
    fs.writeFileSync(path.join(dir, 'Sample_Statutes.supplement.json'), read('docs/templates/sample.supplement.json'));
    fs.copyFileSync(path.join(ROOT, 'docs/templates/mcq-shuffle-template.html'), path.join(dir, 'Template_Copy.html'));
    // An older-format set in the same course gets the popup too.
    fs.writeFileSync(path.join(dir, 'Legacy_Quiz.html'), `<title>Legacy Quiz</title><body><script>const QB = ${JSON.stringify([{ id: '1', area: 'Formation', stem: 'Is § 2-207 about forms?', o: [['Yes', 'It is.'], ['No', 'It is not.']] }])};</script></body>`);
    fs.writeFileSync(path.join(dir, 'subject.json'), JSON.stringify({
      title: 'Sample Course', accent: '#3f6b4a',
      refs: { statutes: 'sample-statutes', outline: 'sample-outline' },
      documents: { 'Sample_Outline.docx': { theme: 'structured', outsideColor: '64748B' }, 'Legacy_Quiz.html': { type: 'practice' } },
    }));
    const dist = path.join(tmp, 'dist');
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, env: { ...process.env, SITE_CONTENT_DIR: path.join(tmp, 'content'), SITE_DIST_DIR: dist }, stdio: 'pipe' });
    const out = (rel) => fs.readFileSync(path.join(dist, rel), 'utf8');

    // Hydration: both the .mcq.json and the copied template are rendered from their data.
    const set = out('files/sample-course/sample-set.html');
    assert.match(set, /<meta name="generator" content="mcq\/v1 practice shell">/);
    assert.match(set, /--accent:#3f6b4a/);
    // The served copies differ only in the set their answer listener (Your stats) records under.
    assert.match(set, /practice-log\.js\?v=\w+&amp;set=sample-course%2Fsample-set"/);
    assert.equal(out('files/sample-course/template-copy.html').replace('set=sample-course%2Ftemplate-copy', 'set=sample-course%2Fsample-set'), set);
    const supp = out('files/sample-course/sample-statutes.html');
    assert.equal(supplementStatutes(supp).length, 7);

    // The popup: every practice page, canonical or not, links refs.js with the course's index.
    const tag = /<script src="\.\.\/\.\.\/assets\/refs\.js\?v=(\w+)" data-root="\.\.\/\.\.\/" data-index="assets\/refs\/sample-course\.json\?v=\1" defer><\/script><\/body>/;
    for (const f of ['sample-set', 'template-copy', 'legacy-quiz']) assert.match(out(`files/sample-course/${f}.html`), tag, f);
    assert.doesNotMatch(supp, /<script src="[^"]*assets\/refs\.js/, 'the supplement itself is not a practice page');
    const ix = JSON.parse(out('assets/refs/sample-course.json'));
    assert.deepEqual([ix.statutes.length, ix.sections.length, ix.cases.length, ix.problems.length], [7, 7, 4, 5]);
    assert.deepEqual(ix.links, { statutes: 'subjects/sample-course/sample-statutes/', outline: 'subjects/sample-course/sample-outline/' });

    // Library records, downloads, the games, and the API text.
    const docs = Object.fromEntries(JSON.parse(out('api/catalog.json')).documents.map((d) => [d.slug, d]));
    assert.deepEqual([docs['sample-set'].type, docs['sample-set'].questions, docs['sample-set'].originalFilename, docs['sample-set'].title], ['practice', 6, 'Sample_Set.html', 'Sample Practice Set (Sales and Leases)']);
    assert.deepEqual([docs['sample-statutes'].type, docs['sample-statutes'].originalFilename], ['document', 'Sample_Statutes.html']);
    assert.equal(JSON.parse(out('play/data/sample-course/sample-set.json')).length, 6);
    assert.ok(JSON.parse(out('play/data/index.json')).courses[0].sets.some((s) => s.slug === 'sample-set'));
    assert.match(out('api/documents/sample-course/sample-set.txt'), /Answer: B\n- A: Objection is only one of three exceptions/);
    assert.match(out('api/documents/sample-course/sample-statutes.txt'), /## § 2-207 Additional Terms/);

    // The specs: published under api/specs/, listed in llms.txt and the index …
    const specs = JSON.parse(out('api/specs/index.json')).specs.map((s) => s.name);
    for (const f of ['outline-format.md', 'supplement-format.md', 'mcq-format.md', 'ai-prompts.md', 'mcq-shuffle-template.html', 'supplement-template.html', 'sample.mcq.json', 'sample-outline.docx']) {
      assert.ok(specs.includes(f), f);
      assert.ok(fs.existsSync(path.join(dist, 'api/specs', f)), f);
      assert.ok(out('llms.txt').includes(`api/specs/${f}`), f);
    }
    assert.equal(out('api/specs/mcq-format.md'), read('docs/mcq-format.md'));
    // … and nowhere on the public site: no page links them, and the sitemap leaves out api/ entirely.
    const sitemap = out('sitemap.xml');
    assert.doesNotMatch(sitemap, /api\/|\/specs\/|llms|-format\.md|mcq-shuffle-template|supplement-template|ai-prompts/);
    assert.match(sitemap, /subjects\/sample-course\/sample-set\//, 'the practice set itself is a normal library page');
    const pages = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!['api', 'files', 'assets', 'play', 'survivors'].includes(path.relative(dist, p).split(path.sep)[0])) walk(p); } else if (p.endsWith('.html')) pages.push(p); } };
    walk(dist);
    assert.ok(pages.length >= 8);
    for (const p of pages) assert.doesNotMatch(fs.readFileSync(p, 'utf8'), /api\/specs|llms\.txt|outline-format|supplement-format|mcq-format|ai-prompts|mcq-shuffle-template/, path.relative(dist, p));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
