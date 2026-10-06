/* MIT; original project copyright (c) 2024 wz. */
(function(root){
  const normalize=s=>String(s||'').normalize('NFKC').replace(/\s/g,'').toLowerCase();
  const excluded=(name,lines)=>String(lines).split('\n').some(s=>normalize(s)&&normalize(s)===normalize(name));
  const safe=s=>String(s||'未命名').normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/\.{2,}/g,'_').replace(/[. ]+$/g,'').slice(0,70)||'未命名';
  function parse(text){
    const t=text.trim();
    if(/^\s*</.test(t))throw new Error('接口返回登录页或错误页面，请手动登录 QQ 空间后刷新目标相册');
    const match=t.match(/^[\w.$]+\s*\(([\s\S]*)\)\s*;?$/);
    const value=JSON.parse(t.startsWith('{')?t:match?match[1]:t);
    if(value.code!=null&&Number(value.code)!==0)throw new Error('QQ 接口拒绝请求，请重新登录或打开相册刷新授权');
    if(!value.data)throw new Error('相册接口格式不受支持');
    return value.data;
  }
  let requestSequence=0;
  function page(url,start,count=100){const u=new URL(url);u.searchParams.set('pageStart',start);u.searchParams.set('pageNum',count);if(u.pathname.includes('cgi_list_photo')){u.searchParams.set('noTopic','0');u.searchParams.delete('singleurl');}u.searchParams.set('_',Date.now()+'-'+(++requestSequence));return u.href;}
  function shape(data,depth=0){
    if(data===null)return 'null';if(Array.isArray(data))return {type:'array',length:data.length,item:data.length&&depth<3?shape(data[0],depth+1):null};
    if(typeof data!=='object')return typeof data;
    if(depth>=3)return 'object';const result={};for(const key of Object.keys(data).slice(0,50)){if(/token|cookie|auth|password|secret|g_tk|uin/i.test(key))continue;result[key]=shape(data[key],depth+1);}return result;
  }
  function key(url){const u=new URL(url);return (u.searchParams.get('hostUin')||u.searchParams.get('uin')||'未知账号')+':'+(u.searchParams.get('topicId')||u.searchParams.get('albumid')||'');}
  function retarget(url,account,album){
    const u=new URL(url);
    if(key(url).split(':')[0]!==String(account))throw new Error('接口账号与目标账号不一致');
    for(const k of ['albumid','noTopic','singleurl','batchId','question','answer'])u.searchParams.delete(k);
    u.searchParams.set('topicId',album);u.searchParams.set('pageStart','0');u.searchParams.set('pageNum','100');
    return u.href;
  }
  function photo(p,index){
    const url=p.origin_url||p.originUrl||p.raw||p.url;
    const u=new URL(url);
    if(!['http:','https:'].includes(u.protocol)||!/(^|\.)(qpic\.cn|photo\.store\.qq\.com|qzone\.qq\.com|gtimg\.cn)$/.test(u.hostname))throw new Error('照片地址不在支持的 QQ 图片域名范围');
    const ext=u.pathname.match(/\.(jpg|jpeg|png|webp|gif)$/i)?.[1]||'jpg';
    return {id:String(p.lloc||p.sloc||p.id||u.href),name:String(p.name||'照片'),url:u.href,file:String(index+1).padStart(5,'0')+'-'+safe(p.name)+'.'+ext,time:p.uploadTime||p.uploadtime||p.shootTime||null,location:p.location||p.address||null};
  }
  function photoPage(data){
    const container=data.photoList??data.photo_list??data.photos??data.photoListInfo?.photoList;
    const list=Array.isArray(container)?container:Array.isArray(container?.list)?container.list:null;
    const raw=data.totalInAlbum??data.total??data.photoListInfo?.total;
    const total=raw==null?null:Number(raw);
    if(total!==null&&(!Number.isSafeInteger(total)||total<0))throw new Error('照片总数无法识别');
    if(!list&&total!==0)throw new Error('接口未返回照片列表，请在目标相册刷新；不会把缺失数据当成下载成功');
    return {list:list||[],total,name:data.topic?.name||data.album?.name||null};
  }
  function albumList(data){
    const lists=[];
    for(const field of ['albumList','topicList','albumListModeSort'])if(Array.isArray(data[field]))lists.push(...data[field]);
    for(const group of data.albumListModeClass||[])if(Array.isArray(group.albumList))lists.push(...group.albumList);
    if(!lists.length&&!['albumList','topicList','albumListModeSort','albumListModeClass'].some(k=>Array.isArray(data[k])))throw new Error('当前相册列表结构不兼容');
    return [...new Map(lists.filter(a=>a&&(a.id||a.topicId)).map(a=>[String(a.id||a.topicId),a])).values()];
  }
  function listFromPhoto(photoUrl){
    const u=new URL(photoUrl);u.hostname='user.qzone.qq.com';u.pathname='/proxy/domain/photo.qzone.qq.com/fcgi-bin/fcg_list_album_v3';
    for(const k of ['topicId','albumid','noTopic','singleurl','batchId','question','answer'])u.searchParams.delete(k);
    for(const [k,v] of Object.entries({mode:'2',sortOrder:'2',filter:'1',handset:'4',pageNumModeSort:'100',pageNumModeClass:'100',needUserInfo:'1',pageStart:'0',pageNum:'100'}))u.searchParams.set(k,v);
    return u.href;
  }
  function albumAddress(text){
    const u=new URL(text.trim());if(u.protocol!=='https:'||u.hostname!=='user.qzone.qq.com')throw new Error('请输入 https://user.qzone.qq.com/ 开头的相册地址');
    const account=u.pathname.match(/^\/(\d+)(?:\/|$)/)?.[1];if(!account)throw new Error('网址缺少 QQ 空间账号');
    const hash=new URLSearchParams(u.hash.replace(/^#!?/,''));
    const album=u.searchParams.get('topicId')||hash.get('topicId')||u.pathname.match(/\/photo\/([^/]+)\/?$/)?.[1]||null;
    return {url:u.href,account,album};
  }
  function representative(list,count=24){
    const unique=[...new Map(list.map(p=>[p.id,p])).values()];
    count=Math.max(1,Math.min(100,Math.floor(Number(count)||24)));
    if(unique.length<=count)return unique;
    if(count===1)return [unique[0]];
    return Array.from({length:count},(_,i)=>unique[Math.round(i*(unique.length-1)/(count-1))]);
  }
  const api={normalize,excluded,safe,parse,page,key,shape,retarget,photo,photoPage,albumList,listFromPhoto,albumAddress,representative};root.QCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
