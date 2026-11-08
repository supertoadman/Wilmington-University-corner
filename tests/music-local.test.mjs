// Music stays on the owner's computer: no playlist is published or committed (see README,
// "Music (kept local)").
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

test('the built site has no music documents', { skip: !built && 'run npm run build first' }, () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(DIST, 'api', 'catalog.json'), 'utf8'));
  assert.deepEqual(catalog.documents.filter((d) => d.type === 'music').map((d) => d.id), []);
});
