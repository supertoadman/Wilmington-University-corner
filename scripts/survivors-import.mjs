// Copies the tiles that Crypt Survivors (/survivors/) draws from a checkout of crawl/tiles into
// Assets/survivors/tiles/. Only needed when changing the list in Assets/survivors/tiles.json; the
// build packs whatever is in Assets/survivors/tiles/ into one atlas (scripts/survivors.mjs).
//
// Usage:
//   git clone --depth 1 --filter=blob:none --sparse https://github.com/crawl/tiles crawl-tiles
//   git -C crawl-tiles sparse-checkout set releases/Nov-2015
//   node scripts/survivors-import.mjs crawl-tiles/releases/Nov-2015
//
// Every tile in that release is CC0 1.0 (see Assets/survivors/LICENSE.md). The script refuses any
// file named in the release's list of tiles under an unknown license, as a second check.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'Assets', 'survivors', 'tiles');
const release = process.argv[2];
if (!release || !fs.existsSync(release)) {
  console.error('Usage: node scripts/survivors-import.mjs <crawl-tiles>/releases/Nov-2015');
  process.exit(1);
}

const { tiles } = JSON.parse(fs.readFileSync(path.join(ROOT, 'Assets', 'survivors', 'tiles.json'), 'utf8'));
const unknownList = path.join(release, '..', '..', 'TILES_UNDER_UNKNOWN_LICENSE.md');
const excluded = new Set(fs.existsSync(unknownList)
  ? [...fs.readFileSync(unknownList, 'utf8').matchAll(/^- (\S+\.png)/gm)].map((m) => m[1]) : []);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let bytes = 0;
for (const [id, rel] of Object.entries(tiles)) {
  const from = path.join(release, rel);
  if (!fs.existsSync(from)) { console.error(`missing: ${rel}`); process.exitCode = 1; continue; }
  if (excluded.has(path.basename(rel))) { console.error(`not CC0 (unknown license): ${rel}`); process.exitCode = 1; continue; }
  fs.copyFileSync(from, path.join(OUT, `${id}.png`));
  bytes += fs.statSync(from).size;
}
console.log(`Copied ${Object.keys(tiles).length} tiles (${(bytes / 1024).toFixed(0)} KB) to Assets/survivors/tiles/`);
