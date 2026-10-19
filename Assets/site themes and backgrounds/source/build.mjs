import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_PATH || '../../temple run/node_modules/sharp');
const source = JSON.parse(await fs.readFile(path.join(root, 'source/prompts.json'), 'utf8'));
const themes = [];
let css = '/* Generated from source/prompts.json by source/build.mjs. Paths resolve relative to this CSS file. */\n';
for (const t of source.themes) {
  const original = `backgrounds/${t.id}.png`;
  const src = `backgrounds/${t.id}.webp`;
  const meta = await sharp(path.join(root, original)).metadata();
  await sharp(path.join(root, original)).webp({quality: 86, effort: 6}).toFile(path.join(root, src));
  const bytes = (await fs.stat(path.join(root, src))).size;
  const {prompt, reference, ...theme} = t;
  themes.push({...theme, src, original, width: meta.width, height: meta.height, bytes, position: 'center center'});
  css += `\n[data-site-theme="${t.id}"] {\n  color-scheme: ${t.realm === 'divine' ? 'light' : 'dark'};\n`;
  for (const [k, v] of Object.entries(t.palette)) css += `  --st-${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}: ${v};\n`;
  css += `  --st-art: url("./${src}");\n  --st-veil: ${t.realm === 'divine' ? 'rgba(244, 236, 220, .12)' : 'rgba(15, 12, 20, .18)'};\n}\n`;
}
css += `
/* Opt-in components. Put data-site-theme on the page or a containing element. */
.st-page { color: var(--st-text); background: var(--st-background); }
.st-backdrop { background-color: var(--st-background); background-image: linear-gradient(var(--st-veil), var(--st-veil)), var(--st-art); background-size: cover; background-position: center; }
.st-panel { color: var(--st-text); background: var(--st-surface); border: 1px solid var(--st-gold); border-radius: 16px; box-shadow: 0 16px 48px #0002; }
.st-muted { color: var(--st-muted); }
.st-link { color: var(--st-accent); text-underline-offset: .2em; }
.st-button { display: inline-block; color: var(--st-on-accent); background: var(--st-accent); border: 1px solid var(--st-accent); border-radius: 8px; padding: .8em 1.2em; font: inherit; font-weight: 650; text-decoration: none; cursor: pointer; }
.st-button:hover { box-shadow: 0 0 0 3px var(--st-gold); }
.st-button:focus-visible, .st-link:focus-visible { outline: 3px solid var(--st-accent); outline-offset: 4px; }
`;
await fs.writeFile(path.join(root, 'themes.css'), css);
const manifest = {schemaVersion:'1.0.0', name:'Sanctum — Site Themes and Backgrounds', created:source.created, generator:source.generator, themes};
await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await fs.writeFile(path.join(root, 'manifest.js'), 'window.SANCTUM_THEMES = ' + JSON.stringify(manifest, null, 2) + ';\n');
console.log(JSON.stringify({themes:themes.length, webpBytes:themes.reduce((n,t)=>n+t.bytes,0), dimensions:themes.map(t=>({id:t.id,width:t.width,height:t.height,bytes:t.bytes}))},null,2));
