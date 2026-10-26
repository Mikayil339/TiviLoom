export function mountLogos(platform){
 const memory=new Map(),pending=[],seen=new WeakSet();let active=0;
 const db=new Promise(resolve=>{try{const req=indexedDB.open('TiviLoomLogos',1);req.onupgradeneeded=()=>req.result.createObjectStore('images',{keyPath:'url'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null);}catch{resolve(null);}});
 async function cached(url){try{const d=await db;if(!d)return null;return await new Promise(resolve=>{const req=d.transaction('images').objectStore('images').get(url);req.onsuccess=()=>resolve(req.result?.expires>Date.now()?req.result.data:null);req.onerror=()=>resolve(null);});}catch{return null;}}
 async function store(url,data){try{const d=await db;if(!d)return;const tx=d.transaction('images','readwrite'),s=tx.objectStore('images');s.put({url,data,expires:Date.now()+7*86400000});const keys=s.getAllKeys();keys.onsuccess=()=>{for(const key of keys.result.slice(0,Math.max(0,keys.result.length-200)))s.delete(key);};}catch{}}
 async function fetchLogo(url){
  const ticket=await platform.request('fetchImage',{url});const parts=[];
  try{for(let i=0;i<ticket.chunks;i++)parts.push((await platform.request('readSource',{ticket:ticket.ticket,index:i})).text);return parts.join('');}finally{platform.request('releaseSource',{ticket:ticket.ticket}).catch(()=>{});}
 }
 async function process(img){const url=img.dataset.logoUrl;if(!url)return;let data=memory.get(url);if(data?.failed&&data.until>Date.now())return;if(data?.direct&&data.until>Date.now()){img.referrerPolicy='no-referrer';img.src=data.direct;return;}
  if(!data||data.failed||data.direct){data=await cached(url);if(!data){try{data=await fetchLogo(url);store(url,data);}catch{memory.set(url,{direct:url,until:Date.now()+30*60000});img.referrerPolicy='no-referrer';img.src=url;return;}}memory.set(url,data);while(memory.size>200)memory.delete(memory.keys().next().value);}
  if(img.isConnected)img.src=data;
 }
 function drain(){while(active<3&&pending.length){const img=pending.shift();if(!img.isConnected)continue;active++;process(img).catch(()=>{}).finally(()=>{active--;drain();});}}
 const observer=new IntersectionObserver(items=>{for(const item of items)if(item.isIntersecting){observer.unobserve(item.target);pending.push(item.target);}drain();},{rootMargin:'100px'});
 function scan(){document.querySelectorAll('img[data-logo-url]').forEach(img=>{if(seen.has(img))return;seen.add(img);img.onload=()=>{img.parentElement.classList.add('logo-ready');};img.onerror=()=>{memory.set(img.dataset.logoUrl,{failed:true,until:Date.now()+30*60000});img.hidden=true;img.parentElement.classList.remove('logo-ready');};observer.observe(img);});}
 let queued=false;new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(()=>{queued=false;scan();});}}).observe(document.querySelector('#tv-screen'),{childList:true,subtree:true});scan();
 return {refresh:scan};
}
