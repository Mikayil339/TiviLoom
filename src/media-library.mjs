// Lightweight media helpers: no external catalog fetched without the user's source.
export function parseEpisode(name){
 const s=String(name||'');const m=s.match(/(?:S(\d{1,2})\s*E(\d{1,3})|(?:season|mövsüm)\s*(\d+)\s*(?:episode|ep|bölüm)\s*(\d+))/i);
 if(!m)return {title:s,season:1,episode:1,identified:false};
 return {title:s.slice(0,m.index).replace(/[-_:\s]+$/,'').trim()||s,season:Number(m[1]||m[3]),episode:Number(m[2]||m[4]),identified:true};
}
export function seriesCatalog(channels){const shows=new Map();for(const c of channels){if(c.type!=='series')continue;const e=parseEpisode(c.name),key=(c.seriesShowName|| (c.xtream?.seriesId?c.name:e.identified?e.title:c.group)).toLocaleLowerCase();if(!shows.has(key))shows.set(key,{id:key,name:c.seriesShowName|| (c.xtream?.seriesId?c.name:e.identified?e.title:c.group),poster:c.poster||c.logo||'',episodes:[]});shows.get(key).episodes.push({...c,season:c.season||e.season,episode:c.episode||e.episode});}for(const s of shows.values())s.episodes.sort((a,b)=>a.season-b.season||a.episode-b.episode);return [...shows.values()];}
export function canSeek(media){return !!media&&Number.isFinite(media.duration)&&media.duration>0;}
export function resumeOffset(seconds,duration){const at=Number(seconds)||0;return Number.isFinite(duration)&&duration>0&&at>10&&at<duration-20?at:0;}
export function nextEpisode(episodes,id){const index=episodes.findIndex(e=>e.id===id);return index<0?null:episodes[index+1]||null;}
