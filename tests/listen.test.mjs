// The hands-free Listen page's play list (src/assets/listen-queue.js), and the per-course data the
// build writes for it (listen/<course>/data.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildQueue, speechChunks, speakable, resumeAt, readSettings, groupsOf, areaOf, minutesOf } from '../src/assets/listen-queue.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DATA = {
  outline: [
    { id: 'relevance', title: '1. Relevance', level: 2, part: '1. Relevance', text: 'Evidence is relevant if it has any tendency.\n- It must be of consequence.' },
    { id: 'cases', title: 'Cases', level: 3, part: '1. Relevance', text: 'Knapp v. State.' },
    { id: 'prejudice', title: '2. Unfair Prejudice', level: 2, part: '2. Unfair Prejudice', text: '' },
  ],
  cards: [
    { deck: 'rules', id: 'fre-401', topic: 'Relevance', cite: 'FRE 401', front: 'When is evidence relevant?', back: 'When both:', points: ['(a) any tendency', '(b) of consequence'], note: 'Low bar.' },
    { deck: 'rules', id: 'fre-403', topic: 'Prejudice', front: 'What does 403 balance?', back: 'Probative value against unfair prejudice.' },
  ],
  questions: [
    { set: 'bar', n: '1.1', topic: 'Relevance — Low bar', q: 'Is the photo relevant?', o: ['Yes', 'No'], a: 0, oe: ['Correct. Any tendency suffices.', 'Too strict.'], e: 'Rule 401 sets a low bar.' },
    { set: 'bar', n: '1.2', topic: 'Hearsay', q: 'Is it hearsay?', o: ['Yes', 'No', 'Maybe'], a: 1, oe: ['No.', 'Correct.', 'No.'] },
  ],
};

test('the queue plays the outline, then the cards, then the questions', () => {
  const q = buildQueue(DATA, { pause: 6 });
  assert.deepEqual(q.map((x) => x.kind), ['outline', 'outline', 'outline', 'card', 'card', 'question', 'question']);
  assert.deepEqual(q.map((x) => x.key), ['o:relevance', 'o:cases', 'o:prejudice', 'c:rules/fre-401', 'c:rules/fre-403', 'q:bar/1.1', 'q:bar/1.2']);
  // An outline section: its heading, then its text, a paragraph at a time.
  assert.deepEqual(q[0].segments.map((s) => s.text), ['1. Relevance', 'Evidence is relevant if it has any tendency.', '- It must be of consequence.']);
  assert.equal(q[0].segments[2].say, 'It must be of consequence.');
  // A card: the front, a pause to think, then the back, its points and its tip.
  const card = q[3].segments;
  assert.equal(card[0].text, 'FRE 401. When is evidence relevant?');
  assert.equal(card[0].pause, 6000);
  assert.deepEqual(card.slice(1).map((s) => s.text), ['When both:', '(a) any tendency', '(b) of consequence', 'Tip: Low bar.']);
  // A question: the stem, the choices, a pause to think, then the answer and the explanation.
  const qs = q[5].segments;
  assert.deepEqual(qs.map((s) => s.role), ['stem', 'choice', 'choice', 'answer', 'explain', 'explain']);
  assert.equal(qs[2].pause, 6000);
  assert.equal(qs[3].text, 'The answer is A: Yes');
  assert.equal(qs[4].text, 'Any tendency suffices.', '"Correct." is not read out');
  assert.equal(qs[5].text, 'Rule: Rule 401 sets a low bar.');
  assert.equal(q[6].segments.at(-1).role, 'answer', 'a question whose rationale is only "Correct." ends on its answer');
});

test('the listener picks what to include', () => {
  assert.deepEqual(buildQueue(DATA, { outline: false, questions: false }).map((x) => x.kind), ['card', 'card']);
  const parts = buildQueue(DATA, { cards: false, questions: false, skipParts: new Set(['1. Relevance']) });
  assert.deepEqual(parts.map((x) => x.key), ['o:prejudice'], 'skipping a part skips its subsections');
  assert.deepEqual(buildQueue(DATA, { outline: false, cards: false, skipAreas: new Set(['Hearsay']) }).map((x) => x.key), ['q:bar/1.1']);
  assert.deepEqual(buildQueue(DATA, { outline: false, questions: false, skipTopics: new Set(['Relevance']) }).map((x) => x.key), ['c:rules/fre-403']);
  assert.equal(buildQueue(DATA, { pause: 99 })[3].segments[0].pause, 6000, 'an unknown pause falls back to the default');
});

test('speech text spells out legal abbreviations and drops outline markup', () => {
  assert.equal(speakable('## Heading'), 'Heading');
  assert.equal(speakable('Under § 2-207 and §§ 2-312, 2-313'), 'Under section 2-207 and sections 2-312, 2-313');
  assert.equal(speakable('Roth Steel v. Sharon Steel, e.g. the UCC rule'), 'Roth Steel versus Sharon Steel, for example, the U C C rule');
  assert.equal(speakable('FRE 403 | balancing'), 'F R E 403. balancing');
});

