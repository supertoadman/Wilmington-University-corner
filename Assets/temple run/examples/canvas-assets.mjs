/** Small dependency-free helpers for Canvas 2D. All asset URLs resolve from the manifest location. */
export async function loadPack(manifestUrl = './manifest.json') {
  const url = new URL(manifestUrl, document.baseURI);
  const response = await fetch(url);
  if (!response.ok) throw new Error('Unable to load manifest: '+response.status);
  const manifest = await response.json();
  const byId = new Map(manifest.assets.map(asset => [asset.id, asset]));
  const cache = new Map();
  async function load(id) {
    const asset = byId.get(id);
    if (!asset) throw new Error('Unknown asset: '+id);
    if (asset.type === 'audio') {
      const probe=document.createElement('audio');
      const source=(asset.sources||[]).find(s=>probe.canPlayType(s.mimeType));
      return {asset,url:new URL(source?.src||asset.src,url).href,sources:asset.sources,loopStart:source?.loopStart??asset.loopStart,loopEnd:source?.loopEnd??asset.loopEnd};
    }
    if (!cache.has(id)) {
      cache.set(id, new Promise((resolve,reject) => {
        const image = new Image();
        image.onload = () => resolve({asset,image});
        image.onerror = () => {cache.delete(id);reject(new Error('Unable to load '+asset.src));};
        image.src = new URL(asset.src,url).href;
      }));
    }
    return cache.get(id);
  }
  return {manifest,byId,load,preload:ids=>Promise.all(ids.map(load))};
}
export function isoToScreen(column,row,tileWidth=256,tileHeight=128) {
  return {x:(column-row)*tileWidth/2,y:(column+row)*tileHeight/2};
}
export function screenToIso(x,y,tileWidth=256,tileHeight=128) {
  return {column:x/tileWidth+y/tileHeight,row:y/tileHeight-x/tileWidth};
}
export function drawAsset(ctx,loaded,x,y,width,{frame,flipX=false,opacity=1}={}) {
  const {asset,image}=loaded;
  const f=frame ? asset.frames?.[frame] : null;
  if(frame && !f) throw new Error('Unknown sprite frame '+frame);
  const w=f?.width||asset.width,h=f?.height||asset.height,anchor=f?.anchor||asset.anchor||{x:.5,y:1};
  const height=width*h/w;
  ctx.save();ctx.globalAlpha=opacity;ctx.translate(x,y);if(flipX)ctx.scale(-1,1);
  if(f)ctx.drawImage(image,f.x,f.y,f.width,f.height,-anchor.x*width,-anchor.y*height,width,height);
  else ctx.drawImage(image,-anchor.x*width,-anchor.y*height,width,height);
  ctx.restore();
}
export function animationFrame(asset,name,elapsedSeconds) {
  const animation=asset.animations?.[name];if(!animation)throw new Error('Unknown animation '+name);
  const index=Math.floor(Math.max(0,elapsedSeconds)*animation.fps);
  return animation.frames[animation.loop?index%animation.frames.length:Math.min(index,animation.frames.length-1)];
}

