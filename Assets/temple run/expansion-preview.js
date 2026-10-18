(() => {
'use strict';
const $=id=>document.getElementById(id),assets=new Map(window.TEMPLE_ASSETS.assets.map(a=>[a.id,a])),images=new Map();
let theme='divine',actor,enemy,ready=false,start=performance.now(),generation=0,manualFrame=null;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;if(reduced)$('speed').value='0';
async function load(id){if(images.has(id))return;const image=new Image();image.src=assets.get(id).src;await image.decode();images.set(id,image);}
async function prepare(){
 const token=++generation;ready=false;theme=$('realm').value;actor=assets.get(theme+'-'+$('runner').value.toLowerCase()+'-moves');enemy=assets.get(theme+'-chaser-run');
 const ids=[actor.id,enemy.id,theme+'-slide-lintel-back',theme+'-slide-lintel-front',theme+'-far-sky',theme+'-middle-ruins',theme+(theme==='divine'?'-near-clouds':'-near-smoke')];
 try{await Promise.all(ids.map(load));if(token!==generation)return;ready=true;start=performance.now();manualFrame=null;frameLinks();$('status').textContent='640 × 640 frames · WebP sheets · bottom-center anchors';}
 catch(error){$('status').textContent='Unable to load an asset: '+error.message;}
}
function frameLinks(){const strip=$('frames');strip.replaceChildren();for(const name of actor.animations[$('move').value].frames){const item=document.createElement('div');item.style.flex='0 0 100px';const canvas=document.createElement('canvas');canvas.width=100;canvas.height=100;canvas.setAttribute('aria-label',name);const f=actor.frames[name];canvas.getContext('2d').drawImage(images.get(actor.id),f.x,f.y,f.width,f.height,0,0,100,100);item.append(canvas,document.createTextNode(name));strip.append(item);}}
function draw(context,a,x,y,size,name){const f=name?a.frames[name]:null,im=images.get(a.id);if(f)context.drawImage(im,f.x,f.y,640,640,x-size/2,y-size,size,size);else context.drawImage(im,x-size/2,y-size,size,size);}
function frame(a,move,t){const v=a.animations[move],n=Math.floor(t*v.fps);return v.frames[v.loop?n%v.frames.length:Math.min(n,v.frames.length-1)];}
function render(now){
 if(ready){
  const speed=Number($('speed').value),t=(now-start)/1000*speed,move=$('move').value,current=manualFrame===null?frame(actor,move,t):actor.animations[move].frames[manualFrame%actor.animations[move].frames.length];
  const ctx=$('motion').getContext('2d');ctx.clearRect(0,0,960,640);ctx.strokeStyle='#75818d';ctx.beginPath();ctx.moveTo(0,624);ctx.lineTo(960,624);ctx.stroke();
  draw(ctx,enemy,245,624,420,frame(enemy,'run',t));draw(ctx,actor,680,624,590,current);
  const oc=$('occlusion').getContext('2d');oc.clearRect(0,0,640,640);draw(oc,assets.get(theme+'-slide-lintel-back'),320,590,600);draw(oc,actor,320,540,180,'slide-hold');draw(oc,assets.get(theme+'-slide-lintel-front'),320,590,600);
  const bg=$('parallax').getContext('2d');bg.fillStyle=theme==='divine'?'#eee4cd':'#231e24';bg.fillRect(0,0,1536,640);
  for(const [layer,id] of [['far',theme+'-far-sky'],['middle',theme+'-middle-ruins'],['near',theme+(theme==='divine'?'-near-clouds':'-near-smoke')]]){
   if(!$(layer).checked)continue;const a=assets.get(id),im=images.get(id),w=1280,offset=reduced?0:(now/1000*45*a.parallax)%w;bg.globalAlpha=layer==='near'?.45:1;
   for(let x=-offset;x<1536;x+=w){bg.drawImage(im,x,0,w,640);if($('seams').checked){bg.strokeStyle='#f44';bg.beginPath();bg.moveTo(x,0);bg.lineTo(x,640);bg.stroke();}}
  }bg.globalAlpha=1;
 }
 requestAnimationFrame(render);
}
function sounds(){const select=$('sound');select.replaceChildren();for(const a of assets.values())if(a.type==='audio'&&(a.theme===$('realm').value||a.id==='menu-music')&&(a.src.includes('/expansion/'))){const o=document.createElement('option');o.value=a.id;o.textContent=a.name;select.append(o);}setSound();}
function setSound(){let a=assets.get($('sound').value);const format=$('audio-format').value;if(format!=='auto'){const source=a.sources.find(s=>s.codec===format);a={...a,src:source.src,sources:[source]};}TempleAudio.stop();TempleAudio.mount($('audio'),a);$('audio-note').textContent=a.duration.toFixed(2)+' seconds · '+(a.loop?'sample-accurate loop':'one-shot')+' · Ogg / AAC';}
$('realm').onchange=()=>{prepare();sounds();};$('runner').onchange=prepare;
$('move').onchange=()=>{start=performance.now();manualFrame=null;if(actor)frameLinks();};$('speed').onchange=()=>{start=performance.now();manualFrame=null;};$('replay').onclick=()=>{start=performance.now();manualFrame=null;};$('step').onclick=()=>{manualFrame=manualFrame===null?0:manualFrame+1;};$('sound').onchange=setSound;$('audio-format').onchange=setSound;
prepare();sounds();requestAnimationFrame(render);
})();
