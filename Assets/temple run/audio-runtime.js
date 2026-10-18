/* Runtime audio selection and sample-accurate loops, including codec guard trim. */
window.TempleAudio = (() => {
 let context,playing=null;
 const cache=new Map();
 function candidates(asset){const probe=document.createElement('audio');return (asset.sources||[{src:asset.src,mimeType:'audio/ogg'}]).filter(s=>probe.canPlayType(s.mimeType));}
 async function decode(asset,baseUrl=document.baseURI){
  context ||= new (window.AudioContext||window.webkitAudioContext)();await context.resume();
  const key=new URL(asset.src,baseUrl).href;if(cache.has(key))return cache.get(key);
  let lastError;
  for(const source of candidates(asset))try{
   const response=await fetch(new URL(source.src,baseUrl));if(!response.ok)throw Error('Audio HTTP '+response.status);
   const decoded=await context.decodeAudioData(await response.arrayBuffer());
   const start=Math.round((asset.loop?source.loopStart:0)*decoded.sampleRate),length=Math.round(asset.duration*decoded.sampleRate);
   if(decoded.length<start+length)throw Error('Decoded audio shorter than playback interval');
   const buffer=context.createBuffer(decoded.numberOfChannels,length,decoded.sampleRate);
   for(let c=0;c<decoded.numberOfChannels;c++)buffer.copyToChannel(decoded.getChannelData(c).subarray(start,start+length),c);
   cache.set(key,buffer);return buffer;
  }catch(error){lastError=error;}
  throw lastError||Error('No supported audio encoding');
 }
 function stop(){if(playing){playing.stop();playing.disconnect();playing=null;}}
 async function play(asset,baseUrl){stop();const buffer=await decode(asset,baseUrl);const node=context.createBufferSource();node.buffer=buffer;node.loop=!!asset.loop;node.loopStart=0;node.loopEnd=buffer.duration;node.connect(context.destination);node.start();playing=node;return node;}
 function mount(container,asset){
  const playButton=document.createElement('button'),stopButton=document.createElement('button'),status=document.createElement('span');
  playButton.textContent=asset.loop?'Play loop':'Play sound';stopButton.textContent='Stop';status.setAttribute('role','status');
  playButton.onclick=async()=>{playButton.disabled=true;status.textContent='Loading…';try{const node=await play(asset);status.textContent=asset.loop?'Playing loop':'Playing';node.onended=()=>{status.textContent='Stopped';};}catch(e){status.textContent=e.message;}finally{playButton.disabled=false;}};
  stopButton.onclick=()=>{stop();status.textContent='Stopped';};container.replaceChildren(playButton,stopButton,status);
 }
 return {candidates,decode,play,stop,mount};
})();
