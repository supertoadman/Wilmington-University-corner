// Build step for Crypt Survivors (/survivors/): its code, and its runtime pack.
//
// - Questions: none of its own. The game reads play/data/ (written by scripts/game.mjs from every
//   practice set in content/), so a new practice set shows up here with no extra step.
// - survivors/pack/atlas.png + atlas.json: every tile in Assets/survivors/tiles/ (CC0, from crawl/tiles;
//   see Assets/survivors/LICENSE.md) packed into one image, with each tile's opaque bounds.
// - survivors/pack/audio/: a few stings from Assets/temple run/. No music: it stays off the site (see
//   README). Combat sounds are synthesized.

import fs from 'node:fs';
import path from 'node:path';
import { decodePng, encodePng } from './lib/png.mjs';

const TILE = 32;
const COLS = 16;
const AUDIO = ['enter-corrupt', 'enter-divine', 'collect-laurel', 'activate-aegis', 'divine-game-over', 'corrupt-game-over'];

function packAtlas(root) {
  const dir = path.join(root, 'Assets', 'survivors', 'tiles');
  if (!fs.existsSync(dir)) return null;
  const ids = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)).sort();
  const rows = Math.ceil(ids.length / COLS);
  const width = COLS * TILE;
  const height = rows * TILE;
  const data = new Uint8Array(width * height * 4);
  const frames = {};
  ids.forEach((id, n) => {
    const img = decodePng(fs.readFileSync(path.join(dir, `${id}.png`)));
    const ox = (n % COLS) * TILE;
    const oy = Math.floor(n / COLS) * TILE;
    let x0 = TILE, y0 = TILE, x1 = -1, y1 = -1;
    for (let y = 0; y < Math.min(TILE, img.height); y++) {
      for (let x = 0; x < Math.min(TILE, img.width); x++) {
        const s = (y * img.width + x) * 4;
        const d = ((oy + y) * width + ox + x) * 4;
        data.set(img.data.subarray(s, s + 4), d);
        if (img.data[s + 3] > 24) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      }
    }
    // [x, y, w, h] of the tile in the atlas, then the opaque box inside it [bx, by, bw, bh].
    frames[id] = [ox, oy, TILE, TILE, ...(x1 < 0 ? [0, 0, TILE, TILE] : [x0, y0, x1 - x0 + 1, y1 - y0 + 1])];
  });
  return { png: encodePng({ width, height, data }), json: { tile: TILE, width, height, frames } };
}

function copyAudio(root, dist) {
  const src = path.join(root, 'Assets', 'temple run');
  const manifestFile = path.join(src, 'manifest.json');
  if (!fs.existsSync(manifestFile)) return { audio: {}, bytes: 0 };
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const audio = {};
  let bytes = 0;
  for (const id of AUDIO) {
    const a = manifest.assets.find((x) => x.id === id && x.type === 'audio');
    if (!a) { console.warn(`  survivors: no audio "${id}" in the temple run pack`); continue; }
    const sources = [];
    for (const s of a.sources) {
      const from = path.join(src, s.src);
      if (!fs.existsSync(from)) continue;
      const rel = `audio/${path.basename(s.src)}`;
      fs.mkdirSync(path.join(dist, 'survivors', 'pack', 'audio'), { recursive: true });
      fs.copyFileSync(from, path.join(dist, 'survivors', 'pack', rel));
      bytes += fs.statSync(from).size;
      sources.push({ src: rel, type: s.mimeType, loopStart: s.loopStart ?? 0 });
    }
    audio[id] = { duration: a.duration, loop: !!a.loop, sources };
  }
  return { audio, bytes };
}

export function buildSurvivors({ root, dist, write }) {
  fs.cpSync(path.join(root, 'src', 'survivors'), path.join(dist, 'survivors'), { recursive: true, filter: (f) => !f.endsWith('.html') });
  const atlas = packAtlas(root);
  if (atlas) write('survivors/pack/atlas.png', atlas.png);
  const { audio, bytes } = copyAudio(root, dist);
  write('survivors/pack/pack.json', JSON.stringify({ atlas: atlas ? atlas.json : null, audio }));
  const total = (atlas ? atlas.png.length : 0) + bytes;
  console.log(`Survivors: ${atlas ? Object.keys(atlas.json.frames).length : 0} sprites, ${(total / 1048576).toFixed(1)} MB pack`);
  return { sprites: atlas ? Object.keys(atlas.json.frames).length : 0, bytes: total, atlas: atlas ? atlas.json : null };
}
