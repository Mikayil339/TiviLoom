export function parseM3U(text,base='') {
  if(!/^\s*#EXTM3U/i.test(text.replace(/^\uFEFF/,'')))throw Error('Bu fayl M3U pleylisti deyil. İlk sətir #EXTM3U olmalıdır.');
  const channels=[];let pending=null;let epg='';
  const attr=s=>Object.fromEntries([...s.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g)].map(m=>[m[1].toLowerCase(),m[2]??m[3]??m[4]??'']));
  const resolve=s=>{if(!s)return '';try{const u=new URL(s.trim().replace(/&amp;/g,'&'),base||undefined);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}};
  for(const raw of text.split(/\r?\n/)) {
    const line=raw.trim();if(!line)continue;
    if(line.startsWith('#EXTM3U')){const a=attr(line);epg=resolve(a['url-tvg']||a['x-tvg-url']||'');}
    else if(line.startsWith('#EXTINF:')) {
      const a=attr(line);let quote='',comma=-1;for(let i=0;i<line.length;i++){if(quote){if(line[i]===quote)quote='';}else if(line[i]==='"'||line[i]==="'")quote=line[i];else if(line[i]===','){comma=i;break;}}
      pending={name:comma>=0?line.slice(comma+1).trim():'Kanal',epgId:a['tvg-id']||'',logo:resolve(a['tvg-logo']||a.logo||a['tvg-logo-small']||''),group:a['group-title']||'Ümumi',poster:resolve(a['tvg-logo']||''),catchup:a.catchup||'',catchupSource:a['catchup-source']||a['timeshift-source']||'',catchupDays:Number(a['catchup-days']||a['timeshift-days']||0),type:/^(series|episode)$/i.test(a['tvg-type']||'')||/series|serial|season|episode/i.test(a['group-title']||'')?'series':a['tvg-type']==='movie'||/vod|film|movie/i.test(a['group-title']||'')?'movie':'tv'};
    }else if(line.startsWith('#EXTVLCOPT:')&&pending){const m=/^#EXTVLCOPT:http-(user-agent|referrer|referer)=(.*)$/i.exec(line);if(m)pending[m[1].toLowerCase()==='user-agent'?'userAgent':'referer']=m[2].trim();}else if(line.startsWith('#EXTGRP:')&&pending)pending.group=line.slice(8).trim()||pending.group;
    else if(!line.startsWith('#')&&pending){const [address,headerText]=line.split('|',2);if(headerText){const h=new URLSearchParams(headerText);pending.userAgent=h.get('User-Agent')||h.get('user-agent')||pending.userAgent;pending.referer=h.get('Referer')||h.get('referer')||pending.referer;}const url=resolve(address);if(url){pending.type=/\/movie\//i.test(url)?'movie':/\/series\//i.test(url)?'series':pending.type;channels.push({...pending,id:'ch-'+hash(url+'|'+pending.epgId),url});}pending=null;}
  }
  if(!channels.length)throw Error('Pleylistdə dəstəklənən HTTP/HTTPS kanal ünvanı tapılmadı.');
  const unique=[...new Map(channels.map(c=>[c.id,c])).values()];return {channels:unique,epg};
}
export function hash(s){let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return(h>>>0).toString(36);}
export function xmlDate(s) {const m=/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4}|Z)?/.exec(s||'');if(!m)return NaN;const zone=m[7]||'+0000';const t=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0));if(zone==='Z')return t;const minutes=(+zone.slice(1,3)*60 + +zone.slice(3,5))*(zone[0]==='-'?-1:1);return t-minutes*60000;}
export function parseXMLTV(text,Parser=globalThis.DOMParser) {
  const doc=new Parser().parseFromString(text,'text/xml');if(doc.querySelector('parsererror')||!doc.querySelector('tv'))throw Error('XMLTV faylı oxunmadı. Düzgün XMLTV faylı seçin.');
  const names={};doc.querySelectorAll('channel').forEach(c=>{names[c.id]=c.querySelector('display-name')?.textContent||c.id;});
  const programs=[];for(const p of doc.querySelectorAll('programme')){const start=xmlDate(p.getAttribute('start')),end=xmlDate(p.getAttribute('stop'));if(Number.isFinite(start)&&end>start)programs.push({channel:p.getAttribute('channel'),start,end,title:p.querySelector('title')?.textContent||'Adsız proqram',description:p.querySelector('desc')?.textContent||'',category:p.querySelector('category')?.textContent||''});}
  if(!programs.length)throw Error('XMLTV-də etibarlı proqram vaxtı tapılmadı.');return {names,programs};
}
export function demoData(now=Date.now()) {
  const names=['Loom One','Loom Cinema','Loom Sport','Loom Nature','Loom News','Loom Music','Loom Junior','Loom Travel','Loom Science','Loom Culture','Loom Living','Loom Mix'];
  const groups=['Ümumi','Filmlər və seriallar','İdman','Sənədli','Xəbərlər','Musiqi','Uşaq','Səyahət','Sənədli','Mədəniyyət','Həyat tərzi','Ümumi'];
  const titles=[['Səhərin ritmi','Şəhərin hekayələri','Axşam görüşü','Günün içindən'],['Sonuncu işıq','Böyük səyahət','Kino gündəliyi','Səssiz şəhər'],['Oyundan əvvəl','Arena: həftənin icmalı','Qələbəyə doğru','İdman saatı'],['Dağların o üzündə','Təbiətin səsi','Okeanın dərinlikləri','Vəhşi dünya'],['Günün xəbərləri','Dünya bu gün','İqtisadi baxış','Xəbər vaxtı'],['Canlı səhnə','Akustik axşam','Ritmlər','Yeni səslər'],['Balaca kəşfçilər','Rəngli dünya','Nağıllar aləmi','Dostlarla birlikdə'],['Uzaq yollar','Yeni üfüqlər','Səyahət gündəliyi','Dünyanın dadı'],['Sabahın dünyası','Kosmosa baxış','Bir kəşfin izi','Elm saatı'],['Sənətin izində','Açıq səhnə','Tarixin səsi','Mədəniyyət gündəliyi'],['Evdə bir gün','Yeni başlanğıc','Kiçik bağ','Mətbəxdə'],['Günün seçimi','Axşam söhbəti','Həftənin rəngləri','Birlikdə']];
  const channels=names.map((name,i)=>({id:'demo-'+i,name,epgId:'demo-'+i,group:groups[i],url:'assets/demo.mp4',logo:'',type:'tv',demo:true,color:['#79b9a3','#c29568','#98a9ca','#87ac80','#b98e87','#a495c5'][i%6]}));
  const anchor=Math.floor(now/3600000)*3600000;const programs=[];
  channels.forEach((c,i)=>{for(let j=-5;j<27;j++){const start=anchor+j*1800000;programs.push({channel:c.id,start,end:start+1800000,title:titles[i][((j+i)%4+4)%4],description:'TiviLoom üçün hazırlanmış nümunə TV proqramı. Bu cədvəl və video yalnız interfeysi, pultu və oynatma davranışlarını sınaqdan keçirmək üçündür.',category:groups[i]});}});
  const films=['Sonuncu işıq','Mavi üfüq','Səssiz şəhər','Böyük səyahət','Ulduzlara doğru','Payız məktubları','Şimal küləyi','Bir yay günü'];
  films.forEach((name,i)=>channels.push({id:'film-'+i,name,group:'Nümunə filmlər',url:'assets/demo.mp4',type:'movie',demo:true,poster:'assets/poster-'+i+'.svg',year:2020+i%6,description:'Orijinal nümunə film kartı. Oynat düyməsi yerli sınaq videosunu açır; kommersiya filmi daxil edilməyib.'}));
  return{channels,programs};
}
