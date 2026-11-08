// The games (Sanctum Run, Crypt Survivors) are local-only: the published build (npm run build, which
// the deploy runs) has no game pages, code, art or links, while `--games` (npm run dev:games) builds
// them. The question data in play/data/ is built either way, for Shuffle mode and Your stats.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function buildSample(extra = []) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'games-local-'));
  const dir = path.join(tmp, 'content', 'Sample Course');
  fs.mkdirSync(dir, { recursive: true });
  const QB = [{ id: '1', area: 'Formation', tag: 'Offers', stem: 'Is an advertisement an offer?', o: [['Usually not', 'It is an invitation.'], ['Always', 'Too broad.']] }];
  fs.writeFileSync(path.join(dir, 'Sample_Quiz.html'), `<title>Sample Quiz</title><body><script>const QB = ${JSON.stringify(QB)};</script></body>`);
  fs.writeFileSync(path.join(dir, 'subject.json'), JSON.stringify({ title: 'Sample Course', documents: { 'Sample_Quiz.html': { type: 'practice' } } }));
  const dist = path.join(tmp, 'dist');
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), ...extra], { cwd: ROOT, env: { ...process.env, SITE_CONTENT_DIR: path.join(tmp, 'content'), SITE_DIST_DIR: dist }, stdio: 'pipe' });
  return { tmp, dist, has: (rel) => fs.existsSync(path.join(dist, rel)), read: (rel) => fs.readFileSync(path.join(dist, rel), 'utf8') };
}

test('the published build leaves the games out and keeps the question data', () => {
  const site = buildSample();
  try {
    for (const rel of ['play/index.html', 'play/game.js', 'play/pack', 'survivors']) assert.ok(!site.has(rel), `${rel} is published`);
    assert.ok(site.has('play/data/index.json'), 'Shuffle mode and Your stats need play/data/');
    assert.ok(site.has('shuffle/index.html') && site.has('stats/index.html'));
    const pages = ['index.html', 'subjects/sample-course/index.html', 'stats/index.html', 'shuffle/index.html', 'sitemap.xml'];
    for (const p of pages) assert.doesNotMatch(site.read(p), /href="[^"]*(?:play|survivors)\/(?:\?[^"]*)?"|Sanctum Run|Crypt Survivors|\/play\/<|\/survivors\/</, p);
  } finally { fs.rmSync(site.tmp, { recursive: true, force: true }); }
});

test('a --games build has both games and links to them', () => {
  const site = buildSample(['--games']);
  try {
    for (const rel of ['play/index.html', 'play/game.js', 'survivors/index.html', 'survivors/game.js']) assert.ok(site.has(rel), `${rel} is missing`);
    const home = site.read('index.html');
    assert.match(home, /href="\.\/play\/"/);
    assert.match(home, /href="\.\/survivors\/"/);
    assert.match(site.read('subjects/sample-course/index.html'), /survivors\/\?course=sample-course/);
  } finally { fs.rmSync(site.tmp, { recursive: true, force: true }); }
});

test('npm run dev:games builds the games', () => {
  const { scripts } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.match(scripts['dev:games'], /build\.mjs --games/);
  assert.doesNotMatch(scripts.build, /--games/);
});
