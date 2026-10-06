const assert=require('node:assert/strict');const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),headless:true});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
   const stored={settings:{exclude:'示例排除相册'},captures:{'1:A':{id:'1:A',url:'https://h5.qzone.qq.com/cgi_list_photo?hostUin=1&topicId=A&token=PRIVATE'},'1:B':{id:'1:B',url:'https://h5.qzone.qq.com/cgi_list_photo?hostUin=1&topicId=B&token=PRIVATE'}}};
   const downloads=[];const nativeFetch=fetch;
   window.fake={stored,downloads};
   for(const c of Object.values(stored.captures))c.seen=Date.now();
   window.chrome={storage:{local:{get:async keys=>Object.fromEntries(keys.map(k=>[k,stored[k]])),set:async data=>Object.assign(stored,structuredClone(data))},onChanged:{addListener(){}}},downloads:{download:async options=>{let exported;if(options.url.startsWith('blob:'))exported=await(await nativeFetch(options.url)).json();const id=downloads.length+1;downloads.push({...options,id,exported});return id;},search:async({id})=>[{id,state:'complete',exists:true,mime:downloads[id-1].exported?'application/json':'image/jpeg'}],cancel:async()=>{}}};
   window.fetch=async url=>{
     const u=new URL(url);const excluded=u.searchParams.get('topicId')==='B';const start=Number(u.searchParams.get('pageStart'));const count=Number(u.searchParams.get('pageNum'));
     if(u.pathname.includes('fcg_list_album'))return new Response(JSON.stringify({code:0,data:{totalAlbum:3,albumListModeSort:start===0?[{id:'A',name:'旅行',total:3},{id:'C',name:'川藏线',total:5},{id:'B',name:'示例排除相册',total:3}]:[]}}));
     const list=[0,1,2].map(i=>({lloc:'id'+i,name:'同名',url:'https://a.qpic.cn/'+i+'.jpg',location:i===0?'成都':null}));
     return new Response(JSON.stringify({code:0,data:{topic:{name:excluded?'示例排除相册':'旅行'},totalInAlbum:3,photoList:list.slice(start,start+(count===1?1:2))}}));
   };
 });
 await page.goto('file:///'+path.resolve(__dirname,'../src/manager.html').replaceAll('\\','/'));

 await page.waitForFunction(()=>!!fake.stored.settings);
 assert.equal(await page.locator('#albums,#discover,#refresh,#download-two-targets').count(),0);
 await page.fill('#album-address','https://user.qzone.qq.com/1/photo/A');await page.fill('#sample-count','2');await page.click('#open-address');
 await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('精选下载结束'));
 assert.equal(await page.locator('#preview-grid input:checked').count(),2);assert.equal(await page.evaluate(()=>fake.downloads.length),2);
 await page.click('#download-preview');await page.waitForTimeout(1000);assert.equal(await page.evaluate(()=>fake.downloads.length),2);
 await page.fill('#album-address','https://user.qzone.qq.com/1/photo/B');await page.click('#open-address');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('命中排除规则'));assert.equal(await page.evaluate(()=>fake.downloads.length),2);
 await page.fill('#album-address','https://evil.example/x');await page.click('#open-address');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('请输入 https://user.qzone.qq.com/'));
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 console.log('PASS: 单相册界面、一键预览下载、去重续传、排除规则、非法地址、手机布局');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
