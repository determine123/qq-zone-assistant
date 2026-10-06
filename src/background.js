importScripts('core.js');
// Session URLs are kept locally, never written to logs or exported manifests.
let writes=Promise.resolve();
chrome.webRequest.onBeforeRequest.addListener(details=>{
  if(details.tabId<0)return;
  writes=writes.then(async()=>{
    const u=new URL(details.url);
    const stored=await chrome.storage.local.get(['captures','listUrl']);
    if(u.pathname.includes('cgi_list_photo')){
      const id=QCore.key(details.url);if(id.endsWith(':'))return;
      const captures=stored.captures||{};
      captures[id]={id,url:details.url,seen:Date.now(),tabId:details.tabId};
      await chrome.storage.local.set({captures});
      await chrome.action.setBadgeText({text:String(Object.keys(captures).length)});
    }else if(/(?:cgi|fcg)_list_album/.test(u.pathname)){
      await chrome.storage.local.set({listUrl:details.url});
    }
  }).catch(()=>{});
},{urls:['https://*.qzone.qq.com/*cgi_list_photo*','https://*.qzone.qq.com/*cgi_list_album*','https://*.qzone.qq.com/*fcg_list_album*']});
chrome.action.onClicked.addListener(async()=>{
  const url=chrome.runtime.getURL('src/manager.html');
  const tabs=await chrome.tabs.query({url});
  if(tabs.length)await chrome.tabs.update(tabs[0].id,{active:true});
  else await chrome.tabs.create({url});
});
