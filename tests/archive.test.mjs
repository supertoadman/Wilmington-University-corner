// "archived": true on a document (subject.json or a .meta.json sidecar) keeps an earlier version
// built and linkable, but moves it to the course page's collapsed "Earlier versions", marks it in
// the API, and leaves it out of the default picks in Shuffle mode, the games and the Study Run.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const set = (id, title) => ({
  schema: 'mcq/v1', id, title, description: `${title}.`, areas: ['Formation'],
  questions: [{ id: '1', area: 'Formation', q: 'Is an advertisement an offer?', o: ['Usually not', 'Always'], a: 0, oe: ['Correct. It invites offers.', 'Too broad.'] }],
});

function buildSample() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-'));
  const dir = path.join(tmp, 'content', 'Sample Course');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'New_Questions.mcq.json'), JSON.stringify(set('new-questions', 'New Questions')));
  fs.writeFileSync(path.join(dir, 'Old_Questions.mcq.json'), JSON.stringify(set('old-questions', 'Old Questions')));
  fs.writeFileSync(path.join(dir, 'Older_Questions.mcq.json'), JSON.stringify(set('older-questions', 'Older Questions')));
  // One archived through subject.json, one through a sidecar.
  fs.writeFileSync(path.join(dir, 'Older_Questions.mcq.json.meta.json'), JSON.stringify({ archived: true }));
  fs.writeFileSync(path.join(dir, 'subject.json'), JSON.stringify({ title: 'Sample Course', documents: { 'Old_Questions.mcq.json': { archived: true } } }));
  const dist = path.join(tmp, 'dist');
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, env: { ...process.env, SITE_CONTENT_DIR: path.join(tmp, 'content'), SITE_DIST_DIR: dist }, stdio: 'pipe' });
  return { tmp, has: (rel) => fs.existsSync(path.join(dist, rel)), read: (rel) => fs.readFileSync(path.join(dist, rel), 'utf8') };
}

test('archived documents stay built, move to Earlier versions, and are marked in the API', () => {
  const site = buildSample();
  try {
    for (const slug of ['new-questions', 'old-questions', 'older-questions']) assert.ok(site.has(`subjects/sample-course/${slug}/index.html`), `${slug} is built`);
    const catalog = JSON.parse(site.read('api/catalog.json'));
    const byId = Object.fromEntries(catalog.documents.map((d) => [d.slug, d]));
    assert.equal(byId['new-questions'].archived, false);
    assert.equal(byId['old-questions'].archived, true);
    assert.equal(byId['older-questions'].archived, true);

    const page = site.read('subjects/sample-course/index.html');
    const [main, earlier] = page.split('class="archive-section"');
    assert.ok(earlier, 'the course page has an Earlier versions section');
    assert.match(earlier, /Earlier versions/);
    assert.match(main, /new-questions\//);
    assert.doesNotMatch(main.slice(main.indexOf('data-filter-list')), /old-questions\/|older-questions\//, 'archived documents are not in the main grid');
    assert.match(earlier, /old-questions\//);
    assert.match(earlier, /older-questions\//);
    assert.match(page, /<details class="archive-section">/, 'collapsed by default');

    const index = JSON.parse(site.read('play/data/index.json'));
    const sets = index.courses[0].sets;
    assert.equal(sets.find((s) => s.slug === 'new-questions').archived, undefined);
    assert.equal(sets.find((s) => s.slug === 'old-questions').archived, true);

    const shuffle = site.read('shuffle/index.html');
    assert.match(shuffle, /value="sample-course\/old-questions"[^>]*data-archived/);
    assert.match(shuffle, /class="shuffle-earlier"/);
    assert.doesNotMatch(shuffle, /value="sample-course\/new-questions"[^>]*data-archived/);
  } finally { fs.rmSync(site.tmp, { recursive: true, force: true }); }
});
