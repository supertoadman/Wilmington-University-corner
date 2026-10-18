import {execFileSync} from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

// Lossy codec blocks may differ at two copies of the same cyclic phase.
// Choose the quietest matching boundary within 50 ms, keeping exact loop length.
export function encodedLoopPoints(file,rate,channels,samples,guard){
 const pcm=execFileSync(ffmpeg,['-v','error','-i',file,'-f','s16le','-acodec','pcm_s16le','-ar',String(rate),'pipe:1'],{windowsHide:true,maxBuffer:50*1024*1024});
 const at=(i,c)=>pcm.readInt16LE((i*channels+c)*2);
 let best=Infinity,offset=0;
 const radius=Math.round(rate*.05);
 for(let shift=-radius;shift<=radius;shift++){
  const start=guard+shift,end=start+samples;let score=0;
  for(let c=0;c<channels;c++){
   score+=4*(at(start,c)-at(end-1,c))**2;
   for(let i=1;i<=12;i++)score+=(at(start-i,c)-at(end-i,c))**2/12;
  }
  score+=Math.abs(shift)*2;
  if(score<best){best=score;offset=shift;}
 }
 const loopStartSample=guard+offset,loopEndSample=loopStartSample+samples;
 return {loopStartSample,loopEndSample,loopStart:loopStartSample/rate,loopEnd:loopEndSample/rate,loopPhaseOffsetSamples:offset};
}
