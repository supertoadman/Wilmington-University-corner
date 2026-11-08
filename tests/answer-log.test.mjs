// The answer log behind Your stats (src/assets/answer-log.js): recording, the stored format,
// merging backups, and the summaries the stats page draws. Runs in one time zone so the day and
// week boundaries are fixed.
process.env.TZ = 'UTC';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LOG_KEY, MAX_ANSWERS, emptyLog, parseLog, serializeLog, addAnswer, entries, mergeLogs, summarize,
  missedKeys, splitTopic, record, loadLog, clearLog,
} from '../src/assets/answer-log.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = Date.UTC(2026, 10, 11, 15); // Wednesday, Nov 11 2026, 15:00
const DAY = 864e5;

// A log from rows: [days ago, set, n, topic, right, from]
function logOf(rows) {
  const log = emptyLog();
  for (const [ago, set, n, topic, right, from = 'shuffle'] of rows) addAnswer(log, { set, n, topic, right, from, at: NOW - ago * DAY });
  return log;
}

class Memory {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

test('splitTopic separates the area from the point tested', () => {
  assert.deepEqual(splitTopic('Hearsay — Present sense impression'), ['Hearsay', 'Present sense impression']);
  assert.deepEqual(splitTopic('Ch. 2 · The Religion Clauses'), ['Ch. 2 · The Religion Clauses', '']);
  assert.deepEqual(splitTopic(null), ['', '']);
});

test('answers are stored compactly, in time order, and survive a round trip', () => {
  const log = logOf([
    [1, 'evidence/bar', '1.1', 'Hearsay — Excited utterance', true],
    [3, 'evidence/bar', '1.2', 'Hearsay — Excited utterance', false],
    [2, 'sales-and-leases/bar', 14, 'Wk 1 · Formation — 2-207', true, 'run'],
  ]);
  assert.deepEqual(log.sets, ['evidence/bar', 'sales-and-leases/bar']);
  assert.equal(log.topics.length, 2);
  assert.deepEqual(log.a.map((e) => e[2]), ['1.2', '14', '1.1']); // oldest first; n is a string
  const back = parseLog(serializeLog(log));
  assert.deepEqual(back, log);
  const [first] = entries(back);
  assert.equal(first.course, 'evidence');
  assert.equal(first.area, 'Hearsay');
  assert.equal(first.tag, 'Excited utterance');
  assert.equal(first.right, false);
  assert.equal(entries(back)[1].from, 'run');
});

test('answers that cannot be named are ignored, and bad stored data is dropped', () => {
  const log = emptyLog();
  addAnswer(log, { set: 'not a set', n: 1, right: true });
  addAnswer(log, { set: 'evidence/bar', n: '', right: true });
  assert.equal(log.a.length, 0);
  assert.deepEqual(parseLog('not json'), emptyLog());
  assert.deepEqual(parseLog({ v: 2, sets: [], topics: [], a: [] }), emptyLog());
  const mixed = { v: 1, sets: ['evidence/bar'], topics: ['A — b'], a: [[100, 0, '1', 0, 1, 0], [100, 5, '1', 0, 1, 0], ['x', 0, '1', 0, 1, 0], [100, 0, '2', 0, 2, 0]] };
  assert.equal(parseLog(mixed).a.length, 1);
});

test('the log keeps the newest MAX_ANSWERS answers and drops names nothing uses', () => {
  const log = emptyLog();
  addAnswer(log, { set: 'old/set', n: 1, topic: 'Old — topic', right: true, at: NOW - 400 * DAY });
  for (let i = 0; i < MAX_ANSWERS; i++) log.a.push([Math.round((NOW - 100 * DAY) / 1000) + i, log.sets.length, String(i), -1, 1, 0]);
  log.sets.push('evidence/bar');
  addAnswer(log, { set: 'evidence/bar', n: 'new', right: false, at: NOW });
  assert.equal(log.a.length, MAX_ANSWERS);
  assert.ok(!log.sets.includes('old/set'), 'the set of the dropped answer goes');
  assert.ok(!log.topics.includes('Old — topic'));
  assert.equal(entries(log).at(-1).n, 'new');
});

test('merging two logs keeps every answer once, in time order', () => {
  const a = logOf([[5, 'evidence/bar', 1, 'Hearsay', true], [3, 'evidence/bar', 2, 'Hearsay', false]]);
  const b = logOf([[3, 'evidence/bar', 2, 'Hearsay', false], [1, 'contracts-i/bar', 7, 'Offer', true]]);
  const m = mergeLogs(serializeLog(a), b);
  assert.deepEqual(entries(m).map((e) => `${e.set}#${e.n}`), ['evidence/bar#1', 'evidence/bar#2', 'contracts-i/bar#7']);
  assert.deepEqual(entries(mergeLogs(m, m)).length, 3);
  assert.equal(entries(mergeLogs(null, a)).length, 2);
});

test('summarize: totals, streak, weeks, and the weakest topics', () => {
  const rows = [];
  // Hearsay: 2 of 8 right, the last answer to q3 wrong. Character: 5 of 6 right.
  for (let i = 0; i < 8; i++) rows.push([i % 4, 'evidence/bar', `h${i % 4}`, 'Hearsay — Layered hearsay', i < 2]);
  for (let i = 0; i < 6; i++) rows.push([i, 'evidence/comp', `c${i}`, 'Character Evidence — 404(b)', i !== 5]);
  // Few answers: never ranked, however bad.
  rows.push([0, 'evidence/bar', 'x1', 'Privileges — Spousal', false], [0, 'evidence/bar', 'x2', 'Privileges — Spousal', false]);
  // Another course, three weeks back.
  rows.push([21, 'contracts-i/bar', '1', 'Wk 1 · Offer — Advertisements', false]);
  const s = summarize(logOf(rows), { now: NOW });
  assert.equal(s.total, 17);
  assert.equal(s.right, 2 + 5);
  assert.equal(s.streak, 6); // today back to 5 days ago
  assert.equal(s.week.total, 16);
  assert.equal(s.prevWeek.total, 0);
  assert.equal(s.weeks.length, 12);
  assert.equal(s.weeks.reduce((n, w) => n + w.total, 0), 17);
  assert.equal(s.weeks.at(-1).start, Date.UTC(2026, 10, 9)); // the Monday of this week
  assert.deepEqual(s.weakest.map((a) => a.area), ['Hearsay', 'Character Evidence']);
  assert.equal(s.weakest[0].course, 'evidence');
  const ev = s.courses.find((c) => c.slug === 'evidence');
  assert.equal(s.courses[0].slug, 'evidence'); // most answered first
  assert.equal(ev.areas[0].area, 'Privileges'); // weakest first, few answers included here
  const hearsay = ev.areas.find((a) => a.area === 'Hearsay');
  assert.deepEqual(hearsay.tags.map((t) => t.tag), ['Layered hearsay']);
  // Latest answers: h0,h1 right (i=0,1)... then i=4..7 wrong for h0..h3, so all four are missed now.
  assert.equal(hearsay.missed.length, 4);
  assert.equal(s.missed, 4 + 1 + 2 + 1);
  assert.equal(summarize(logOf(rows), { now: NOW, course: 'contracts-i' }).total, 1);
});

test('a streak survives until the end of the next day', () => {
  const s = summarize(logOf([[1, 'evidence/bar', 1, 'A', true], [2, 'evidence/bar', 2, 'A', true], [4, 'evidence/bar', 3, 'A', true]]), { now: NOW });
  assert.equal(s.streak, 2);
  assert.equal(summarize(logOf([[2, 'evidence/bar', 1, 'A', true]]), { now: NOW }).streak, 0);
});

test('area names that differ only in case or spacing count as one topic', () => {
  const s = summarize(logOf([
    [0, 'con-law-ii/drill', 1, 'Ch. 1 · First Amendment Overview — x', true],
    [0, 'con-law-ii/concepts', 1, 'Ch. 1 ·  First Amendment overview — y', false],
  ]), { now: NOW });
  assert.equal(s.courses[0].areas.length, 1);
  assert.equal(s.courses[0].areas[0].total, 2);
});

test('missedKeys names the questions to drill', () => {
  const log = logOf([
    [3, 'evidence/bar', '1', 'Hearsay — a', false],
    [2, 'evidence/bar', '1', 'Hearsay — a', true],
    [2, 'evidence/bar', '2', 'Hearsay — b', false],
    [1, 'evidence/comp', '9', 'Character — c', false],
    [1, 'contracts-i/bar', '4', 'Offer', false],
  ]);
  assert.deepEqual([...missedKeys(log, { course: 'evidence' })].sort(), ['evidence/bar#2', 'evidence/comp#9']);
  assert.deepEqual([...missedKeys(log, { course: 'evidence', area: 'hearsay' })], ['evidence/bar#2']);
});

test('record reads and writes the stored log, and copes without storage', () => {
  const store = new Memory();
  assert.equal(record({ set: 'evidence/bar', n: 1, topic: 'Hearsay', right: true, from: 'practice' }, store), true);
  assert.equal(record({ set: 'evidence/bar', n: 2, topic: 'Hearsay', right: false, from: 'survivors' }, store), true);
  assert.equal(loadLog(store).a.length, 2);
  assert.ok(store.getItem(LOG_KEY).startsWith('{"v":1'));
  assert.equal(record({ set: 'evidence/bar', n: 3, right: true }, null), false);
  const full = { getItem: () => null, setItem() { throw new Error('QuotaExceededError'); } };
  assert.equal(record({ set: 'evidence/bar', n: 3, right: true }, full), false);
  clearLog(store);
  assert.equal(loadLog(store).a.length, 0);
});

test('every place that grades a question records it', () => {
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  assert.match(read('src/assets/shuffle.js'), /record\(\{ set: `\$\{q\.course\.slug\}\/\$\{q\.set\.slug\}`/);
  assert.match(read('src/game/game.js'), /record\(\{.*from: 'run'/);
  assert.match(read('src/survivors/game.js'), /record\(\{.*from: 'survivors'/);
  assert.match(read('src/practice/shell.js'), /new CustomEvent\('practice:answer'/);
  assert.match(read('src/assets/practice-log.js'), /addEventListener\('practice:answer'/);
});

test('the built site serves the stats page and adds the answer listener to canonical practice pages only', { skip: !fs.existsSync(path.join(ROOT, 'dist', 'stats', 'index.html')) && 'run npm run build first' }, () => {
  const dist = path.join(ROOT, 'dist');
  const page = fs.readFileSync(path.join(dist, 'stats', 'index.html'), 'utf8');
  assert.match(page, /data-stats/);
  assert.match(page, /assets\/stats\.js\?v=/);
  assert.match(fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8'), /\/stats\/</);
  const index = JSON.parse(fs.readFileSync(path.join(dist, 'play', 'data', 'index.json'), 'utf8'));
  let canonical = 0;
  for (const c of index.courses) {
    for (const s of c.sets) {
      const file = path.join(dist, 'files', c.slug, `${s.slug}.html`); // P.file(d) for an HTML set
      if (!fs.existsSync(file)) continue;
      const html = fs.readFileSync(file, 'utf8');
      const isShell = html.includes('id="mcq-data"');
      assert.equal(html.includes(`practice-log.js?v=`), isShell, `${c.slug}/${s.slug}`);
      if (isShell) { canonical++; assert.ok(html.includes(`set=${encodeURIComponent(`${c.slug}/${s.slug}`)}`), `${c.slug}/${s.slug} names its set`); }
    }
  }
  assert.ok(canonical > 0);
  // Downloads stay standalone: the template (a download, like the ZIP copies) loads no outside script.
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'docs', 'templates', 'mcq-shuffle-template.html'), 'utf8'), /<script[^>]+practice-log\.js/);
});
