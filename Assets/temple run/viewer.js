(() => {
'use strict';
const pack=window.TEMPLE_ASSETS;
const $=id=>document.getElementById(id);
const byId=new Map(pack.assets.map(a=>[a.id,a]));
const images=new Map();
let detailAsset=null,detailAnimation='run',detailStart=0,sceneTheme='divine',sceneReady=false,sceneGeneration=0;
const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
function loadImage(asset){
 if(!images.has(asset.id))images.set(asset.id,new Promise((resolve,reject)=>{
  const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>{images.delete(asset.id);reject(Error(asset.src));};image.src=asset.src;
 }));
 return images.get(asset.id);
}
const loaded=new Map();
async function ensure(id){const a=byId.get(id);if(!a)throw Error('Missing '+id);const image=await loadImage(a);loaded.set(id,image);return image;}
const formatBytes=n=>n>1048576?(n/1048576).toFixed(1)+' MB':Math.round(n/1024)+' KB';
$('total').textContent=pack.counts.total;
$('size').textContent=formatBytes(pack.runtimeBytes)+' · optimized runtime files';
for(const name of [...new Set(pack.assets.map(a=>a.category))]){
 const option=document.createElement('option');option.value=name;option.textContent=name.replaceAll('-',' ');$('category').append(option);
}
function renderGrid(){
 const query=$('search').value.trim().toLowerCase(),theme=$('theme').value,category=$('category').value;
 const filtered=pack.assets.filter(a=>(theme==='all'||a.theme===theme)&&(category==='all'||a.category===category)&&(!query||[a.id,a.name,a.category].join(' ').toLowerCase().includes(query)));
 $('shown').textContent=filtered.length+' assets';$('empty').hidden=!!filtered.length;$('grid').replaceChildren();
 for(const asset of filtered){
  const card=document.createElement('button');card.type='button';card.className='card '+asset.theme;card.setAttribute('aria-label','Inspect '+asset.name);
  const art=document.createElement('div');art.className='art '+$('surface').value;
  if(asset.type==='audio'){const symbol=document.createElement('span');symbol.className='sound-symbol';symbol.textContent='♪';art.append(symbol);}
  else{const image=document.createElement('img');image.src=asset.src;image.alt=asset.name;image.loading='lazy';art.append(image);}
  const body=document.createElement('div');body.className='card-body';
  const heading=document.createElement('h3');heading.textContent=asset.name;
  const meta=document.createElement('div');meta.className='meta';
  const realm=document.createElement('span');realm.className='realm';realm.textContent=asset.theme;
  const kind=document.createElement('span');kind.textContent=asset.category;
  meta.append(realm,kind);body.append(heading,meta);card.append(art,body);card.onclick=()=>showDetail(asset.id);$('grid').append(card);
 }
}
function link(label,url){const a=document.createElement('a');a.textContent=label;a.href=url;a.target='_blank';a.rel='noopener';return a;}
async function showDetail(id){
 const asset=byId.get(id);detailAsset=asset;detailAnimation='run';detailStart=performance.now()/1000;
 const layout=document.createElement('div');layout.className='detail-layout';
 const art=document.createElement('div');art.className='detail-art';
 if(asset.type==='audio'){TempleAudio.stop();const audio=document.createElement('div');audio.className='detail-links';TempleAudio.mount(audio,asset);art.append(audio);}
 else{const img=document.createElement('img');img.src=asset.src;img.alt=asset.name;art.append(img);}
 const copy=document.createElement('div');copy.className='detail-copy';
 const eyebrow=document.createElement('p');eyebrow.className='eyebrow';eyebrow.textContent=asset.category+' / '+asset.theme;
 const h=document.createElement('h2');h.textContent=asset.name;
 const description=document.createElement('p');description.textContent=asset.usage||(asset.type==='audio'?'Original synthesized sound cue. Activate playback to audition.':asset.type==='vector'?'Scalable vector asset with transparent background. Labels remain in your game interface.':'Original sculptural artwork with a matching counterpart.');
 const dimensions=document.createElement('p');dimensions.textContent=(asset.width?asset.width+' × '+asset.height+' · ':'')+formatBytes(asset.bytes)+(asset.masterWidth?' · master '+asset.masterWidth+' × '+asset.masterHeight:'');
 const code=document.createElement('code');code.textContent=asset.id;
 const links=document.createElement('div');links.className='detail-links';links.append(link('Open asset ↗',asset.src));if(asset.sources?.[1])links.append(link('AAC fallback ↗',asset.sources[1].src));
 if(asset.counterpart&&byId.has(asset.counterpart)){const button=document.createElement('button');button.textContent='View counterpart';button.onclick=()=>showDetail(asset.counterpart);links.append(button);}
 copy.append(eyebrow,h,description,dimensions,code,links);
 if(asset.frames){
  const canvas=document.createElement('canvas');canvas.id='spritePreview';canvas.width=480;canvas.height=480;copy.append(canvas);
  const controls=document.createElement('div');controls.className='detail-links';
  const select=document.createElement('select');select.setAttribute('aria-label','Animation');
  for(const name of Object.keys(asset.animations)){const option=document.createElement('option');option.value=name;option.textContent=name;select.append(option);}select.value='run';
  select.onchange=()=>{detailAnimation=select.value;detailStart=performance.now()/1000;};
  const replay=document.createElement('button');replay.textContent='Replay';replay.onclick=()=>{detailStart=performance.now()/1000;};controls.append(select,replay);copy.append(controls);
  const frameLinks=document.createElement('div');frameLinks.className='detail-links';
  for(const [name,f] of Object.entries(asset.frames))if(f.src)frameLinks.append(link(name+' PNG',f.src));copy.append(frameLinks);
  const note=document.createElement('p');note.textContent=asset.expansion?'Select a move to preview. Frames are read directly from the WebP sheet.':'Original four-pose sheet.';copy.append(note);await ensure(id);
 }
 layout.append(art,copy);$('detailBody').replaceChildren(layout);if(!$('details').open)$('details').showModal();
}
$('close').onclick=()=>{$('details').close();detailAsset=null;};
$('details').addEventListener('close',()=>{TempleAudio.stop();detailAsset=null;});
$('details').addEventListener('click',event=>{if(event.target===$('details')){$('details').close();detailAsset=null;}});
for(const id of ['search','theme','category','surface'])$(id).addEventListener(id==='search'?'input':'change',renderGrid);
function draw(ctx,id,x,y,width,frame){
 const a=byId.get(id),im=loaded.get(id);if(!im)return;
 const f=frame?a.frames[frame]:null,w=f?.width||a.width,h=f?.height||a.height,anchor=f?.anchor||a.anchor;
 const height=width*h/w;
 if(f)ctx.drawImage(im,f.x,f.y,w,h,x-anchor.x*width,y-anchor.y*height,width,height);
 else ctx.drawImage(im,x-anchor.x*width,y-anchor.y*height,width,height);
}
async function prepareScene(){
 const generation=++sceneGeneration;sceneReady=false;sceneTheme=$('sceneTheme').value;$('sceneStatus').textContent='Loading '+sceneTheme+' sanctuary…';
 const suffixes=['sanctuary','temple','gateway','column','barrier','trap','tile-plain','tile-inlay','tile-edge','laurel','wisdom','aegis','effect-shadow','effect-ring','socrates','plato','aristotle'];
 try{await Promise.all(suffixes.map(s=>ensure(sceneTheme+'-'+s)));if(generation!==sceneGeneration)return;sceneReady=true;$('sceneStatus').textContent='Switch realms and philosophers to compare the set. The floor uses exact 2:1 tiles; the scene combines the actual exported assets.';}
 catch(error){if(generation===sceneGeneration)$('sceneStatus').textContent='Unable to load scene asset: '+error.message;}
}
$('sceneTheme').onchange=()=>{$('rosterTheme').value=$('sceneTheme').value;prepareScene();};
$('rosterTheme').onchange=()=>{$('sceneTheme').value=$('rosterTheme').value;prepareScene();};
document.querySelectorAll('[data-character]').forEach(button=>button.onclick=()=>{$('actor').value=button.dataset.character;$('pose').value='idle';$('scene').scrollIntoView({behavior:reduceMotion.matches?'instant':'smooth',block:'center'});});
const scene=$('scene'),ctx=scene.getContext('2d');
function cover(image){const scale=Math.max(scene.width/image.width,scene.height/image.height),w=image.width*scale,h=image.height*scale;ctx.drawImage(image,(scene.width-w)/2,(scene.height-h)/2,w,h);}
function render(time){
 const t=time/1000;
 if(sceneReady){
  ctx.clearRect(0,0,1440,840);const theme=sceneTheme;cover(loaded.get(theme+'-sanctuary'));
  for(const name of ['socrates','plato','aristotle']){const canvas=$('roster-'+name),context=canvas.getContext('2d');context.clearRect(0,0,480,510);draw(context,theme+'-'+name,240,488,455,'idle');}
  ctx.fillStyle=theme==='divine'?'rgba(29,25,18,.30)':'rgba(10,8,15,.28)';ctx.fillRect(0,0,1440,840);
  for(let sum=0;sum<=8;sum++)for(let i=0;i<5;i++){const j=sum-i;if(j<0||j>4)continue;const kind=i===4||j===4?'edge':(i+j)%3===0?'inlay':'plain';draw(ctx,theme+'-tile-'+kind,720+(i-j)*85,300+(i+j)*42.5,171);}
  const actor=theme+'-'+$('actor').value,pose=$('pose').value;
  const frame=pose==='run'?(reduceMotion.matches?'run-a':Math.floor(t*6)%2?'run-b':'run-a'):pose;
  const actorY=580-(pose==='jump'?35:0);
  const props=[
   {id:theme+'-temple',x:875,y:355,w:340},
   {id:theme+'-column',x:600,y:380,w:160},
   {id:theme+'-column',x:1040,y:500,w:180},
   {id:theme+'-gateway',x:438,y:530,w:200},
   {id:theme+'-barrier',x:840,y:490,w:160},
   {id:theme+'-trap',x:930,y:585,w:120},
   {id:theme+'-laurel',x:630,y:493,w:44},
   {id:theme+'-laurel',x:750,y:410,w:44},
   {id:theme+'-wisdom',x:590,y:560,w:65},
   {id:theme+'-aegis',x:790,y:575,w:60},
   {id:theme+'-effect-shadow',x:700,y:580,w:95},
   {id:actor,x:700,y:actorY,w:158,frame}
  ];
  props.sort((a,b)=>a.y-b.y);
  for(const p of props)draw(ctx,p.id,p.x,p.y,p.w,p.frame);
  ctx.fillStyle='rgba(10,10,8,.48)';ctx.fillRect(0,777,1440,63);
 }
 if(detailAsset?.frames&&$('details').open){
  const c=$('spritePreview');if(c){const d=c.getContext('2d');d.clearRect(0,0,c.width,c.height);const a=detailAsset.animations[detailAnimation]||detailAsset.animations.run;const index=reduceMotion.matches?0:Math.floor(Math.max(0,t-detailStart)*a.fps);const frame=a.frames[a.loop?index%a.frames.length:Math.min(index,a.frames.length-1)];draw(d,detailAsset.id,240,460,440,frame);}
 }
 requestAnimationFrame(render);
}
renderGrid();prepareScene();requestAnimationFrame(render);
})();
