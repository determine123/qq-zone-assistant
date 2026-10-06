// Direct target-album download. No preview or other-album discovery.
let pendingAddress=null,currentAddress=null,opening=false;
async function downloadTarget(c){
 if(running)return;
 const task=async()=>{
  running=true;paused=false;
  try{
   await save();const data=await readPhotoPage(c,0);const page=QCore.photoPage(data);
   const previous=records[c.id];const name=page.name||previous?.name;
   if(!name)throw new Error('无法确认相册名称，停止下载以确保排除规则有效');
   if(blocked(name))throw new Error('相册命中排除规则');
   const album=records[c.id]={...(previous||{id:c.id,done:{}}),name,total:page.total??0};
   selected.clear();selected.add(c.id);captures[c.id]=c;await persist();
   say('正在读取 '+name+'，随后直接下载…');const list=await photos(c,album);if(!list)return;
   for(let i=0;i<list.length&&!paused;i++){
    await download(list[i],album);$('progress').value=100*(i+1)/list.length;say(name+' · 已处理 '+(i+1)+'/'+list.length);await wait(200);
   }
   const failed=Object.values(album.done).filter(p=>p.status==='failed').length;
   say(paused?'已暂停，点击继续 / 重试':album.readWarning?'已保存已读取的 '+list.length+' 张（失败 '+failed+' 张）。'+album.readWarning+'；相册尚未完整下载，请刷新目标相册后继续。':failed?'下载结束 · 失败 '+failed+' 张，点击重试':'下载完成 · '+list.length+' 张，请查看浏览器下载目录');
  }catch(e){say('下载停止：'+e.message);}
  finally{running=false;await persist();}
 };
 if(navigator.locks)await navigator.locks.request('qzone-backup-download',{ifAvailable:true},async lock=>{if(lock)await task();else say('另一个管理页正在下载');});else await task();
}
async function openAddress(){
 if(running||opening){say('请先暂停并等待当前任务结束');return;}
 opening=true;
 try{
  const address=QCore.albumAddress($('album-address').value);if(!address.album)throw new Error('请输入含 /photo/相册ID/ 的完整相册地址');
  if(!await save())return;currentAddress=address;await chrome.storage.local.set({targetAddress:address});say('正在准备目标相册…');
  const saved=await chrome.storage.local.get(['captures','records']);records=saved.records||{};captures=saved.captures||{};
  const id=address.account+':'+address.album,c=captures[id];
  if(c&&Date.now()-(c.seen||0)<120000){await downloadTarget(c);return;}
  pendingAddress={...address,after:Date.now()};await chrome.storage.local.set({pendingAddress});await chrome.tabs.create({url:address.url});
  say('目标相册已打开，加载照片后自动下载。若要求登录，请手动登录后刷新目标相册。');
 }catch(e){say(e.message);}finally{opening=false;}
}
chrome.storage.onChanged.addListener((changes,area)=>{
 if(area!=='local'||!changes.captures||!pendingAddress)return;
 const p=pendingAddress,id=p.account+':'+p.album,c=changes.captures.newValue?.[id];if(!c||c.seen<p.after)return;
 pendingAddress=null;chrome.storage.local.remove('pendingAddress');
 setTimeout(()=>downloadTarget(c).catch(e=>say(e.message)),500);
});
$('open-address').onclick=openAddress;$('resume').onclick=openAddress;
const diagnostic=document.createElement('button');diagnostic.textContent='导出接口诊断';diagnostic.onclick=async()=>{
 const {photoDiagnostic}=await chrome.storage.local.get(['photoDiagnostic']);if(!photoDiagnostic){say('没有失败接口诊断，请先重试下载');return;}
 const url=URL.createObjectURL(new Blob([JSON.stringify(photoDiagnostic,null,2)],{type:'application/json'}));
 try{const id=await chrome.downloads.download({url,filename:'QQ相册接口诊断.json',saveAs:false});await monitor(id,false);say('诊断已导出：仅包含字段结构与数量，不含 Cookie、令牌或照片内容');}finally{URL.revokeObjectURL(url);}
};$('export').after(diagnostic);
chrome.storage.local.get(['pendingAddress','targetAddress']).then(s=>{
 if(s.targetAddress){currentAddress=s.targetAddress;$('album-address').value=currentAddress.url;}
 if(s.pendingAddress&&Date.now()-s.pendingAddress.after<1800000)pendingAddress=s.pendingAddress;
});
