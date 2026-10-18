import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let sharp;try{sharp=require('sharp');}catch{sharp=require(process.env.SHARP_PATH);}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const ids=new Set(manifest.assets.map(a=>a.id));
assert.equal(ids.size,manifest.assets.length,'duplicate asset IDs');
assert.equal(manifest.assets.length,143,'unexpected package size');
assert.equal(manifest.counts.total,manifest.assets.length);
let alphaImages=0,spriteFrames=0,wavs=0,vectors=0;
for(const a of manifest.assets){
 assert(!path.isAbsolute(a.src)&&!a.src.includes('..')&&!a.src.includes('\\'),'non-portable path '+a.id);
 const file=path.join(root,a.src),stat=await fs.stat(file);assert(stat.size>0);assert.equal(stat.size,a.bytes);
 if(a.counterpart){assert(ids.has(a.counterpart),'missing counterpart '+a.id);assert.equal(manifest.assets.find(b=>b.id===a.counterpart).counterpart,a.id);}
 if(a.type==='image'||a.type==='spritesheet'){
  assert(a.src.endsWith('.webp'));const meta=await sharp(file).metadata();assert.equal(meta.width,a.width);assert.equal(meta.height,a.height);await fs.access(path.join(root,a.master));
  if(a.category!=='backgrounds'){assert(meta.hasAlpha,'no alpha '+a.id);assert(a.bounds.transparentFraction>.05,'no transparent margins '+a.id);alphaImages++;}
  if(a.frames)for(const [name,f]of Object.entries(a.frames)){
   assert(f.x>=0&&f.y>=0&&f.x+f.width<=a.width&&f.y+f.height<=a.height,'frame out of range '+a.id);
   assert(f.bounds.width>f.width*.15&&f.bounds.height>f.height*(a.expansion?.08:.35),'empty/tiny character '+a.id+' '+name);
   assert(f.anchor.x>=0&&f.anchor.x<=1&&f.anchor.y>=0&&f.anchor.y<=1);spriteFrames++;
  }
  if(a.animations)for(const animation of Object.values(a.animations))for(const frame of animation.frames)assert(frame in a.frames);
 }
 if(a.type==='vector'){
  const svg=await fs.readFile(file,'utf8');assert(svg.startsWith('<svg'));assert(!/https?:\/\/(?!www.w3.org)|<script|<image|<foreignObject/i.test(svg),'unexpected external SVG content');
  const meta=await sharp(file).metadata();assert.equal(meta.width,a.width);assert.equal(meta.height,a.height);vectors++;
 }
 if(a.type==='audio'){
  assert(a.src.endsWith('.ogg'));assert(a.sources.some(s=>s.src.endsWith('.m4a')));const wav=await fs.readFile(path.join(root,a.master));assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');assert.equal(wav.readUInt32LE(40),wav.length-44);
  assert.equal(wav.readUInt32LE(24),44100);assert.equal(wav.readUInt16LE(34),16);
  let peak=0;for(let i=44;i<wav.length;i+=2)peak=Math.max(peak,Math.abs(wav.readInt16LE(i)));
  assert(peak>100&&peak<30000,'silent or clipped cue '+a.id);assert(Math.abs((wav.length-44)/(44100*2*a.channels)-a.duration)<.001);wavs++;
 }
}
const helper=await import('../examples/canvas-assets.mjs');
for(const [column,row]of [[0,0],[3,5],[-4,6],[.75,2.25]]){
 const screen=helper.isoToScreen(column,row);const grid=helper.screenToIso(screen.x,screen.y);
 assert(Math.abs(grid.column-column)<1e-9&&Math.abs(grid.row-row)<1e-9);
}
const report={assets:ids.size,transparentRasterImages:alphaImages,spriteFrames,renderableSVGs:vectors,validAudioFiles:wavs,relativePaths:true,counterparts:true,projectionRoundTrips:true};
await fs.writeFile(path.join(root,'source/validation-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));

