// The hands-free Listen page's play list (src/assets/listen-queue.js), and the per-course data the
// build writes for it (listen/<course>/data.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildQueue, courseQueue, courseResume, daysOf, speechChunks, speakable, resumeAt, readSettings, groupsOf, areaOf, minutesOf, recordingFor, silenceWav } from '../src/assets/listen-queue.js';
import { forEar, rankVoices, pickVoices, genderOf, citeNumber } from '../src/assets/listen-voice.js';
import { normalizeListen, readListen, recFile, renderJobs, attachRecordings } from '../scripts/lib/listen.mjs';

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
  assert.equal(speakable('Under § 2-207 and §§ 2-312, 2-313'), 'Under section two dash two oh seven and sections two dash three twelve, two dash three thirteen');
  assert.equal(speakable('Roth Steel v. Sharon Steel, e.g. the UCC rule'), 'Roth Steel versus Sharon Steel, for example, the U C C rule');
  assert.equal(speakable('FRE 403 | balancing'), 'Rule four-oh-three. balancing');
});

test('citations are rewritten for the ear', () => {
  const cases = [
    ['Rule 803(2)', 'Rule eight-oh-three, two'],
    ['FRE 801(d)(2)(A)', 'Rule eight-oh-one, d, two, A'],
    ['MR 1.7(a)(2)', 'Rule one point seven, a, two'],
    ['Rule 1.7(a)(2)', 'Rule one point seven, a, two'],
    ['Model Rule 1.10(a)', 'Model Rule one point ten, a'],
    ['§ 2-207', 'section two dash two oh seven'],
    ['Rule 1.6 cmt. 5', 'Rule one point six comment five'],
    ['Smith v. Jones', 'Smith versus Jones'],
    ['e.g. this; i.e. that', 'for example, this; that is, that'],
    ['pp. 4-5', 'pages 4-5'],
    ['Ohio v. Roberts, 448 U.S. 56, 66 (1980), held', 'Ohio versus Roberts, 1980, held'],
    ['United States v. Doe, 960 F.2d 221 (1st Cir. 1992).', 'United States versus Doe, 1992.'],
    ['Rule 404(b)(2) and FRE 412', 'Rule four-oh-four, b, two and Rule four-twelve'],
    ['FRE applies', 'F R E applies'],
  ];
  for (const [from, to] of cases) assert.equal(forEar(from), to, from);
  assert.equal(citeNumber('1101'), 'eleven-oh-one');
  assert.equal(citeNumber('400'), 'four hundred');
  assert.equal(citeNumber('105'), 'one-oh-five');
});

const V = (name, lang = 'en-US', extra = {}) => ({ name, lang, default: false, ...extra });
const VOICES = [
  V('Microsoft David - English (United States)', 'en-US', { default: true }),
  V('Microsoft Zira - English (United States)'),
  V('Google Deutsch', 'de-DE'),
  V('Microsoft Andrew Online (Natural) - English (United States)'),
  V('Microsoft Ava Online (Natural) - English (United States)'),
  V('Samantha', 'en-US'),
  V('Google UK English Male', 'en-GB'),
  V('Microsoft Libby Online (Natural) - English (United Kingdom)', 'en-GB'),
];
test('voices are ranked: natural voices of the asked gender first', () => {
  assert.equal(rankVoices(VOICES, 'female')[0].name, 'Microsoft Ava Online (Natural) - English (United States)');
  assert.equal(rankVoices(VOICES, 'female')[1].name, 'Microsoft Libby Online (Natural) - English (United Kingdom)');
  assert.equal(rankVoices(VOICES, 'male')[0].name, 'Microsoft Andrew Online (Natural) - English (United States)');
  assert.equal(genderOf(V('Google UK English Female')), 'female');
  assert.equal(genderOf(V('Daniel (Enhanced)', 'en-GB')), 'male');
  // Without a known name, an English voice beats a foreign one, and the wrong gender comes last.
  const plain = [V('Google Deutsch', 'de-DE'), V('Microsoft Mark'), V('Some Voice', 'en-US')];
  assert.deepEqual(rankVoices(plain, 'female').map((v) => v.name), ['Some Voice', 'Google Deutsch', 'Microsoft Mark']);
  assert.equal(rankVoices([], 'female').length, 0);
  // The main voice and the other one for "alt" lines; a picked voice wins.
  const p = pickVoices(VOICES, { gender: 'female' });
  assert.match(p.main.name, /Ava/);
  assert.match(p.alt.name, /Andrew/);
  assert.equal(pickVoices(VOICES, { gender: 'female', name: 'Samantha' }).main.name, 'Samantha');
  assert.equal(pickVoices([V('Only One')], { gender: 'male' }).alt, null, 'no second voice to tell apart');
});

