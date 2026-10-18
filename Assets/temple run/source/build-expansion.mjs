import fs from 'node:fs/promises';
import path from 'node:path';
import {buildAudio} from './expansion-audio.mjs';
import {spriteRegions,extractSprite} from './sprite-regions.mjs';
import {tileExport} from './tile-export.mjs';

const FRAME=640;
const names=['run-01','run-02','run-03','run-04','run-05','run-06','jump-takeoff','jump-air','jump-land','slide-drop','slide-hold','slide-rise','stumble-trip','stumble-recover','fall-start','fall-air','fall-ground','idle'];
const title=s=>s.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');
export async function buildExpansion(root,sharp){
 const jobs=JSON.parse(await fs.readFile(path.join(root,'source/expansion-imports.json'),'utf8'));
 const assets=[];
 const blank=(w,h)=>sharp({create:{width:w,height:h,channels:4,background:{r:0,g:0,b:0,alpha:0}}});
 async function save(relative,buffer){const dest=path.join(root,relative);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,buffer);}
 async function bounds(input){
  const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});let x=info.width,y=info.height,r=-1,b=-1,zero=0;
  for(let row=0;row<info.height;row++)for(let col=0;col<info.width;col++){const a=data[(row*info.width+col)*4+3];if(a===0)zero++;if(a>24){x=Math.min(x,col);y=Math.min(y,row);r=Math.max(r,col);b=Math.max(b,row);}}
  if(r<0)throw Error('Empty raster');return {x,y,width:r-x+1,height:b-y+1,transparentFraction:zero/(info.width*info.height)};
 }
 async function register(job,id,buffer,extra={}){
  const theme=id.split('-')[0],src=`textures/${theme}/${job.category}/${id}.webp`,master=`masters/exports/textures/${theme}/${job.category}/${id}.png`;
  await save(master,buffer);const webp=await sharp(buffer).webp({quality:80,alphaQuality:job.category==='backgrounds'?85:50,lossless:id.startsWith('divine-slide-lintel-'),effort:4}).toBuffer();await save(src,webp);const meta=await sharp(buffer).metadata();
  const a={id,name:title(id),theme,category:job.category,type:'image',src,master,sourceMaster:job.master,width:meta.width,height:meta.height,masterWidth:meta.width,masterHeight:meta.height,bytes:webp.length,alpha:meta.hasAlpha,bounds:await bounds(buffer),anchor:{x:.5,y:1},counterpart:id.replace(theme+'-',(theme==='divine'?'corrupt':'divine')+'-'),provenance:'Built-in image_gen artwork; WebP runtime export from preserved PNG master',expansion:true,...extra};assets.push(a);return a;
 }
 // Geometry-only exports preserve generated alpha. No color-key removal or
 // repainting; source images remain unchanged and available as PNG masters.
 for(const job of jobs){
  const theme=job.id.split('-')[0];
  job.master=`masters/${theme}/${job.category}/${job.id}.png`;
  const input=path.join(root,job.master),source=path.isAbsolute(job.source)?job.source:path.join(root,job.source);
  if(path.resolve(source)!==path.resolve(input)){await fs.mkdir(path.dirname(input),{recursive:true});await fs.copyFile(source,input);}
  const meta=await sharp(input).metadata();job.masterWidth=meta.width;job.masterHeight=meta.height;
  if(job.category==='characters'||job.category==='chasers'){
   const frameNames=job.category==='characters'?names:names.slice(0,6);
   const pieces=[],raw=await sharp(input).ensureAlpha().raw().toBuffer();
   const {regions,labels}=spriteRegions(raw,meta.width,meta.height,job.cols,job.rows);
   if(regions.length!==frameNames.length)throw Error('Unable to isolate every sprite in '+job.id);
   for(let i=0;i<frameNames.length;i++){
    const selected=extractSprite(raw,meta.width,meta.height,labels,regions[i]);
    const cell=await sharp(selected.pixels,{raw:{width:selected.width,height:selected.height,channels:4}}).png().toBuffer(),b=await bounds(cell);
    pieces.push({cell,b,name:frameNames[i]});
   }
   // One common scale per move set preserves the size difference between a
   // standing, crouched, sliding and fallen body.
   const scale=Math.min(...pieces.map(p=>Math.min(592/p.b.width,592/p.b.height)));
   const frames={},composite=[];
   for(let i=0;i<pieces.length;i++){
    const {cell,b,name}=pieces[i];
    const sprite=await sharp(cell).extract({left:b.x,top:b.y,width:b.width,height:b.height}).resize({width:Math.max(1,Math.round(b.width*scale)),height:Math.max(1,Math.round(b.height*scale)),fit:'fill'}).png().toBuffer();
    const sm=await sharp(sprite).metadata(),left=Math.round((FRAME-sm.width)/2),lift=name==='jump-air'?72:0,top=FRAME-8-sm.height-lift;
    let png=await blank(FRAME,FRAME).composite([{input:sprite,left,top:Math.max(8,top)}]).png().toBuffer();
    if(name==='fall-ground'&&!job.id.includes('socrates')){
     const repair=path.join(root,`masters/repairs/${job.id.replace('-moves','')}-fall-ground.png`),rb=await bounds(repair);
     const replacement=await sharp(repair).extract({left:rb.x,top:rb.y,width:rb.width,height:rb.height}).resize({width:sm.width,height:Math.min(420,Math.round(sm.width*rb.height/rb.width)),fit:'fill'}).png().toBuffer(),rm=await sharp(replacement).metadata();
     png=await blank(FRAME,FRAME).composite([{input:replacement,left:Math.round((FRAME-rm.width)/2),top:632-rm.height}]).png().toBuffer();
    }
    const master=`masters/frames/${theme}/${job.id}/${name}.png`;await save(master,png);
    const x=(i%job.cols)*FRAME,y=Math.floor(i/job.cols)*FRAME;
    frames[name]={x,y,width:FRAME,height:FRAME,master,masterBytes:png.length,bounds:await bounds(png),anchor:{x:.5,y:1}};
    composite.push({input:png,left:x,top:y});
   }
   const png=await blank(job.cols*FRAME,job.rows*FRAME).composite(composite).png().toBuffer();
   const animations={run:{frames:frameNames.slice(0,6),fps:12,loop:true}};
   if(job.category==='characters')Object.assign(animations,{jump:{frames:names.slice(6,9),fps:8,loop:false},slide:{frames:names.slice(9,12),fps:8,loop:false,holdFrame:'slide-hold'},stumble:{frames:names.slice(12,14),fps:8,loop:false},fall:{frames:names.slice(14,17),fps:7,loop:false},idle:{frames:['idle'],fps:1,loop:true}});
   await register(job,job.id,png,{type:'spritesheet',frames,animations,facing:'northeast',sourceFrameSize:{width:meta.width/job.cols,height:meta.height/job.rows},usage:'Six-frame run plus supplied action frames. Individual transparent 640px PNGs use bottom-center anchors. Generated motion may need hand polish; source cells are upscaled. Jump-air has 72px visual lift; apply physics only once.'});
  }else if(job.id==='divine-slide-lintel'){
   const repair=path.join(root,'masters/repairs/divine-slide-lintel-continuous.png'),b=await bounds(repair);
   const sprite=await sharp(repair).extract({left:b.x,top:b.y,width:b.width,height:b.height}).resize({width:600,height:600,fit:'inside'}).png().toBuffer(),sm=await sharp(sprite).metadata();
   const assembly=await blank(640,640).composite([{input:sprite,left:Math.round((640-sm.width)/2),top:632-sm.height}]).png().toBuffer();
   await save('masters/exports/divine-slide-lintel-assembly.png',assembly);
   // Complementary integer masks on ONE registered image: no overlap or gap.
   const assemblyPixels=await sharp(assembly).raw().toBuffer();
   for(const [i,part]of ['back','front'].entries()){
    const pixels=Buffer.alloc(640*640*4);for(let y=0;y<640;y++){const start=(y*640+i*320)*4;assemblyPixels.copy(pixels,start,start,start+320*4);}
    const png=await sharp(pixels,{raw:{width:640,height:640,channels:4}}).png().toBuffer();
    await register(job,job.id+'-'+part,png,{assembly:job.id,drawOrder:i===0?'behind-player':'in-front-of-player',splitX:320,usage:'Shared continuous assembly, complementary back/front masks. Draw back, actor, front at the same bottom-center anchor.'});
   }
  }else if(job.split){
   // Register the two generated halves at the beam ends, then pack both into
   // identical canvases. This closes the source sheet's exploded-view gap.
   const raw=await sharp(input).ensureAlpha().raw().toBuffer();
   const {regions,labels}=spriteRegions(raw,meta.width,meta.height,2,1);
   if(regions.length!==2)throw Error('Expected two lintel halves: '+job.id);
   function beamCenter(region,x){let lo=meta.height,hi=0;for(let y=0;y<meta.height;y++)for(let dx=-3;dx<=3;dx++)if(labels[y*meta.width+x+dx]===region.label){lo=Math.min(lo,y);hi=Math.max(hi,y);}return (lo+hi)/2;}
   const joinBack=regions[0].x+regions[0].width-36,joinFront=regions[1].x+36;
   const dx=joinBack-joinFront,dy=Math.round(beamCenter(regions[0],joinBack)-beamCenter(regions[1],joinFront));
   const placements=regions.map((r,i)=>({x:Math.max(0,r.x-4)+(i?dx:0),y:Math.max(0,r.y-4)+(i?dy:0)}));
   const parts=regions.map(r=>extractSprite(raw,meta.width,meta.height,labels,r));
   const minX=Math.min(...placements.map(p=>p.x)),minY=Math.min(...placements.map(p=>p.y));
   const fullWidth=Math.max(...placements.map((p,i)=>p.x+parts[i].width))-minX,fullHeight=Math.max(...placements.map((p,i)=>p.y+parts[i].height))-minY;
   const scale=Math.min(600/fullWidth,600/fullHeight),originX=(640-fullWidth*scale)/2,originY=632-fullHeight*scale;
   for(let i=0;i<2;i++){
    const p=parts[i],part=await sharp(p.pixels,{raw:{width:p.width,height:p.height,channels:4}}).resize(Math.round(p.width*scale),Math.round(p.height*scale)).png().toBuffer();
    const left=Math.round(originX+(placements[i].x-minX)*scale),top=Math.round(originY+(placements[i].y-minY)*scale);
    const png=await blank(640,640).composite([{input:part,left,top}]).png().toBuffer();
    await register(job,job.id+'-'+job.split[i],png,{assembly:job.id,drawOrder:i===0?'behind-player':'in-front-of-player',usage:'Aligned slide-under lintel layer. Draw back, then sliding actor, then front, all at the same bottom-center anchor.'});
   }
  }else if(job.category==='backgrounds'){
   const png=await tileExport(input,sharp);
   await register(job,job.id,png,{anchor:{x:0,y:0},repeat:'x',wrapBlendPixels:256,parallax:job.layer==='far'?.12:job.layer==='middle'?.35:.7,layer:job.layer,baseColor:theme==='divine'?'#eee4cd':'#231e24',...(job.layer==='near'?{counterpart:theme==='divine'?'corrupt-near-smoke':'divine-near-clouds'}:{}),usage:'Horizontal parallax layer with a 256px premultiplied-alpha wrap blend. Repeat every 2048px over the realm base color; alpha retained for compositing.'});
  }else{
   const b=await bounds(input),sprite=await sharp(input).extract({left:b.x,top:b.y,width:b.width,height:b.height}).resize({width:608,height:608,fit:'inside'}).png().toBuffer(),sm=await sharp(sprite).metadata();
   const png=await blank(640,640).composite([{input:sprite,left:Math.round((640-sm.width)/2),top:632-sm.height}]).png().toBuffer();
   await register(job,job.id,png,{usage:'Transparent 640px prop, bottom-center anchor. Set collision footprint in game world units.'});
  }
 }
 assets.push(...await buildAudio(root));
 return assets;
}
