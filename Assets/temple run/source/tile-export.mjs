// Assemble a periodic texture from the generated parallax artwork. The
// overlap is blended in premultiplied alpha so translucent cloud edges do
// not acquire black fringes. The preserved PNG master is never changed.
export async function tileExport(input,sharp,width=2048,height=1024,overlap=256){
 const sourceWidth=width+overlap;
 const source=await sharp(input).resize(sourceWidth,height,{fit:'fill'}).ensureAlpha().raw().toBuffer();
 const result=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const out=(y*width+x)*4,head=(y*sourceWidth+x)*4;
  if(x>=overlap){source.copy(result,out,head,head+4);continue;}
  const tail=(y*sourceWidth+width+x)*4,u=x/(overlap-1),weight=u*u*(3-2*u);
  const a=source[head+3]/255,b=source[tail+3]/255,alpha=a*weight+b*(1-weight);
  for(let c=0;c<3;c++)result[out+c]=alpha?Math.round((source[head+c]*a*weight+source[tail+c]*b*(1-weight))/alpha):0;
  result[out+3]=Math.round(alpha*255);
 }
 return sharp(result,{raw:{width,height,channels:4}}).png().toBuffer();
}
