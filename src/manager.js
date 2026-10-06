/* MIT; original project copyright (c) 2024 wz. */
const $=id=>document.getElementById(id);
let records={},captures={},settings={},running=false,paused=false,refreshing=false,initialized=false,autoPending=false;
const selected=new Set();
const say=text=>$('status').textContent=text;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(url){
  let error;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(url,{credentials:'include',signal:AbortSignal.timeout(25000)});
      if(!response.ok)throw new Error('请求失败 HTTP '+response.status);
      return QCore.parse(await response.text());
    }catch(e){error=e;if(/QQ 接口|格式/.test(e.message))throw e;if(attempt<2)await wait(1000*2**attempt);}
  }throw error;
}
async function persist(){await chrome.storage.local.set({records});}
async function readPhotoPage(c,start,requestedSize=30){
  let last;
  for(const size of [...new Set([Math.min(30,requestedSize),10])]){
    const data=await request(QCore.page(c.url,start,size));
    try{QCore.photoPage(data);return data;}catch(e){
      last=e;await chrome.storage.local.set({photoDiagnostic:{version:1,offset:start,pageSize:size,shape:QCore.shape(data)}});
      if(!/未返回照片列表/.test(e.message))throw e;await wait(500);
    }
  }
  const {photoDiagnostic}=await chrome.storage.local.get(['photoDiagnostic']);
  let exported=false;
  if(photoDiagnostic){
    const blobUrl=URL.createObjectURL(new Blob([JSON.stringify(photoDiagnostic,null,2)],{type:'application/json'}));
    try{const id=await chrome.downloads.download({url:blobUrl,filename:'QQ相册接口诊断.json',saveAs:false,conflictAction:'uniquify'});await monitor(id,false);exported=true;}catch(e){}finally{URL.revokeObjectURL(blobUrl);}
  }
  throw new Error(last.message+(exported?'；接口诊断已自动保存到下载目录':'；请导出接口诊断文件以便适配'));
}
function blocked(name){return QCore.excluded(name,settings.exclude||'');}
function render(){
  if(!$('albums'))return;
  $('albums').replaceChildren();
  for(const [id,album] of Object.entries(records)){
    const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';
    box.disabled=blocked(album.name);box.checked=!box.disabled&&selected.has(id);
    box.addEventListener('change',()=>box.checked?selected.add(id):selected.delete(id));
    const done=Object.values(album.done||{}).filter(p=>p.status==='complete').length;
    label.append(box,document.createTextNode(album.name+' · '+album.total+' 张 · 已下载 '+done+(box.disabled?' · 已排除':'')));
    $('albums').append(label);
  }
}
async function refresh(){
  if(refreshing)return;refreshing=true;
  try{
    const stored=await chrome.storage.local.get(['captures','records','settings']);
    captures=stored.captures||{};if(!running)records=stored.records||{};
    settings=stored.settings||{exclude:'',auto:false,limit:null};
    if(!initialized){for(const [id,a] of Object.entries(records))if(!blocked(a.name))selected.add(id);initialized=true;}
    for(const [id,c] of Object.entries(captures)){
      if(records[id])continue;
      try{
        const data=await request(QCore.page(c.url,0,1));const name=data.topic?.name;
        if(!name){say('相册名称无法识别，请在 QQ 空间打开普通相册');continue;}
        records[id]={id,name,total:Number(data.totalInAlbum)||0,done:{}};
        if(!blocked(name))selected.add(id);
      }catch(e){say(e.message);}
    }
    await persist();render();
  }finally{refreshing=false;}
}
async function discover(){
  if(running||refreshing){say('请先暂停当前任务');return;}
  try{
    const {listUrl,captures:saved}=await chrome.storage.local.get(['listUrl','captures']);
    const sample=Object.values(saved||{})[0];
    if(!sample)throw new Error('请先在 QQ 空间打开任意一个普通相册，再重试');
    const effectiveListUrl=listUrl||QCore.listFromPhoto(sample.url);
    const listAccount=new URL(effectiveListUrl).searchParams.get('hostUin')||new URL(effectiveListUrl).searchParams.get('uin');
    const matching=Object.values(saved).find(c=>!listAccount||c.id.split(':')[0]===listAccount);
    if(!matching)throw new Error('相册列表和照片接口属于不同账号，请打开同一账号的普通相册');
    const all={...saved};let start=0;const ids=new Set();
    while(start<10000){
      say('正在读取相册列表 · 偏移 '+start);
      const listRequest=new URL(QCore.page(effectiveListUrl,start,100));
      listRequest.searchParams.set('mode','2');listRequest.searchParams.set('sortOrder','2');
      const data=await request(listRequest.href);
      const list=QCore.albumList(data);
      if(!list.length)break;
      let fresh=0;
      for(const album of list){
        const albumId=album.id||album.topicId;if(!albumId||ids.has(String(albumId)))continue;
        ids.add(String(albumId));fresh++;
        if(!album.name||blocked(album.name)||Number(album.allowAccess)===0)continue;
        const u=new URL(QCore.retarget(matching.url,matching.id.split(':')[0],albumId));
        const id=QCore.key(u.href);all[id]={id,url:u.href,seen:Date.now()};
        records[id]={...(records[id]||{id,done:{}}),name:album.name,total:Number(album.total||album.photoCount||album.totalInAlbum)||0};
        selected.add(id);
      }
      if(!fresh)break;
      start+=list.length;
      const total=Number(data.totalAlbum||data.albumTotal||data.total);
      if(total&&start>=total)break;
      await wait(400);
    }
    await persist();await chrome.storage.local.set({captures:all});await refresh();say('列表返回 '+ids.size+' 个相册；可下载 '+Object.values(records).filter(a=>!blocked(a.name)&&all[a.id]).length+' 个。已排除指定相册及无访问权限相册，请检查勾选结果。');
  }catch(e){say(e.message);}
}
async function photos(c,album){
  let start=0,result=[],total=Number(album.total)>0?Number(album.total):Infinity,repeated=0,pageSize=100;const seen=new Set();album.readWarning=null;
  const limit=settings.limit||Infinity;
  while(start<Math.min(total,limit)){
    if(paused)return null;
    const data=await readPhotoPage(c,start,pageSize);
    const page=QCore.photoPage(data);
    if(page.name&&blocked(page.name))throw new Error('相册命中排除规则，已停止');
    if(page.name)album.name=page.name;
    if(page.total!==null){total=page.total;album.total=total;}
    if(!page.list.length){if(Number.isFinite(total)&&start<Math.min(total,limit))album.readWarning='分页提前结束';break;}
    let fresh=0;
    for(const p of page.list){const item=QCore.photo(p,result.length);if(seen.has(item.id))continue;seen.add(item.id);result.push(item);fresh++;if(result.length>=limit)break;}
    if(!fresh){
      repeated++;if(repeated<=2){pageSize=20;say('照片接口返回重复页，正在重新读取偏移 '+start+'（'+repeated+'/2）');await wait(600*repeated);continue;}
      album.readWarning='接口持续返回重复页';break;
    }
    repeated=0;
    start+=page.list.length;await wait(350);
  }
  album.readCount=result.length;
  return result;
}
async function download(item,album){
  const path='QQ空间备份/'+QCore.safe(album.id.split(':')[0])+'/'+QCore.safe(album.name)+'-'+QCore.safe(album.id.split(':').slice(1).join(':'))+'/'+item.file;
  const previous=album.done[item.id];
  if(previous?.downloadId){
    const [old]=await chrome.downloads.search({id:previous.downloadId});
    if(old?.state==='complete'&&old.exists!==false){previous.status='complete';return;}
    if(old?.state==='in_progress'){await monitor(old.id);previous.status='complete';await persist();return;}
  }
  for(let attempt=0;attempt<3;attempt++){
    if(paused)return;
    try{
      const downloadId=await chrome.downloads.download({url:item.url,filename:path,saveAs:false,conflictAction:'uniquify'});
      album.done[item.id]={name:item.name,file:path,time:item.time,location:item.location,downloadId,status:'downloading'};await persist();
      await monitor(downloadId);album.done[item.id].status='complete';await persist();return;
    }catch(e){
      album.done[item.id]={...(album.done[item.id]||{}),name:item.name,file:path,time:item.time,location:item.location,status:'failed',error:e.message};await persist();
      if(/USER_|FILE_|blocked|危险/.test(e.message))throw e;
      if(attempt<2)await wait(1000*2**attempt);
    }
  }
}
async function monitor(id,image=true){
  const deadline=Date.now()+180000;
  while(Date.now()<deadline){
    const [item]=await chrome.downloads.search({id});
    if(item?.state==='complete'){
      if(image&&item.mime&&/text\/|application\/(json|xhtml)/.test(item.mime))throw new Error('响应不是图片，可能登录失效');
      return;
    }
    if(!item||item.state==='interrupted')throw new Error(item?.error||'下载已中断');
    if(item.danger&&item.danger!=='safe'&&item.danger!=='accepted'&&item.danger!=='allowlistedByPolicy')throw new Error('下载被浏览器标记，请手动检查下载面板');
    await wait(500);
  }
  await chrome.downloads.cancel(id);throw new Error('下载超时');
}
async function runTask(){
  if(running)return;running=true;paused=false;if($('start'))$('start').disabled=true;
  try{
    await refresh();
    for(const id of [...selected]){
      if(paused)break;
      const album=records[id],capture=captures[id];if(!album||!capture||blocked(album.name))continue;
      say('读取 '+album.name+' 的全部照片…');const list=await photos(capture,album);if(!list)break;
      let finished=0;
      for(const item of list){
        if(paused||blocked(album.name))break;
        await download(item,album);finished++;
        $('progress').value=100*finished/Math.max(1,list.length);
        const failed=Object.values(album.done).filter(p=>p.status==='failed').length;
        say(album.name+' · 已处理 '+finished+'/'+list.length+' · 失败 '+failed);await wait(200);
      }
      await persist();render();
    }
    const failures=Object.values(records).filter(a=>selected.has(a.id)&&!blocked(a.name)).reduce((n,a)=>n+Object.values(a.done).filter(p=>p.status==='failed').length,0);
    say(paused?'已暂停，可以点击继续':failures?'任务结束，失败 '+failures+' 张；点击继续重试':'任务结束，请在浏览器下载目录查看照片');
  }catch(e){say('任务停止：'+e.message+'。重新打开 QQ 相册后可以继续。');}
  finally{running=false;if($('start'))$('start').disabled=false;render();if(autoPending&&settings.auto&&!paused){autoPending=false;setTimeout(()=>start().catch(e=>say(e.message)),100);}}
}
async function start(){
  if(!navigator.locks){await runTask();return;}
  await navigator.locks.request('qzone-backup-download',{ifAvailable:true},async lock=>{
    if(!lock){say('另一个管理页面正在下载，请回到该页面操作');return;}
    await runTask();
  });
}
async function save(){
  const text=$('limit')?.value.trim()||'',limit=text?Number(text):null;
  if(limit!==null&&(!Number.isSafeInteger(limit)||limit<1)){say('最大数量必须是正整数，或留空');return false;}
  settings={exclude:$('exclude').value,auto:false,limit};await chrome.storage.local.set({settings});render();return true;
}
async function exportManifest(){
  const albums=Object.values(records).filter(a=>!blocked(a.name)).map(a=>({name:a.name,photos:Object.values(a.done||{}).filter(p=>p.status==='complete').map(({name,file,time,location})=>({name,file,time,location,locationConfirmed:false}))}));
  const blob=new Blob([JSON.stringify({version:1,generatedAt:new Date().toISOString(),publication:'review_required',albums},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);try{const id=await chrome.downloads.download({url,filename:'QQ空间备份/照片清单.json',saveAs:false,conflictAction:'uniquify'});await monitor(id,false);say('照片清单已导出；没有地点的照片需要补充地点，未自动公开');}finally{URL.revokeObjectURL(url);}
}

$('save').onclick=async()=>{if(await save())say('设置已保存');};
$('pause').onclick=()=>{paused=true;say('正在暂停，等待当前图片完成');};
$('export').onclick=()=>exportManifest().catch(e=>say(e.message));
chrome.storage.onChanged.addListener(async(changes,area)=>{
  if(area!=='local'||!changes.captures)return;
  try{await refresh();if(settings.auto){if(running)autoPending=true;else await start();}}catch(e){say(e.message);}
});
(async()=>{await refresh();$('exclude').value=settings.exclude;settings.auto=false;settings.limit=null;await chrome.storage.local.set({settings});})().catch(e=>say(e.message));
