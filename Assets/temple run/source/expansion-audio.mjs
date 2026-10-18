import fs from 'node:fs/promises';
import path from 'node:path';
const RATE=44100, TAU=2*Math.PI;
const hz=n=>440*2**((n-69)/12);

// Original score and synthesis. Event tails and delay taps wrap around the
// loop buffer, preserving reverb across the loop boundary without a fade gap.
function track(seconds,loop){
 const length=Math.round(seconds*RATE), left=new Float32Array(length),right=new Float32Array(length);
 function event(start,duration,note,voice,gain=.1,pan=0,seed=1){
  const offset=Math.round(start*RATE),count=Math.round(duration*RATE),frequency=hz(note);
  const l=Math.sqrt((1-pan)/2)*gain,r=Math.sqrt((1+pan)/2)*gain;
  let low=0;
  for(let i=0;i<count;i++){
   const at=offset+i;if(!loop&&at>=length)break;
   const ix=((at%length)+length)%length,t=i/RATE,u=i/count;
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;
   const noise=seed/2147483648-1;low=.88*low+.12*noise;
   let wave=0,env=Math.min(1,t/.008)*Math.min(1,(duration-t)/.035);
   if(voice==='pluck') {wave=Math.sin(TAU*frequency*t)+.32*Math.sin(TAU*frequency*2*t)+.16*Math.sin(TAU*frequency*3*t);env*=Math.exp(-t*5);}
   if(voice==='bell') {wave=Math.sin(TAU*frequency*t)+.32*Math.sin(TAU*frequency*2.756*t)+.12*Math.sin(TAU*frequency*5.404*t);env*=Math.exp(-t*2.8);}
   if(voice==='pad') {wave=(Math.sin(TAU*frequency*t+.03*Math.sin(TAU*4.7*t))+.3*Math.sin(TAU*frequency*2*t)+.15*Math.sin(TAU*frequency*3*t));env=Math.sin(Math.PI*u)**1.6;}
   if(voice==='bass') {wave=Math.sin(TAU*frequency*t)+.22*Math.sin(TAU*frequency*2*t);env*=Math.exp(-t*2);}
   if(voice==='drum') {wave=Math.sin(TAU*(55*t+2*(1-Math.exp(-30*t))))*.8+low*.5;env*=Math.exp(-t*12);}
   if(voice==='tick') {wave=noise-low;env*=Math.exp(-t*50);}
   if(voice==='slide') {wave=low*.85+(noise-low)*.15;env*=Math.sin(Math.PI*u)**.5;}
   if(voice==='whoosh') {wave=low*.9+Math.sin(TAU*(frequency*t+180*t*t))*.12;env*=Math.sin(Math.PI*u)**2;}
   if(voice==='fall') {wave=Math.sin(TAU*(frequency*t-70*t*t))+low*.35;env*=Math.sin(Math.PI*u);}
   if(voice==='growl') {wave=(Math.sin(TAU*frequency*t+3*Math.sin(TAU*frequency*.5*t))*.6+low*.9)*(1+.25*Math.sin(TAU*19*t));env*=Math.sin(Math.PI*u)**.7;}
   left[ix]+=wave*env*l;right[ix]+=wave*env*r;
  }
 }
 function delay(seconds,gain){
  const d=Math.round(seconds*RATE),a=left.slice(),b=right.slice();
  for(let i=0;i<length;i++){
   const dest=i+d;if(!loop&&dest>=length)break;
   const ix=dest%length;left[ix]+=b[i]*gain;right[ix]+=a[i]*gain;
  }
 }
 function encode(){
  let peak=0;for(let i=0;i<length;i++)peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
  const gain=.72/Math.max(peak,.001),pcm=Buffer.alloc(length*4);
  for(let i=0;i<length;i++){pcm.writeInt16LE(Math.round(left[i]*gain*32767),i*4);pcm.writeInt16LE(Math.round(right[i]*gain*32767),i*4+2);}
  const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVE',8);header.write('fmt ',12);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(RATE,24);header.writeUInt32LE(RATE*4,28);header.writeUInt16LE(4,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
  return Buffer.concat([header,pcm]);
 }
 return {event,delay,encode,length};
}

