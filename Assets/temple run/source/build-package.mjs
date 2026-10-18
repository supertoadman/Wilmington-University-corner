import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildExpansion } from './build-expansion.mjs';
import { compressAudio } from './compress-audio.mjs';
const require=createRequire(import.meta.url);
let sharp;
try { sharp=require('sharp'); } catch { if(!process.env.SHARP_PATH) throw new Error('Install sharp with npm install, or set SHARP_PATH to an existing sharp package.'); sharp=require(process.env.SHARP_PATH); }
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const imports=JSON.parse(await fs.readFile(path.join(root,'source/imports.json'),'utf8'));
const assets=[];
const write=async (relative,data)=>{await fs.mkdir(path.dirname(path.join(root,relative)),{recursive:true});await fs.writeFile(path.join(root,relative),data);};
const title=s=>s.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');
async function alphaBounds(file,rect) {
  let image=sharp(file);if(rect)image=image.extract(rect);
  const {data,info}=await image.ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let left=info.width,top=info.height,right=-1,bottom=-1,transparent=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
    const a=data[(y*info.width+x)*4+3];
    if(a===0)transparent++;
    if(a>32){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  }
  if(right<0)throw Error('Empty image: '+file);
  return {x:left,y:top,width:right-left+1,height:bottom-top+1,transparentFraction:Number((transparent/(info.width*info.height)).toFixed(4))};
}
for(const item of imports){
  const master='masters/'+item.theme+'/'+item.category+'/'+item.id+'.png';
  const input=path.join(root,master);await fs.mkdir(path.dirname(input),{recursive:true});
  const source=path.isAbsolute(item.source)?item.source:path.join(root,item.source);
  if(source!==input)await fs.copyFile(source,input);
  const sourceMeta=await sharp(input).metadata();
  const max=item.category==='characters'?1280:item.category==='backgrounds'?1536:item.category==='pickups'?256:item.category==='guardians'?768:item.id.endsWith('-temple')?1024:640;
  const runtime='textures/'+item.theme+'/'+item.category+'/'+item.id+'.webp';
  let pipeline=sharp(input).resize({width:max,height:max,fit:'inside',withoutEnlargement:true});
  if(item.category==='characters') pipeline=sharp(input).resize({width:1280,height:1280,fit:'fill'});
  await fs.mkdir(path.dirname(path.join(root,runtime)),{recursive:true});
  await pipeline.webp({quality:80,alphaQuality:item.category==='backgrounds'?85:50,effort:4}).toFile(path.join(root,runtime));
  const meta=await sharp(path.join(root,runtime)).metadata();
  const bounds=await alphaBounds(path.join(root,runtime));
  const asset={id:item.id,name:title(item.id),theme:item.theme,category:item.category,type:item.category==='characters'?'spritesheet':'image',src:runtime,master,width:meta.width,height:meta.height,masterWidth:sourceMeta.width,masterHeight:sourceMeta.height,bytes:(await fs.stat(path.join(root,runtime))).size,alpha:!!meta.hasAlpha,bounds,anchor:{x:Number(((bounds.x+bounds.width/2)/meta.width).toFixed(4)),y:Number(((bounds.y+bounds.height)/meta.height).toFixed(4))},counterpart:item.id.replace(item.theme+'-',(item.theme==='divine'?'corrupt':'divine')+'-'),provenance:item.provenance||'New artwork generated with built-in image_gen'};
  if(item.category==='backgrounds')asset.anchor={x:0,y:0};
  if(item.category==='pickups')asset.anchor={x:.5,y:.5};
  if(item.category==='guardians')asset.usage='Encounter portrait / menu / guardian shrine artwork; frontal camera, not a directional actor.';
  if(item.category==='terrain')asset.usage='Decorative paving artwork; use terrain-grid SVG tiles for exact 2:1 tessellation.';
  if(item.category==='characters'){
    const identity=item.id.replace(/^(divine|corrupt)-/,'');
    asset.characterDesign={socrates:{title:'The Defiant Questioner',signature:'Emerald mantle, full swept-back mane, broad muscular silhouette'},plato:{title:'The Architect of Ideals',signature:'Lapis split coat, long flowing hair, tall elegant silhouette'},aristotle:{title:'The Relentless Seeker',signature:'Burgundy cropped jacket, full bronze curly topknot, compact agile silhouette'}}[identity];
    const fw=meta.width/2,fh=meta.height/2;asset.frames={};
    for(const [index,name] of ['idle','run-a','run-b','jump'].entries()){
      const rect={left:(index%2)*fw,top:Math.floor(index/2)*fh,width:fw,height:fh};
      const b=await alphaBounds(path.join(root,runtime),rect);
      asset.frames[name]={x:rect.left,y:rect.top,width:fw,height:fh,bounds:b,anchor:{x:Number(((b.x+b.width/2)/fw).toFixed(4)),y:Number(((b.y+b.height)/fh).toFixed(4))}};
    }
    asset.animations={idle:{frames:['idle'],fps:1,loop:true},run:{frames:['run-a','run-b'],fps:6,loop:true},jump:{frames:['jump'],fps:1,loop:false}};
    asset.facing='northeast';asset.usage='Four-pose sheet with a basic two-pose run loop. One facing only; hand-polished multi-frame locomotion is outside this pack.';
  }
  assets.push(asset);
}
const palettes={divine:{stone:'#eee4cd',light:'#fff8e9',shade:'#b5a78c',deep:'#302b23',gold:'#c7a15d',accent:'#f9dfa0'},corrupt:{stone:'#c5b7a2',light:'#e6d6bc',shade:'#817263',deep:'#231e24',gold:'#977342',accent:'#983e4a'}};
const wrap=(w,h,inner)=>'<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'">'+inner+'</svg>';
const paths={
play:'<path d="M25 17L49 32 25 47Z"/>',
pause:'<path d="M22 18H29V46H22ZM36 18H43V46H36Z"/>',
sound:'<path d="M14 26H23L34 17V47L23 38H14Z"/><path d="M41 22Q54 32 41 42" fill="none" stroke-width="4"/>',
heart:'<path d="M32 50L13 31C1 10 25 8 32 22C39 8 63 10 51 31Z"/>',
restart:'<path d="M17 25A19 19 0 1 1 15 39M17 13V27H31" fill="none" stroke-width="5"/>',
settings:'<path d="M26 10H38L40 18 47 22 55 20 61 31 55 37 55 45 44 51 38 47 30 49 25 56 13 50 14 42 10 35 3 31 9 20 17 21 23 17Z"/><circle cx="32" cy="32" r="9" fill="#141315"/>'
};
async function vector(id,theme,category,w,h,inner,extra={}){
 const src='vectors/'+theme+'/'+category+'/'+id+'.svg';await write(src,wrap(w,h,inner));
 assets.push({id,name:title(id),theme,category,type:'vector',src,width:w,height:h,bytes:(await fs.stat(path.join(root,src))).size,anchor:{x:.5,y:.5},counterpart:id.replace(theme+'-',(theme==='divine'?'corrupt':'divine')+'-'),provenance:'Original procedural SVG',...extra});
}
for(const [theme,p]of Object.entries(palettes)){
 const panel='<defs><linearGradient id="p" x2="0" y2="1"><stop stop-color="'+p.light+'"/><stop offset="1" stop-color="'+p.stone+'"/></linearGradient></defs><path d="M17 1H495L511 17V175L495 191H17L1 175V17Z" fill="url(#p)" stroke="'+p.gold+'" stroke-width="2"/><path d="M22 10H490L502 22V170L490 182H22L10 170V22Z" fill="none" stroke="'+p.shade+'"/><path d="M24 24H54M24 24V54M488 24H458M488 24V54M24 168H54M24 168V138M488 168H458M488 168V138" fill="none" stroke="'+p.gold+'" stroke-width="3"/>';
 await vector(theme+'-panel',theme,'ui',512,192,panel,{nineSlice:{left:60,right:60,top:60,bottom:60},contentInset:64});
 for(const state of ['normal','hover','pressed','disabled']){
 const fill=state==='hover'?p.light:state==='pressed'?p.shade:state==='disabled'?'#8d877c':p.stone;
 await vector(theme+'-button-'+state,theme,'ui',320,88,'<path d="M14 2H306L318 14V74L306 86H14L2 74V14Z" fill="'+fill+'" stroke="'+p.gold+'" stroke-width="3"/><path d="M22 10H298L309 21V67L298 78H22L11 67V21Z" fill="none" stroke="'+p.shade+'"/>',{nineSlice:{left:24,right:24,top:24,bottom:24},contentInset:26});
 }
 for(const [name,shape]of Object.entries(paths))await vector(theme+'-icon-'+name,theme,'ui',64,64,'<g fill="'+p.gold+'" stroke="'+p.gold+'" stroke-linejoin="round" stroke-linecap="round">'+shape+'</g>');
 await vector(theme+'-health-track',theme,'ui',320,32,'<rect x="1" y="1" width="318" height="30" rx="15" fill="'+p.deep+'" stroke="'+p.gold+'" stroke-width="2"/><rect x="7" y="7" width="306" height="18" rx="9" fill="'+p.shade+'"/>');
 await vector(theme+'-health-fill',theme,'ui',306,18,'<rect width="306" height="18" rx="9" fill="'+p.accent+'"/>');
 for(const kind of ['plain','inlay','edge','gap']){
 const top=kind==='gap'?p.deep:p.stone;
 let svg='<path d="M0 64L128 128V144L0 80Z" fill="'+p.shade+'"/><path d="M128 128L256 64V80L128 144Z" fill="'+p.deep+'"/><path d="M0 64L128 0 256 64 128 128Z" fill="'+top+'"/>';
 if(kind!=='gap'){
 svg+='<path d="M32 48L160 112M64 32L192 96M96 16L224 80M32 80L160 16M64 96L192 32M96 112L224 48" fill="none" stroke="'+p.shade+'" stroke-width=".6" opacity=".65"/>';
 if(kind==='inlay')svg+='<path d="M80 64L128 40 176 64 128 88Z" fill="none" stroke="'+p.gold+'" stroke-width="3"/><path d="M116 64L128 58 140 64 128 70Z" fill="'+p.gold+'"/>';
 if(kind==='edge')svg+='<path d="M3 65L128 127" fill="none" stroke="'+p.gold+'" stroke-width="5"/>';
 if(theme==='corrupt')svg+='<path d="M89 21L111 39 104 56 139 73 132 95 155 114M104 56L71 66 57 83" fill="none" stroke="'+p.deep+'" stroke-width="2"/>';
 }
 await vector(theme+'-tile-'+kind,theme,'terrain-grid',256,144,svg,{anchor:{x:.5,y:64/144},groundDiamond:[[0,64],[128,0],[256,64],[128,128]],grid:{width:256,height:128,depth:16},collision:kind==='gap'?'void':'walkable'});
 }
 await vector(theme+'-effect-ring',theme,'effects',256,128,'<ellipse cx="128" cy="64" rx="118" ry="55" fill="none" stroke="'+p.gold+'" stroke-width="4"/><ellipse cx="128" cy="64" rx="104" ry="47" fill="none" stroke="'+p.accent+'" stroke-width="2" opacity=".65"/>',{blendMode:'source-over'});
 await vector(theme+'-effect-spark',theme,'effects',128,128,'<path d="M64 4L74 52 124 64 74 75 64 124 53 75 4 64 53 52Z" fill="'+p.accent+'"/><circle cx="64" cy="64" r="10" fill="'+p.light+'"/>',{blendMode:'screen'});
 await vector(theme+'-effect-shadow',theme,'effects',256,128,'<defs><radialGradient id="s"><stop stop-color="#000" stop-opacity=".42"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs><ellipse cx="128" cy="64" rx="126" ry="60" fill="url(#s)"/>');
}
const cues=[
{id:'collect-laurel',duration:.45,notes:[880,1320,1760],kind:'bell'},
{id:'collect-wisdom',duration:.8,notes:[523.25,659.25,783.99],kind:'bell'},
{id:'activate-aegis',duration:1.1,notes:[392,587.33,783.99],kind:'bell'},
{id:'jump',duration:.22,notes:[220,440],kind:'sweep'},
{id:'land',duration:.18,notes:[90,55],kind:'impact'},
{id:'damage',duration:.32,notes:[110,82.4,73.4],kind:'impact'},
{id:'enter-divine',duration:2.1,notes:[261.63,329.63,392,523.25],kind:'bell'},
{id:'enter-corrupt',duration:2.1,notes:[130.81,138.59,196,207.65],kind:'dark'}
];
for(const cue of cues){
 const rate=44100,n=Math.floor(rate*cue.duration),pcm=Buffer.alloc(n*2);let seed=12345,lp=0;
 for(let i=0;i<n;i++){
  const t=i/rate,u=i/(n-1);const env=Math.min(1,t/.009)*Math.pow(1-u,1.8);let value=0;
  if(cue.kind==='impact'){seed=(1664525*seed+1013904223)>>>0;lp=.85*lp+.15*(seed/4294967296*2-1);value=lp*.8+Math.sin(2*Math.PI*(cue.notes[0]*t-35*t*t))*.35;}
  else if(cue.kind==='sweep')value=Math.sin(2*Math.PI*(220*t+600*t*t))*.45;
  else for(let j=0;j<cue.notes.length;j++){const local=t-j*.04;if(local>=0)value+=(Math.sin(2*Math.PI*cue.notes[j]*local)+.25*Math.sin(2*Math.PI*cue.notes[j]*2.76*local))*Math.exp(-local*(cue.kind==='dark'?1.3:3))/cue.notes.length;}
  pcm.writeInt16LE(Math.round(Math.max(-1,Math.min(1,value*env*.5))*32767),i*2);
 }
 const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVE',8);header.write('fmt ',12);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*2,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
 const src='masters/audio/'+cue.id+'.wav';await write(src,Buffer.concat([header,pcm]));assets.push({id:cue.id,name:title(cue.id),theme:'shared',category:'audio',type:'audio',src,duration:cue.duration,sampleRate:rate,channels:1,bytes:pcm.length+44,provenance:'Original procedurally synthesized sound cue'});
}
assets.push(...await buildExpansion(root,sharp));
await compressAudio(root,assets);
const manifest={schemaVersion:'2.0.0',name:'Temple Run — Divine & Corrupt',created:'2026-10-18',camera:{type:'isometric / three-quarter',logicalGrid:{tileWidth:256,tileHeight:128},actorFacing:'northeast'},palettes,counts:{raster:assets.filter(a=>a.type==='image'||a.type==='spritesheet').length,spriteSheets:assets.filter(a=>a.type==='spritesheet').length,vectors:assets.filter(a=>a.type==='vector').length,audio:assets.filter(a=>a.type==='audio').length,total:assets.length},runtimeBytes:assets.reduce((n,a)=>n+a.bytes+(a.sources?.slice(1).reduce((s,f)=>s+f.bytes,0)||0),0),runtimeBytesIncludes:'All primary files plus AAC audio alternatives; source masters excluded',assets};
await write('manifest.json',JSON.stringify(manifest,null,2)+'\n');
await write('manifest.js','window.TEMPLE_ASSETS = '+JSON.stringify(manifest)+';\n');
await write('source/export-report.json',JSON.stringify({counts:manifest.counts,runtimeBytes:manifest.runtimeBytes,assets:assets.map(({id,width,height,alpha,bounds,bytes})=>({id,width,height,alpha,bounds,bytes}))},null,2));
console.log(JSON.stringify({counts:manifest.counts,runtimeMB:(manifest.runtimeBytes/1048576).toFixed(2)}));

