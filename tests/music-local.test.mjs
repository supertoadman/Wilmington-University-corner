// Music stays on the owner's computer: no playlist is published or committed, and Sanctum Run and
// Crypt Survivors play sound effects only (see README, "Music (kept local)").
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const built = fs.existsSync(path.join(DIST, 'api', 'catalog.json'));

test('no audio under content/ is committed', () => {
  const tracked = execFileSync('git', ['ls-files', 'content'], { cwd: ROOT, encoding: 'utf8' }).split('\n');
  assert.deepEqual(tracked.filter((f) => /\.(mp3|wav|m4a|ogg)$/i.test(f)), []);
  assert.match(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8'), /^content\/\*\*\/\*\.mp3$/m);
});

test('the course playlists are unpublished', () => {
  for (const dir of fs.readdirSync(path.join(ROOT, 'content'))) {
    const file = path.join(ROOT, 'content', dir, 'subject.json');
    if (!fs.existsSync(file)) continue;
    for (const [name, meta] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')).documents || {})) {
      if (meta.type === 'music' || /playlist/i.test(name)) assert.equal(meta.publish, false, `${dir}/${name}`);
    }
  }
});

test('Sanctum Run starts no music', () => {
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'src', 'game', 'game.js'), 'utf8'), /audio\.mix\(|music-loop|menu-music/);
});

test('Crypt Survivors starts no music', () => {
  for (const f of ['game.js', 'audio.js']) assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'src', 'survivors', f), 'utf8'), /startMusic|music-loop/, f);
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'scripts', 'survivors.mjs'), 'utf8'), /'[\w-]*music[\w-]*'/);
});

test('the built site has no music documents or game music', { skip: !built && 'run npm run build first' }, () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(DIST, 'api', 'catalog.json'), 'utf8'));
  assert.deepEqual(catalog.documents.filter((d) => d.type === 'music').map((d) => d.id), []);
  const pack = JSON.parse(fs.readFileSync(path.join(DIST, 'play', 'pack', 'pack.json'), 'utf8'));
  assert.deepEqual(Object.keys(pack.assets).filter((id) => /music/.test(id)), []);
  const files = fs.readdirSync(path.join(DIST, 'play', 'pack', 'audio'), { recursive: true }).map(String);
  assert.deepEqual(files.filter((f) => /music/.test(f)), []);
  assert.ok(Object.keys(pack.assets).includes('jump'), 'sound effects still ship');
  const sv = JSON.parse(fs.readFileSync(path.join(DIST, 'survivors', 'pack', 'pack.json'), 'utf8'));
  assert.deepEqual(Object.keys(sv.audio).filter((id) => /music/.test(id)), []);
  assert.deepEqual(fs.readdirSync(path.join(DIST, 'survivors', 'pack', 'audio')).filter((f) => /music/.test(f)), []);
  assert.ok(Object.keys(sv.audio).includes('enter-corrupt'), 'Crypt Survivors keeps its stings');
});
