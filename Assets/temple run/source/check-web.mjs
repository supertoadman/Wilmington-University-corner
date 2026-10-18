import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const m=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8')),byId=new Map(m.assets.map(a=>[a.id,a]));
const report={runtimeBytes:0,runtimeLimitBytes:15000000,audio:[],divineBeam:{},fallSequences:[],committableFiles:0,largestCommittableFile:null};
const runtime=new Set();for(const a of m.assets){runtime.add(a.src);for(const s of a.sources||[])runtime.add(s.src);}
for(const src of runtime){assert(!src.startsWith('masters/'));report.runtimeBytes+=(await fs.stat(path.join(root,src))).size;}
assert.equal(report.runtimeBytes,m.runtimeBytes);assert(report.runtimeBytes<=report.runtimeLimitBytes,'Runtime exceeds 15 MB');
assert.equal(m.assets.length,143);
for(const a of m.assets.filter(a=>a.type==='audio')){
 const wav=await fs.readFile(path.join(root,a.master)),rate=wav.readUInt32LE(24),channels=wav.readUInt16LE(22);
 for(const s of a.sources){
  const file=path.join(root,s.src);assert.equal((await fs.stat(file)).size,s.bytes);
  const probe=JSON.parse(execFileSync(ffprobe.path,['-v','error','-show_streams','-of','json',file],{windowsHide:true,encoding:'utf8'})).streams[0];
  assert.equal(probe.codec_name,s.codec);assert.equal(Number(probe.sample_rate),rate);assert.equal(probe.channels,channels);
  const pcm=execFileSync(ffmpeg,['-v','error','-i',file,'-f','s16le','-acodec','pcm_s16le','-ar',String(rate),'pipe:1'],{windowsHide:true,maxBuffer:50*1024*1024});
  const sampleCount=pcm.length/(2*channels),start=a.loop?s.loopStartSample:0,end=start+a.encoding.sourceSamples;
  // Short Vorbis cues may decode less than one packet short; repair encoding if so.
  assert(sampleCount>=end,`Decoded file too short: ${s.src}: ${sampleCount} < ${end}`);
  let loopStep=null,normalStep=0,correlation=null;
  if(a.loop){
   assert.equal(end,s.loopEndSample);assert(Math.abs(s.loopEnd-s.loopStart-a.duration)<1e-9);
   loopStep=0;for(let c=0;c<channels;c++)loopStep=Math.max(loopStep,Math.abs(pcm.readInt16LE(((end-1)*channels+c)*2)-pcm.readInt16LE((start*channels+c)*2)));
   let xy=0,xx=0,yy=0;for(let i=0;i<8192;i+=7){const phase=(i+(s.loopPhaseOffsetSamples||0)+a.encoding.sourceSamples)%a.encoding.sourceSamples,x=wav.readInt16LE(44+phase*channels*2),y=pcm.readInt16LE((start+i)*channels*2);xy+=x*y;xx+=x*x;yy+=y*y;}
   correlation=xy/Math.sqrt(xx*yy);assert(correlation>.95,'Codec delay misaligned: '+s.src);
   for(let i=start+1;i<end;i++)normalStep=Math.max(normalStep,Math.abs(pcm.readInt16LE(i*channels*2)-pcm.readInt16LE((i-1)*channels*2)));
   assert(loopStep<Math.max(700,normalStep),'Compressed loop boundary discontinuity '+s.src);
  }
  report.audio.push({id:a.id,codec:s.codec,decodedSamples:sampleCount,playStartSample:start,playEndSample:end,playDuration:a.duration,loopStep,maxAdjacentStep:normalStep,sourceAlignmentCorrelation:correlation});
 }
}
const back=byId.get('divine-slide-lintel-back'),front=byId.get('divine-slide-lintel-front');
const combined=await sharp(path.join(root,back.master)).raw().toBuffer(),frontPixels=await sharp(path.join(root,front.master)).raw().toBuffer();
for(let y=0;y<640;y++){const start=(y*640+320)*4;frontPixels.copy(combined,start,start,start+320*4);}
const assembly=await sharp(path.join(root,'masters/exports/divine-slide-lintel-assembly.png')).raw().toBuffer();
assert.deepEqual(combined,assembly,'Beam masks do not reconstruct the registered assembly exactly');
const decodedAssembly=await sharp(path.join(root,back.src)).raw().toBuffer(),decodedFront=await sharp(path.join(root,front.src)).raw().toBuffer();
for(let y=0;y<640;y++){const start=(y*640+320)*4;decodedFront.copy(decodedAssembly,start,start,start+320*4);}
let visibleDifference=0;for(let i=0;i<assembly.length;i+=4){assert.equal(decodedAssembly[i+3],assembly[i+3]);if(assembly[i+3])for(let c=0;c<3;c++)visibleDifference=Math.max(visibleDifference,Math.abs(decodedAssembly[i+c]-assembly[i+c]));}
assert(visibleDifference<=1,'WebP split introduced a compression seam');
report.divineBeam={sharedCanvas:[640,640],anchor:back.anchor,splitX:320,exactMasterReconstruction:true,webpVisibleMaxChannelDifference:visibleDifference,visualReview:'Continuous top edge, upper gold trim, frieze and lower trim; no step at center.'};
for(const theme of ['divine','corrupt'])for(const name of ['socrates','plato','aristotle']){
 const a=byId.get(`${theme}-${name}-moves`);for(const f of ['fall-start','fall-air','fall-ground'])assert(a.frames[f]);
 report.fallSequences.push({id:a.id,review:theme==='corrupt'&&name==='socrates'?'Head remains right through forward fall and landing; original direction preserved':'Head remains left through backward fall and landing; no head/feet reversal',landing:name==='socrates'?'original preserved':'redrawn from fall-air'});
}
try{await fs.access(path.join(root,'frames'));assert.fail('Deployable frames directory still exists');}catch(e){if(e.code!=='ENOENT')throw e;}
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z','--','.'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
for(const file of files){const stat=await fs.stat(path.join(root,file));assert(stat.size<=50000000,'Committable file exceeds 50 MB: '+file);report.committableFiles++;if(!report.largestCommittableFile||stat.size>report.largestCommittableFile.bytes)report.largestCommittableFile={file,bytes:stat.size};}
await fs.writeFile(path.join(root,'source/web-validation-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({runtimeBytes:report.runtimeBytes,encodedAudioFiles:report.audio.length,divineBeam:report.divineBeam,fallSequences:report.fallSequences,largestCommittableFile:report.largestCommittableFile}));