function score(theme,menu=false){
 const bpm=menu?80:theme==='divine'?100:108,beat=60/bpm,bars=menu?24:32;
 const t=track(bars*4*beat,true),dark=theme==='corrupt';
 const chords=dark?[[50,53,57],[46,50,53],[48,51,55],[45,49,52]]:[[50,54,57],[55,59,62],[47,50,54],[45,49,52]];
 const motifs=dark?[[0,7,3,10,7,3,1,7],[0,3,7,12,10,7,3,1]]:[[0,7,12,14,12,7,4,7],[0,4,7,12,16,14,12,7]];
 for(let bar=0;bar<bars;bar++){
  const chord=chords[Math.floor(bar/2)%4],base=bar*4*beat,section=Math.floor(bar/8);
  chord.forEach((n,i)=>t.event(base,4.6*beat,n,'pad',menu?.045:.032,(i-1)*.55,bar+i+9));
  const motif=motifs[Math.floor(bar/4)%2];
  for(let step=0;step<8;step++){
   const at=base+step*.5*beat,n=chord[0]+12+motif[step];
   t.event(at,menu?1.4:.85,n,'pluck',menu?.045:.07,Math.sin(step*1.8)*.5,bar*20+step+1);
   if(!menu&&step%2===0)t.event(at,.2,40,'tick',dark?.035:.018,step%4===0?-.35:.35,bar*12+step+810);
  }
  for(let step=0;step<4;step++)t.event(base+step*beat,.75,chord[0]-12,'bass',menu?.025:.09,0,bar+2);
  if(!menu){
   t.event(base,.5,36,'drum',dark?.15:.09,-.1,bar+102);
   t.event(base+2*beat,.45,36,'drum',dark?.12:.07,.1,bar+205);
   if(section%2===1)t.event(base+3.5*beat,.25,36,'drum',.04,.2,bar+305);
  }
  if(bar%2===0)t.event(base+beat,2.7,chord[1]+24,'bell',menu?.055:.035,.25,bar+7);
  if(section>=2&&bar%2===1)t.event(base+2*beat,2.5,chord[2]+12,'pad',.055,-.2,bar+8);
 }
 t.delay(beat*.75,.23);t.delay(beat*1.5,.14);
 return {track:t,bpm,bars,duration:t.length/RATE};
}

function effect(name,theme){
 const dark=theme==='corrupt',shift=dark?-5:0;
 const seconds={slide:.8,'turn-whoosh':.42,fall:1.25,'game-over':3.2,'ui-click':.12,'shield-ending':1.4,'chaser-growl':1.8,footsteps:1.2}[name];
 const t=track(seconds,false);
 if(name==='slide'){t.event(0,.78,40+shift,'slide',.4,0,dark?1420:419);if(dark)t.event(.12,.55,30,'growl',.06,0,912);}
 if(name==='turn-whoosh')t.event(0,.41,48+shift,'whoosh',.4,.1,51);
 if(name==='fall')t.event(0,1.2,58+shift,'fall',.3,0,320);
 if(name==='game-over')[62,57,53,dark?46:50].forEach((n,i)=>t.event(i*.45,1.6,n+shift,'bell',.22,(i-1.5)*.15,66+i));
 if(name==='ui-click')t.event(0,.1,84+shift,'pluck',.3,0,61);
 if(name==='shield-ending')[88,81,74,62].forEach((n,i)=>t.event(i*.12,.9,n+shift,'bell',.18,(i-1.5)*.15,72+i));
 if(name==='chaser-growl')t.event(0,1.75,dark?26:31,'growl',.4,0,128);
 if(name==='footsteps')for(let i=0;i<4;i++){t.event(i*.28,.14,40,'drum',.25,i%2?.25:-.25,500+i);t.event(i*.28,.11,48,'slide',dark?.18:.09,i%2?.25:-.25,600+i);}
 return {track:t,duration:t.length/RATE};
}

export async function buildAudio(root){
 const assets=[];
 async function save(id,theme,result,extra){
  const src='masters/audio/expansion/'+id+'.wav',file=path.join(root,src),buffer=result.track.encode();
  await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,buffer);
  assets.push({id,name:id.split('-').join(' '),theme,category:'audio',type:'audio',src,bytes:buffer.length,duration:result.duration,sampleRate:RATE,channels:2,bitsPerSample:16,provenance:'Original composed and procedurally synthesized audio; no sampled or generated performance',...extra});
 }
 for(const theme of ['divine','corrupt']){
  const music=score(theme);await save(theme+'-music-loop',theme,music,{loop:true,bpm:music.bpm,bars:music.bars,loopStartSample:0,loopEndSample:music.track.length,counterpart:(theme==='divine'?'corrupt':'divine')+'-music-loop',usage:'Seamless original instrumental score. Use decoded PCM/Web Audio looping to avoid media-element gaps.'});
  for(const name of ['slide','turn-whoosh','fall','game-over','ui-click','shield-ending','chaser-growl','footsteps'])await save(theme+'-'+name,theme,effect(name,theme),{loop:false,counterpart:(theme==='divine'?'corrupt':'divine')+'-'+name,usage:name==='footsteps'?'Four alternating footfalls; trigger from run animation events or use the complete sequence.':'Original synthesized '+name+' cue.'});
 }
 const menu=score('divine',true);await save('menu-music','shared',menu,{loop:true,bpm:menu.bpm,bars:menu.bars,loopStartSample:0,loopEndSample:menu.track.length,usage:'Quiet 72-second instrumental menu loop with plucked melody and bells.'});
 return assets;
}
