// Re-encode existing exported masters without rebuilding artwork or synthesizing audio.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {compressAudio} from './compress-audio.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const m=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const pending=m.assets.filter(a=>['image','spritesheet'].includes(a.type));
await Promise.all(Array.from({length:4},async()=>{
 while(pending.length){const a=pending.shift();
  const bytes=await sharp(path.join(root,a.master)).resize(a.width,a.height,{fit:'fill'}).webp({quality:80,alphaQuality:a.category==='backgrounds'?85:50,lossless:a.id.startsWith('divine-slide-lintel-'),effort:4}).toBuffer();
  await fs.writeFile(path.join(root,a.src),bytes);a.bytes=bytes.length;
 }
}));
await compressAudio(root,m.assets);
m.runtimeBytes=m.assets.reduce((s,a)=>s+a.bytes+(a.sources?.slice(1).reduce((n,f)=>n+f.bytes,0)||0),0);
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(m,null,2)+'\n');
await fs.writeFile(path.join(root,'manifest.js'),'window.TEMPLE_ASSETS = '+JSON.stringify(m)+';\n');
await fs.writeFile(path.join(root,'source/export-report.json'),JSON.stringify({counts:m.counts,runtimeBytes:m.runtimeBytes,assets:m.assets.map(({id,width,height,alpha,bounds,bytes,sources})=>({id,width,height,alpha,bounds,bytes,sources}))},null,2)+'\n');
console.log(JSON.stringify({runtimeBytes:m.runtimeBytes,runtimeMB:m.runtimeBytes/1000000}));
