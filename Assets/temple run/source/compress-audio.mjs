import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import {encodedLoopPoints} from './audio-loop-points.mjs';

export async function compressAudio(root,assets){
 for(const a of assets.filter(a=>a.type==='audio')){
  const master=a.master||a.src,wav=await fs.readFile(path.join(root,master)),rate=wav.readUInt32LE(24),channels=wav.readUInt16LE(22),stride=channels*2,pcm=wav.subarray(44),samples=pcm.length/stride;
  let input=path.join(root,master),guard=0,tailPadding=0;
  if(a.loop){
   guard=rate;const payload=Buffer.concat([pcm.subarray(pcm.length-guard*stride),pcm,pcm.subarray(0,guard*stride)]),header=Buffer.from(wav.subarray(0,44));
   header.writeUInt32LE(payload.length+36,4);header.writeUInt32LE(payload.length,40);
   input=path.join(root,'masters/encoding',a.id+'.wav');await fs.mkdir(path.dirname(input),{recursive:true});await fs.writeFile(input,Buffer.concat([header,payload]));
   a.masterLoopStartSample=0;a.masterLoopEndSample=samples;
   a.loopStartSample=guard;a.loopEndSample=guard+samples;
   a.loopStart=guard/rate;a.loopEnd=(guard+samples)/rate;
  }else{
   // Leave a full codec packet after short cues; runtime trims it away.
   tailPadding=2048;const payload=Buffer.concat([pcm,Buffer.alloc(tailPadding*stride)]),header=Buffer.from(wav.subarray(0,44));
   header.writeUInt32LE(payload.length+36,4);header.writeUInt32LE(payload.length,40);
   input=path.join(root,'masters/encoding',a.id+'.wav');await fs.mkdir(path.dirname(input),{recursive:true});await fs.writeFile(input,Buffer.concat([header,payload]));
  }
  a.master=master;a.sources=[];
  for(const format of [{extension:'ogg',codec:'libvorbis',mimeType:'audio/ogg; codecs="vorbis"',args:['-b:a','48k','-minrate:a','48k','-maxrate:a','48k']},{extension:'m4a',codec:'aac',mimeType:'audio/mp4; codecs="mp4a.40.2"',args:['-b:a','48k','-movflags','+faststart']}]){
   const src=master.replace(/^masters\//,'').replace(/\.wav$/,'.'+format.extension),file=path.join(root,src);await fs.mkdir(path.dirname(file),{recursive:true});
   execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',input,'-map_metadata','-1','-c:a',format.codec,...format.args,'-ar',String(rate),file],{windowsHide:true});
   a.sources.push({src,mimeType:format.mimeType,codec:format.codec==='libvorbis'?'vorbis':'aac',bytes:(await fs.stat(file)).size,sampleRate:rate,...(a.loop?encodedLoopPoints(file,rate,channels,samples,guard):{})});
  }
  a.src=a.sources[0].src;a.bytes=a.sources[0].bytes;
  if(a.loop)for(const key of ['loopStartSample','loopEndSample','loopStart','loopEnd'])a[key]=a.sources[0][key];
  a.encoding={sampleRate:rate,guardSamples:guard,tailPaddingSamples:tailPadding,sourceSamples:samples,encodedContentSamples:samples+2*guard+tailPadding,trim:'Decoder applies codec delay; play exact loopStart/loopEnd seconds in decoded buffer. One-second cyclic guards protect lossy codec overlap; trim one-shots to duration.'};
 }
}
