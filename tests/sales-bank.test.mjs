// The Sales and Leases final-exam banks: the checks a page build can't catch on its own, run against the
// published HTML through the same reader Shuffle mode and the games use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { extractQuestions } from '../scripts/lib/quiz.mjs';

const dir = path.join('content', 'Sales and Leases');
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const data = (html, name) => JSON.parse(new RegExp(`^const ${name} = (.*);$`, 'm').exec(html)[1]);
const practice = read('Sales_and_Leases_Practice_Exams.html');
const bar = read('Sales_and_Leases_Bar_Questions.html');
const QB = data(practice, 'QB');
const subject = JSON.parse(read('subject.json'));

test('every practice set in the subject is one the reader can parse, at its stated size', () => {
  for (const [file, doc] of Object.entries(subject.documents)) {
    if (doc.type !== 'practice') continue;
    assert.equal(extractQuestions(read(file)).length, doc.questions, file);
  }
});

test('retired sets are gone from the catalog and the folder', () => {
  for (const f of ['Complete_Coverage_Exams', 'Acronym_Exams', 'Practice_Exams_II', 'Weighted_Practice_Exams', 'Focused_Practice_Exams']) {
    const name = `Sales_and_Leases_${f}.html`;
    assert.equal(subject.documents[name], undefined, name);
    assert.equal(fs.existsSync(path.join(dir, name)), false, name);
  }
});

test('practice exams are 15 five-choice questions each, with unique ids', () => {
  assert.equal(new Set(QB.map((q) => q.id)).size, QB.length);
  const exams = new Map();
  for (const q of QB) {
    exams.set(q.exam, (exams.get(q.exam) || 0) + 1);
    assert.equal(q.o.length, 5, q.id);
    assert.ok(Number.isInteger(q.a) && q.a >= 0 && q.a < 5, q.id);
  }
  for (const [e, n] of exams) assert.equal(n, 15, `exam ${e}`);
});

test('the keyed choice is the one explained as correct, and only that one', () => {
  for (const q of QB) {
    q.o.forEach(([, why], i) => {
      if (i === q.a) assert.match(why, /^Correct/, `${q.id} key`);
      else assert.doesNotMatch(why, /^Correct\b(?! statement)/, `${q.id} choice ${i}`); // "Correct statement" explains a NOT question
    });
  }
});

test('choices that refer to the others stay last and in place', () => {
  for (const q of QB) {
    const at = q.o.findIndex(([t]) => /^(All|None) of the above/.test(t));
    if (at < 0) continue;
    assert.ok(at >= 3, q.id); // "All of the above" can sit just above "None of the above"
    assert.ok(q.fixed, q.id);
  }
});

test('answer letters are evenly spread', () => {
  const n = [0, 1, 2, 3, 4].map((i) => QB.filter((q) => q.a === i).length);
  assert.ok(Math.max(...n) - Math.min(...n) <= QB.length * 0.02, n.join());
});

test('every exam samples both halves of the course, and every outline section is tested', () => {
  const areas = data(practice, 'AREAS');
  assert.equal(areas.length, 35);
  for (const a of areas) assert.ok(QB.some((q) => q.area === a), a);
  const late = (q) => /· X(VI{1,3}|I?X|XI{0,3}V?I{0,3})\b/.test(q.area) && !/· XVI ·/.test(q.area) && !/· X(I{1,3}|IV|V)? ·/.test(q.area);
  for (const e of new Set(QB.map((q) => q.exam))) {
    const qs = QB.filter((q) => q.exam === e);
    assert.ok(qs.some(late) && qs.some((q) => !late(q)), `exam ${e}`);
  }
});

test('variations point at a question on the same page', () => {
  const ids = new Set(QB.map((q) => q.id));
  for (const q of QB) if (q.v) assert.ok(ids.has(q.v), q.id);
  const m = bar.match(/^const QB = \[\n([\s\S]*?)\n\];$/m);
  const qs = JSON.parse('[' + m[1] + ']');
  const barIds = new Set(qs.map((q) => String(q.id)));
  assert.equal(barIds.size, qs.length);
  for (const q of qs) {
    assert.equal(q.o.length, 4, q.id);
    assert.match(q.o[0][1], /^Correct/, q.id);
    if (q.v) assert.ok(barIds.has(String(q.v)), q.id);
  }
});

test('no question still points at the old exams', () => {
  for (const html of [practice, bar]) assert.doesNotMatch(html, /Week 10 assessment|Week 5 assessment|Complete Coverage/i);
});
