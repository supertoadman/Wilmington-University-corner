// Extract disconnected sprites from an authored transparent atlas. This is
// sprite packing, not background removal: source RGBA values are preserved.
export function spriteRegions(data,width,height,columns,rows,threshold=24){
 const size=width*height,labels=new Int32Array(size),queue=new Int32Array(size),components=[];
 let label=0;
 for(let start=0;start<size;start++){
  if(labels[start]||data[start*4+3]<=threshold)continue;
  label++;let head=0,tail=1,x0=width,y0=height,x1=0,y1=0;queue[0]=start;labels[start]=label;
  while(head<tail){
   const ix=queue[head++],x=ix%width,y=Math.floor(ix/width);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
   for(const next of [x?ix-1:-1,x<width-1?ix+1:-1,y?ix-width:-1,y<height-1?ix+width:-1])if(next>=0&&!labels[next]&&data[next*4+3]>threshold){labels[next]=label;queue[tail++]=next;}
  }
  components.push({label,area:tail,x:x0,y:y0,width:x1-x0+1,height:y1-y0+1,cx:(x0+x1)/2,cy:(y0+y1)/2});
 }
 const major=components.filter(c=>c.area>width*height/(columns*rows)*.025).sort((a,b)=>b.area-a.area).slice(0,columns*rows);
 // Row sorting tolerates different contact heights (jump/slide/fall).
 major.sort((a,b)=>a.cy-b.cy);const ordered=[];
 for(let r=0;r<rows;r++)ordered.push(...major.slice(r*columns,(r+1)*columns).sort((a,b)=>a.cx-b.cx));
 return {regions:ordered,labels,components};
}

export function extractSprite(data,width,height,labels,region){
 const left=Math.max(0,region.x-4),top=Math.max(0,region.y-4),w=Math.min(width,region.x+region.width+4)-left,h=Math.min(height,region.y+region.height+4)-top;
 const pixels=Buffer.alloc(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const sx=left+x,sy=top+y,ix=sy*width+sx;let selected=labels[ix]===region.label;
  // Preserve the selected sprite's antialiased fringe, but exclude pixels
  // belonging to a neighboring sprite or disconnected atlas guide.
  if(!selected&&!labels[ix]&&data[ix*4+3]>0){
   for(let dy=-3;dy<=3&&!selected;dy++)for(let dx=-3;dx<=3;dx++){const nx=sx+dx,ny=sy+dy;if(nx>=0&&ny>=0&&nx<width&&ny<height&&labels[ny*width+nx]===region.label){selected=true;break;}}
  }
  if(selected)data.copy(pixels,(y*w+x)*4,ix*4,ix*4+4);
 }
 return {pixels,width:w,height:h};
}
