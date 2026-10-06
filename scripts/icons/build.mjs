// Draws the site's icon set into src/icons/*.svg (run `npm run icons` after editing glyphs.mjs).
// The SVGs are committed, so the regular site build never needs to run this.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLYPHS, build } from './glyphs.mjs';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'icons');
fs.mkdirSync(OUT, { recursive: true });
for (const name of Object.keys(GLYPHS)) {
  fs.writeFileSync(path.join(OUT, `${name}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="${build(name)}"/></svg>\n`);
}
console.log(`Drew ${Object.keys(GLYPHS).length} icons -> src/icons/`);
