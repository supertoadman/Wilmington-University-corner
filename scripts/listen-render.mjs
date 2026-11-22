// Renders the audio courses (content/<Subject>/*.listen.json) to recorded speech with Kokoro, one MP3
// per spoken line, in listen-audio/. Local only: it is slow (about a third of real time on a
// 6-core CPU) and the build never runs it. Lines already rendered are skipped, so it can be stopped
// and run again, and after editing a script it renders only the changed lines.
//
//   npm i --no-save kokoro-js@1.2.1 @breezystack/lamejs@1.2.7     (once; or set RENDER_DEPS=<folder>
//                                                                 holding a node_modules with both)
//   npm run listen:render                       every course, the female setting (Nicole, with Michael
//                                               for "alt" lines)
//   npm run listen:render -- Evidence --male    one subject folder; --male also renders the male setting
//   npm run listen:render -- --dry              list what is missing without rendering
//   npm run listen:render -- --limit 20         render only the first 20 missing lines (a trial)
//   npm run listen:render -- --threads 6        use more CPU threads (default: half the cores, low priority)
//
// After it finishes, commit listen-audio/ and push: the build links each line to its file.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readListen, normalizeListen, renderJobs, RENDER } from './lib/listen.mjs';
import { speakable, speechChunks } from '../src/assets/listen-queue.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = process.env.SITE_CONTENT_DIR || path.join(ROOT, 'content');
const OUT = path.join(path.dirname(CONTENT), 'listen-audio');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const genders = args.includes('--male') ? ['female', 'male'] : ['female'];
const limitAt = args.indexOf('--limit');
const limit = limitAt >= 0 ? Number(args.splice(limitAt, 2)[1]) : Infinity;
// Half the cores by default, at low priority: hours at full load can overheat a laptop.
const threadsAt = args.indexOf('--threads');
const threads = threadsAt >= 0 ? Math.max(1, Number(args.splice(threadsAt, 2)[1]) || 1) : Math.max(1, Math.floor(os.availableParallelism() / 2));
const only = args.filter((a) => !a.startsWith('--'));

async function load(name) {
  try { return await import(name); } catch (e) {
    const dir = process.env.RENDER_DEPS;
    if (!dir) throw new Error(`${name} is not installed: run npm i --no-save kokoro-js@1.2.1 @breezystack/lamejs@1.2.7 (or set RENDER_DEPS)`);
    // The package's ES module entry ("exports" import condition or "module"), else what require finds.
    const base = path.join(path.resolve(dir), 'node_modules', name);
    const pkg = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8'));
    const exp = pkg.exports?.['.'] ?? pkg.exports;
    const pick = (x) => (typeof x === 'string' ? x : x?.default ?? x?.import);
    const esm = [exp?.node?.import, exp?.import, exp?.default?.import, pkg.module].map(pick).find((x) => typeof x === 'string');
    const entry = esm ? path.join(base, esm) : createRequire(path.join(path.resolve(dir), 'package.json')).resolve(name);
    return import(pathToFileURL(entry).href);
  }
}

// The jobs: every spoken line of every course not yet rendered.
const jobs = [];
for (const dirent of fs.readdirSync(CONTENT, { withFileTypes: true })) {
  if (!dirent.isDirectory() || (only.length && !only.includes(dirent.name))) continue;
  for (const name of fs.readdirSync(path.join(CONTENT, dirent.name)).filter((n) => /\.listen\.json$/i.test(n)).sort()) {
    const raw = readListen(fs.readFileSync(path.join(CONTENT, dirent.name, name), 'utf8'));
    if (!raw) continue;
    const { course } = normalizeListen(raw);
    const all = renderJobs(course, genders);
    const todo = all.filter((j) => !fs.existsSync(path.join(OUT, j.file)));
    console.log(`${dirent.name}/${name}: ${all.length} lines, ${todo.length} to render`);
    jobs.push(...todo);
  }
}
const seen = new Set();
const todo = jobs.filter((j) => !seen.has(j.file) && seen.add(j.file)).slice(0, limit);
if (dry || !todo.length) { console.log(`${todo.length} lines to render`); process.exit(0); }

try { os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* not allowed */ }
const { KokoroTTS } = await load('kokoro-js');
// The model and tokenizer are loaded here (not with KokoroTTS.from_pretrained) to cap the threads.
const { StyleTextToSpeech2Model, AutoTokenizer } = await load('@huggingface/transformers');
const lame = await load('@breezystack/lamejs');
const Mp3Encoder = lame.Mp3Encoder || lame.default?.Mp3Encoder;
fs.mkdirSync(OUT, { recursive: true });
console.log(`Loading Kokoro (${RENDER.dtype}; the first run downloads the model)…`);
const tts = new KokoroTTS(
  await StyleTextToSpeech2Model.from_pretrained(RENDER.model, { dtype: RENDER.dtype, device: 'cpu', session_options: { intraOpNumThreads: threads, interOpNumThreads: 1 } }),
  await AutoTokenizer.from_pretrained(RENDER.model),
);
console.log(`Rendering on ${threads} thread${threads === 1 ? '' : 's'} (--threads N to change)`);

const GAP = new Float32Array(Math.round(RENDER.rate * 0.18));   // between the sentences of one line
function mp3(samples) {
  const enc = new Mp3Encoder(1, RENDER.rate, RENDER.kbps);
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) { const s = Math.max(-1, Math.min(1, samples[i] || 0)); pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
  const parts = [];
  for (let i = 0; i < pcm.length; i += 1152) { const b = enc.encodeBuffer(pcm.subarray(i, i + 1152)); if (b.length) parts.push(Buffer.from(b)); }
  const end = enc.flush();
  if (end.length) parts.push(Buffer.from(end));
  return Buffer.concat(parts);
}

const t0 = Date.now();
let secs = 0;
for (const [n, j] of todo.entries()) {
  const pieces = [];
  for (const chunk of speechChunks(speakable(j.text))) {
    const out = await tts.generate(chunk, { voice: j.voice, speed: RENDER.speed });
    if (pieces.length) pieces.push(GAP);
    pieces.push(out.audio);
  }
  const total = pieces.reduce((a, p) => a + p.length, 0);
  const all = new Float32Array(total);
  let at = 0;
  for (const p of pieces) { all.set(p, at); at += p.length; }
  // Write to a temporary name first, so a stopped run never leaves half a file under the real one.
  fs.writeFileSync(path.join(OUT, `${j.file}.tmp`), mp3(all));
  fs.renameSync(path.join(OUT, `${j.file}.tmp`), path.join(OUT, j.file));
  secs += total / RENDER.rate;
  if ((n + 1) % 25 === 0 || n === todo.length - 1) {
    const el = (Date.now() - t0) / 1000;
    console.log(`  ${n + 1} of ${todo.length} lines, ${Math.round(secs / 60)} min of audio in ${Math.round(el / 60)} min; about ${Math.round(((todo.length - n - 1) * el) / (n + 1) / 60)} min left`);
  }
}
console.log(`Done: ${todo.length} lines, ${Math.round(secs / 60)} minutes of audio in ${OUT}`);
