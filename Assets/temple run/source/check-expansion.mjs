import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const byId=new Map(manifest.assets.map(a=>[a.id,a]));
const report={individualFrames:0,moveSets:0,chaserCycles:0,props:0,backgrounds:[],audio:[]};
for(const theme of ['divine','corrupt']){
 for(const name of ['socrates','plato','aristotle','chaser']){
  const a=byId.get(theme+'-'+name+(name==='chaser'?'-run':'-moves'));assert(a);
  const expected=name==='chaser'?{run:6}:{run:6,jump:3,slide:3,stumble:2,fall:3,idle:1};
  for(const [move,count]of Object.entries(expected))assert.equal(a.animations[move].frames.length,count,a.id+' '+move);
  const hashes=new Set();
  for(const f of Object.values(a.frames)){
   assert.deepEqual(f.anchor,{x:.5,y:1});const buffer=await fs.readFile(path.join(root,f.master)),meta=await sharp(buffer).metadata();
   assert.equal(meta.width,640);assert.equal(meta.height,640);assert(meta.hasAlpha);assert.equal(buffer.length,f.masterBytes);
   const combined=await sharp(path.join(root,a.master)).extract({left:f.x,top:f.y,width:f.width,height:f.height}).raw().toBuffer(),individual=await sharp(buffer).raw().toBuffer();let difference=0;for(let i=0;i<combined.length;i++){if(i%4===3)assert.equal(combined[i],individual[i]);else difference=Math.max(difference,Math.abs(combined[i]-individual[i]));}assert(difference<=1,'master sheet and individual frame differ beyond compositing rounding');
   const {data,info}=await sharp(buffer).raw().toBuffer({resolveWithObject:true});
   let visible=0,zero=0;for(let i=3;i<data.length;i+=info.channels){if(data[i]>24)visible++;if(!data[i])zero++;}
   assert(visible>5000&&zero>640*640*.2,'bad frame alpha '+f.src);
   hashes.add(createHash('sha256').update(buffer).digest('hex'));report.individualFrames++;
  }
  assert.equal(hashes.size,Object.keys(a.frames).length,'duplicate frames '+a.id);
  if(name==='chaser')report.chaserCycles++;else report.moveSets++;
 }
 for(const suffix of ['slide-lintel-back','slide-lintel-front','dead-end-wall','gap-edge','toppled-statue','brazier-obstacle','statue','brazier','cypress','broken-wall','urn']){
  const a=byId.get(theme+'-'+suffix);assert(a);assert.equal(a.width,640);assert.equal(a.height,640);assert(a.alpha);report.props++;
 }
 for(const suffix of ['far-sky','middle-ruins',theme==='divine'?'near-clouds':'near-smoke']){
  const a=byId.get(theme+'-'+suffix);assert(a);assert.equal(a.width,2048);assert.equal(a.height,1024);assert.equal(a.repeat,'x');
  const raw=await sharp(path.join(root,a.src)).ensureAlpha().raw().toBuffer(),w=a.width,h=a.height;
  let jump=0,maxJump=0,normal=0;
  const sample=(x,y,c)=>{const i=(y*w+x)*4;return c===3?raw[i+3]:raw[i+c]*raw[i+3]/255;};
  for(let y=0;y<h;y++)for(let c=0;c<4;c++){
   const delta=Math.abs(sample(0,y,c)-sample(w-1,y,c));jump+=delta;maxJump=Math.max(maxJump,delta);
   for(const x of [1,32,128,512,1024,1536,2000])normal+=Math.abs(sample(x,y,c)-sample(x-1,y,c))/7;
  }
  const mean=jump/(h*4),reference=normal/(h*4);assert(mean<Math.max(3,reference*4),'visible seam discontinuity '+a.id);
  report.backgrounds.push({id:a.id,width:w,height:h,seamMeanChannelStep:mean,interiorMeanChannelStep:reference,seamMaxChannelStep:maxJump});
 }
}
for(const a of manifest.assets.filter(a=>a.src.startsWith('audio/expansion/'))){
 const wav=await fs.readFile(path.join(root,a.master)),channels=wav.readUInt16LE(22),rate=wav.readUInt32LE(24),count=(wav.length-44)/(channels*2);
 assert.equal(channels,2);assert.equal(rate,44100);assert(Math.abs(count/rate-a.duration)<1e-6);
 let peak=0,sum=0,maxStep=0;const previous=[0,0];
 for(let i=0;i<count;i++)for(let c=0;c<channels;c++){const v=wav.readInt16LE(44+(i*channels+c)*2);peak=Math.max(peak,Math.abs(v));sum+=v*v;if(i)maxStep=Math.max(maxStep,Math.abs(v-previous[c]));previous[c]=v;}
 assert(peak<30000&&peak>100);const rms=Math.sqrt(sum/(count*channels));assert(rms>40);
 let loopStep=null;
 if(a.loop){
  loopStep=Math.max(...previous.map((v,c)=>Math.abs(v-wav.readInt16LE(44+c*2))));
  assert(loopStep<Math.max(500,maxStep),'discontinuous loop '+a.id);assert.equal(a.masterLoopStartSample,0);assert.equal(a.masterLoopEndSample,count);
  if(a.id!=='menu-music')assert(a.duration>=60&&a.duration<=90);
 }
 report.audio.push({id:a.id,duration:a.duration,peak,rms,loopStep,maxStep});
}
assert.equal(report.individualFrames,120);assert.equal(report.props,22);assert.equal(report.backgrounds.length,6);assert.equal(report.audio.length,19);
await fs.writeFile(path.join(root,'source/expansion-validation-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
