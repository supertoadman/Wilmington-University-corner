const {chromium}=require(process.env.PLAYWRIGHT_PATH);
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
const root=path.resolve(__dirname,'..');await fs.mkdir(path.join(root,'previews'),{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost:4174/',{waitUntil:'networkidle'});
await page.waitForFunction(()=>document.getElementById('sceneStatus').textContent.startsWith('Switch realms'));
assert.equal(await page.locator('.card').count(),143);
assert.equal(await page.locator('.roster-card').count(),3);
await page.locator('.protagonists').screenshot({path:path.join(root,'previews/protagonist-lineup-divine.png')});
const decoded=await page.evaluate(async()=>{
 const result=[];
 for(const a of window.TEMPLE_ASSETS.assets){
  if(a.type==='audio')continue;
  const im=new Image();im.src=a.src;await im.decode();result.push(a.id);
 }
 const audio=new OfflineAudioContext(1,44100,44100);
 const sounds=[];
 for(const a of window.TEMPLE_ASSETS.assets.filter(a=>a.type==='audio')){const response=await fetch(a.src);const buffer=await audio.decodeAudioData(await response.arrayBuffer());sounds.push({id:a.id,duration:buffer.duration});}
 return {images:result.length,audio:sounds.length};
});
await page.locator('#scene').screenshot({path:path.join(root,'previews/divine-sanctuary-assembly.png')});
await page.screenshot({path:path.join(root,'previews/viewer-desktop.png')});
await page.selectOption('#sceneTheme','corrupt');
await page.waitForFunction(()=>document.getElementById('sceneStatus').textContent.startsWith('Switch realms'));
await page.selectOption('#actor','aristotle');await page.selectOption('#pose','jump');
await page.locator('.protagonists').screenshot({path:path.join(root,'previews/protagonist-lineup-corrupt.png')});
await page.locator('#scene').screenshot({path:path.join(root,'previews/corrupt-sanctuary-assembly.png')});
await page.selectOption('#category','characters');assert.equal(await page.locator('.card').count(),12);
await page.getByRole('button',{name:'Inspect Divine Socrates',exact:true}).click();
await page.waitForSelector('#spritePreview');assert(await page.locator('#details').isVisible());
await page.getByRole('button',{name:'View counterpart',exact:true}).click();
assert.equal(await page.locator('.detail-copy h2').textContent(),'Corrupt Socrates');
await page.getByRole('button',{name:'Close asset details'}).click();
await page.selectOption('#category','all');await page.fill('#search','temple');assert.equal(await page.locator('.card').count(),2);
await page.fill('#search','');await page.selectOption('#theme','divine');assert.equal(await page.locator('.card').count(),67);
await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(root,'previews/viewer-mobile.png')});
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'mobile horizontal overflow');
const filePage=await browser.newPage();
await filePage.goto('file:///'+root.replaceAll('\\','/')+'/viewer.html');
await filePage.waitForFunction(()=>document.getElementById('sceneStatus').textContent.startsWith('Switch realms'));
assert.equal(await filePage.locator('.card').count(),143);
await browser.close();
assert.deepEqual(errors,[]);
const report={allAssetsDecode:decoded,initialCards:143,characterFilter:12,templeSearch:2,realmFilter:67,counterpartDialog:true,desktop:true,mobileNoOverflow:true,offlineFileViewer:true,browserErrors:errors};
await fs.writeFile(path.join(root,'source/browser-validation-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exit(1);});

