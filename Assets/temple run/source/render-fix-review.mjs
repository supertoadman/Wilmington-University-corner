import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),m=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8')),byId=new Map(m.assets.map(a=>[a.id,a]));
const layers=[];let row=0;
for(const theme of ['divine','corrupt'])for(const name of ['socrates','plato','aristotle']){
 const a=byId.get(`${theme}-${name}-moves`);
 layers.push({input:Buffer.from(`<svg width="720" height="26"><text x="12" y="20" fill="white" font-size="17" font-family="sans-serif">${theme} ${name} — fall-start / fall-air / fall-ground</text></svg>`),left:0,top:row*266});
 for(const [col,key] of ['fall-start','fall-air','fall-ground'].entries()){
  const f=a.frames[key];layers.push({input:await sharp(path.join(root,a.src)).extract({left:f.x,top:f.y,width:f.width,height:f.height}).resize(240,240).png().toBuffer(),left:col*240,top:row*266+26});
 }row++;
}
await sharp({create:{width:720,height:1596,channels:4,background:'#626467'}}).composite(layers).png().toFile(path.join(root,'previews/fall-direction-review.png'));
const beams=[];
for(const [i,theme] of ['divine','corrupt'].entries())for(const part of ['back','front'])beams.push({input:path.join(root,byId.get(`${theme}-slide-lintel-${part}`).src),left:i*640,top:0});
await sharp({create:{width:1280,height:640,channels:4,background:'#777573'}}).composite(beams).png().toFile(path.join(root,'previews/beam-seam-review.png'));