test('long text is cut into pieces a speech engine reads whole', () => {
  const long = `${'The court weighs probative value. '.repeat(12)}${'word '.repeat(80)}`;
  const parts = speechChunks(long, 120);
  assert.ok(parts.length > 3);
  assert.ok(parts.every((p) => p.length <= 120), 'no piece is longer than the limit');
  assert.equal(parts.join(' ').replace(/\s+/g, ' '), long.trim().replace(/\s+/g, ' '), 'nothing is lost');
  assert.deepEqual(speechChunks('One. Two.\n\nThree.'), ['One. Two.', 'Three.']);
});

test('saved settings and position are checked, and a stale position starts over', () => {
  const q = buildQueue(DATA);
  assert.equal(resumeAt(q, 'c:rules/fre-403'), 4);
  assert.equal(resumeAt(q, 'q:gone/9'), 0);
  const s = readSettings({ outline: false, pause: 10, rate: 1.5, skipAreas: ['Hearsay', 3], voice: 'Samantha', key: 'o:cases', junk: 1 });
  assert.equal(s.outline, false);
  assert.equal(s.cards, true);
  assert.equal(s.pause, 10);
  assert.equal(s.rate, 1.5);
  assert.deepEqual(s.skipAreas, ['Hearsay']);
  assert.equal(readSettings({ pause: 7, rate: 9 }).pause, 6);
  assert.equal(readSettings('nonsense').rate, 1);
  assert.deepEqual(groupsOf(DATA.questions, (x) => areaOf(x.topic)), [{ name: 'Relevance', count: 1 }, { name: 'Hearsay', count: 1 }]);
  assert.ok(minutesOf(q) >= 1);
});

test('the build writes a Listen page and its data for a course with an outline, cards and questions', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'listen-'));
  try {
    const dir = path.join(tmp, 'content', 'Sample Course');
    fs.mkdirSync(dir, { recursive: true });
    const set = (id, archived) => ({ schema: 'mcq/v1', id, title: id, description: 'x', areas: ['Formation'], questions: [{ id: '1', area: 'Formation', tag: archived ? 'old' : 'new', q: `Q from ${id}?`, o: ['Yes', 'No'], a: 0, oe: ['Correct. Because.', 'No.'] }] });
    fs.writeFileSync(path.join(dir, 'Current.mcq.json'), JSON.stringify(set('current')));
    fs.writeFileSync(path.join(dir, 'Old.mcq.json'), JSON.stringify(set('old', true)));
    fs.writeFileSync(path.join(dir, 'Deck.cards.json'), JSON.stringify({ schema: 'cards/v1', id: 'deck', title: 'Deck', description: 'x', topics: ['Formation'], cards: [{ id: 'c1', topic: 'Formation', front: 'What is an offer?', back: 'A manifestation of willingness.' }] }));
    fs.writeFileSync(path.join(dir, 'Sample_Outline.html'), '<title>Sample Outline</title><body><h2>I. Formation</h2><p>An offer is a manifestation.</p><h3>Cases</h3><p>Lucy v. Zehmer.</p><h2>II. Defenses</h2><p>Mistake.</p></body>');
    fs.writeFileSync(path.join(dir, 'subject.json'), JSON.stringify({ title: 'Sample Course', refs: { outline: 'sample-outline' }, documents: { 'Old.mcq.json': { archived: true } } }));
    const dist = path.join(tmp, 'dist');
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, env: { ...process.env, SITE_CONTENT_DIR: path.join(tmp, 'content'), SITE_DIST_DIR: dist }, stdio: 'pipe' });
    const read = (rel) => fs.readFileSync(path.join(dist, rel), 'utf8');
    const data = JSON.parse(read('listen/sample-course/data.json'));
    assert.deepEqual(data.outline.map((s) => [s.title, s.level, s.part]), [['I. Formation', 2, 'I. Formation'], ['Cases', 3, 'I. Formation'], ['II. Defenses', 2, 'II. Defenses']]);
    assert.equal(data.outline[0].text, 'An offer is a manifestation.');
    assert.deepEqual(data.cards.map((c) => c.id), ['c1']);
    assert.deepEqual(data.sets.map((s) => s.slug), ['current'], 'archived sets are left out');
    assert.ok(fs.existsSync(path.join(dist, 'play/data/sample-course/current.json')), 'questions come from play/data');
    const page = read('listen/sample-course/index.html');
    assert.match(page, /Play/);
    assert.match(read('subjects/sample-course/index.html'), /href="\.\.\/\.\.\/listen\/sample-course\/"[^>]*>[\s\S]*?Listen \(hands-free\)/);
    assert.match(read('sitemap.xml'), /listen\/sample-course\//);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