const COURSE = {
  id: 'ev', title: 'Evidence', days: [
    { day: 1, title: 'Relevance', episodes: [
      { id: 'd1-a', title: 'A', minutes: 3, segments: [{ id: 'i', say: 'Under FRE 401, any tendency.' }, { say: 'Really?', voice: 'alt' }, { id: 'q', ask: 'Relevant?', answer: 'Yes.', pause: 8 }, { pause: 2 }] },
      { id: 'd1-b', title: 'B', segments: [{ say: 'Rule 403.' }, { ask: 'Lean?', answer: 'Admit.' }] },
    ] },
    { day: 2, title: 'Hearsay', episodes: [{ id: 'd2-a', title: 'C', segments: [{ say: 'Rule 803(2).' }] }] },
  ],
};
test('an audio course plays episode by episode, asks with a pause, then the answer', () => {
  const q = courseQueue(COURSE, { scale: 1 });
  assert.deepEqual(q.map((x) => [x.key, x.day]), [['d1-a', 1], ['d1-b', 1], ['d2-a', 2]]);
  const a = q[0].segments;
  assert.deepEqual(a.map((s) => s.role), ['say', 'alt', 'ask', 'answer', 'pause']);
  assert.deepEqual(a.map((s) => s.sid), ['i', 's1', 'q', 'q:a', 's3']);
  assert.equal(a[0].text, 'Under FRE 401, any tendency.', 'the transcript keeps the text');
  assert.equal(a[0].say, 'Under Rule four-oh-one, any tendency.', 'the voice hears it said');
  assert.equal(a[1].voice, 'alt');
  assert.equal(a[2].pause, 8000);
  assert.equal(a[4].say, '');
  assert.equal(q[1].segments[1].pause, 7000, 'an ask without a pause waits 7 seconds');
  assert.equal(courseQueue(COURSE, { scale: 2.5 })[1].segments[1].pause, 17500, 'the pause control scales it');
  assert.equal(q[0].label, 'Day 1 · Episode 1 of 2');
  assert.deepEqual(daysOf(q).map((d) => [d.day, d.items]), [[1, [0, 1]], [2, [2]]]);
  // Resume: the saved episode and segment, else the first unfinished episode.
  assert.deepEqual(courseResume(q, { key: 'd1-a', seg: 'q' }), { idx: 0, seg: 2 });
  assert.deepEqual(courseResume(q, { key: 'gone', done: ['d1-a'] }), { idx: 1, seg: 0 });
  assert.deepEqual(courseResume(q, {}), { idx: 0, seg: 0 });
  const s = readSettings({ mode: 'materials', gender: 'male', audio: { ev: { key: 'd1-b', seg: 's0', done: ['d1-a', 'd1-a', 3] } }, rate: 0.95 });
  assert.equal(s.mode, 'materials');
  assert.equal(s.gender, 'male');
  assert.deepEqual(s.audio.ev, { key: 'd1-b', seg: 's0', done: ['d1-a'] });
  assert.equal(readSettings({}).gender, 'female');
  assert.equal(readSettings({}).rate, 0.9);
  assert.equal(readSettings({}).mode, 'course');
});

test('listen/v1 files are checked: bad segments and empty episodes are reported and dropped', () => {
  const sample = readListen(fs.readFileSync(path.join(ROOT, 'docs/templates/sample.listen.json'), 'utf8'));
  const ok = normalizeListen(sample);
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.warnings, []);
  assert.equal(ok.course.days.length, 2);
  assert.equal(readListen('{"format":"cards/v1"}'), null);
  const bad = normalizeListen({ format: 'listen/v1', id: 'x', title: 'X', description: 'x', days: [
    { day: 1, title: 'One', episodes: [
      { id: 'e1', title: 'E1', segments: [{ say: 'Fine.' }, { ask: 'No answer?' }, { nonsense: 1 }, { pause: -1 }] },
      { id: 'e1', title: 'Dup', segments: [{ say: 'x' }] },
      { id: 'e2', title: 'Empty', segments: [] },
    ] },
    { day: 2, title: 'Two', episodes: [] },
  ] });
  assert.equal(bad.errors.length, 4, bad.errors.join('\n'));
  assert.ok(bad.warnings.some((w) => /e2.*empty/.test(w)));
  assert.ok(bad.warnings.some((w) => /Day 2: no episodes/.test(w)));
  assert.deepEqual(bad.course.days.map((d) => d.episodes.map((e) => e.id)), [['e1']]);
  assert.deepEqual(bad.course.days[0].episodes[0].segments, [{ say: 'Fine.' }]);
  assert.match(normalizeListen({ format: 'listen/v1' }).errors.join(' '), /"id" is missing.*"days"/);
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
  assert.equal(readSettings('nonsense').rate, 0.9);
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
    fs.copyFileSync(path.join(ROOT, 'docs/templates/sample.listen.json'), path.join(dir, 'Course.listen.json'));
    // One recorded line (scripts/listen-render.mjs writes these to listen-audio/, beside content/).
    fs.mkdirSync(path.join(tmp, 'listen-audio'));
    const recorded = recFile('af_nicole', 'Welcome to Day 1. Today is about relevance, the first gate every piece of evidence has to pass.');
    fs.writeFileSync(path.join(tmp, 'listen-audio', recorded), 'mp3');
    fs.writeFileSync(path.join(dir, 'Old.listen.json'), JSON.stringify({ format: 'listen/v1', id: 'old', title: 'Old', days: [{ day: 1, title: 'x', episodes: [{ id: 'o', title: 'o', segments: [{ say: 'old' }] }] }] }));
    fs.writeFileSync(path.join(dir, 'subject.json'), JSON.stringify({ title: 'Sample Course', refs: { outline: 'sample-outline' }, documents: { 'Old.mcq.json': { archived: true }, 'Old.listen.json': { archived: true } } }));
    const dist = path.join(tmp, 'dist');
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, env: { ...process.env, SITE_CONTENT_DIR: path.join(tmp, 'content'), SITE_DIST_DIR: dist }, stdio: 'pipe' });
    const read = (rel) => fs.readFileSync(path.join(dist, rel), 'utf8');
    const data = JSON.parse(read('listen/sample-course/data.json'));
    assert.deepEqual(data.outline.map((s) => [s.title, s.level, s.part]), [['I. Formation', 2, 'I. Formation'], ['Cases', 3, 'I. Formation'], ['II. Defenses', 2, 'II. Defenses']]);
    assert.equal(data.outline[0].text, 'An offer is a manifestation.');
    assert.deepEqual(data.cards.map((c) => c.id), ['c1']);
    assert.deepEqual(data.sets.map((s) => s.slug), ['current'], 'archived sets are left out');
    assert.ok(fs.existsSync(path.join(dist, 'play/data/sample-course/current.json')), 'questions come from play/data');
    assert.deepEqual(data.audio.map((c) => c.id), ['evidence-sample-audio'], 'archived audio courses are left out');
    assert.equal(data.audio[0].days[0].episodes[0].segments[0].id, 'intro');
    assert.deepEqual(data.audio[0].days[0].episodes[0].segments[0].rec, { af_nicole: recorded }, 'a recorded line is linked');
    assert.equal(data.audio[0].days[0].episodes[0].segments[1].rec, undefined, 'a line without a file is not');
    assert.ok(fs.existsSync(path.join(dist, 'listen/sample-course/audio', recorded)), 'and its file is published');
    const page = read('listen/sample-course/index.html');
    assert.match(page, /Play/);
    assert.match(page, /recorded in natural Kokoro voices/);
    assert.match(page, /value="course" data-ls-mode checked/, 'the audio course is the default mode');
    assert.match(page, /Female voice[\s\S]*Male voice/);
    assert.doesNotMatch(read('subjects/sample-course/index.html'), /listen\.json|Evidence in Two Days/, 'the audio course is not listed as a document');
    assert.match(read('subjects/sample-course/index.html'), /href="\.\.\/\.\.\/listen\/sample-course\/"[^>]*>[\s\S]*?Listen \(hands-free\)/);
    assert.match(read('sitemap.xml'), /listen\/sample-course\//);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('recorded lines: one file per line and voice, linked when it exists, played when the voice is left on best', () => {
  const sample = normalizeListen(readListen(fs.readFileSync(path.join(ROOT, 'docs/templates/sample.listen.json'), 'utf8'))).course;
  assert.equal(recFile('af_nicole', 'Rule 803(2).'), recFile('af_nicole', 'Rule 803(2).'));
  assert.notEqual(recFile('af_nicole', 'Rule 803(2).'), recFile('am_michael', 'Rule 803(2).'));
  assert.match(recFile('af_nicole', 'x'), /^af_nicole-[0-9a-f]{16}\.mp3$/);
  const jobs = renderJobs(sample);
  // 8 say lines + 3 asks (question and answer each) = 14 lines; the one alt line is Michael's.
  assert.equal(jobs.length, 14);
  assert.deepEqual(jobs.filter((j) => j.voice === 'am_michael').map((j) => j.text), ['So a photo of the intersection is relevant even if it only helps a little?']);
  assert.equal(renderJobs(sample, ['female', 'male']).length, 28);
  const all = new Set(jobs.map((j) => j.file));
  const { course, files } = attachRecordings(sample, (f) => all.has(f));
  assert.equal(files.length, 14);
  const ask = course.days[0].episodes[0].segments.find((x) => x.ask);
  assert.ok(ask.rec.af_nicole && ask.answerRec.af_nicole);
  const q = courseQueue(course);
  const first = q[0].segments[0];
  const alt = q[0].segments.find((x) => x.role === 'alt');
  assert.equal(recordingFor(first), first.rec.af_nicole);
  assert.equal(recordingFor(alt), alt.rec.am_michael, 'an alt line plays the other voice');
  assert.equal(recordingFor(first, { voice: 'Samantha' }), null, 'a browser voice picked by name is used instead');
  assert.equal(recordingFor(first, { gender: 'male' }), null, 'the male setting needs its own recordings');
  assert.equal(recordingFor(q[0].segments.find((x) => x.role === 'answer')), ask.answerRec.af_nicole);
  const w = silenceWav(1000);
  assert.equal(w.length, 44 + 16000);
  assert.equal(String.fromCharCode(...w.slice(8, 12)), 'WAVE');
});
