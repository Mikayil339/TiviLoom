export const remoteChoices=['favorite','guide','search','context','last-channel','playlists','favorites','mute'];
export function numberKey(e){if(/^[0-9]$/.test(e.key||''))return e.key;const c=e.keyCode||e.which;return c>=48&&c<=57?String(c-48):c>=96&&c<=105?String(c-96):null;}
export function assignNumber(numbers,id,value,favorites){if(!favorites.includes(id))throw Error('Add this channel to Favorites first.');const result={...numbers};delete result[id];if(value==='')return result;if(!/^[1-9]\d{0,3}$/.test(String(value)))throw Error('Choose a number from 1 to 9999.');const n=Number(value);if(Object.entries(result).some(([key,v])=>key!==id&&Number(v)===n))throw Error('This number is already assigned to another favorite.');result[id]=n;return result;}
export function cleanOptions(options={},channels=[],favorites=[]){
 const ids=new Set(channels.map(c=>c.id)),groups=new Set(channels.map(c=>c.group)),numbers={},used=new Set();
 for(const [id,value] of Object.entries(options.channelNumbers||{}))if(ids.has(id)&&favorites.includes(id)&&Number.isInteger(value)&&value>0&&value<=9999&&!used.has(value)){numbers[id]=value;used.add(value);}
 const clean=value=>[...new Set(Array.isArray(value)?value:[])].filter(id=>ids.has(id)),logos={};
 for(const [id,url] of Object.entries(options.logoOverrides||{})){if(!ids.has(id)||typeof url!=='string')continue;try{const u=new URL(url);if(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password)logos[id]=u.href;}catch{}}
 const groupNames={},groupPins={};
 for(const [group,name] of Object.entries(options.groupNames||{}))if(groups.has(group)&&typeof name==='string'&&name.trim()&&name.trim().length<=80)groupNames[group]=name.trim();
 for(const [group,record] of Object.entries(options.groupPins||{}))if(groups.has(group)&&record&&Array.isArray(record.salt)&&record.salt.length===16&&/^[a-f0-9]{64}$/.test(record.hash||''))groupPins[group]=record;
 return {channelNumbers:numbers,hiddenChannels:clean(options.hiddenChannels),lockedChannels:clean(options.lockedChannels),hiddenGroups:[...new Set(Array.isArray(options.hiddenGroups)?options.hiddenGroups:[])].filter(g=>groups.has(g)),logoOverrides:logos,groupNames,groupPins};
}
export function moveFavorite(favorites,id,delta){const next=[...favorites],i=next.indexOf(id),j=i+delta;if(i>=0&&j>=0&&j<next.length)[next[i],next[j]]=[next[j],next[i]];return next;}
export function normalizeSearch(value){return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ı/g,'i').replace(/ə/g,'e');}
export function reconnectDelay(attempt){return attempt<1||attempt>3?null:[1500,3500,7000][attempt-1];}
export function validSourceSettings(data){
 const name=String(data.name||'').trim();if(!name||name.length>80)throw Error('Playlist name must be 1–80 characters.');const url=String(data.sourceURL||'').trim(),epg=String(data.epgURL||'').trim();for(const value of [url,epg].filter(Boolean)){const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('Use an HTTP or HTTPS address.');}const userAgent=String(data.userAgent||'').trim();if(userAgent.length>200||/[\r\n]/.test(userAgent))throw Error('Invalid User-Agent.');const updateHours=Number(data.updateHours||0);if(![0,1,3,6,12,24,48,168].includes(updateHours))throw Error('Invalid update interval.');return {name,sourceURL:url,epgURL:epg,userAgent,updateHours,updateOnStart:!!data.updateOnStart,enabled:data.enabled!==false};
}
export async function hashPIN(pin,salt){if(!/^\d{4,6}$/.test(pin))throw Error('PIN must contain 4–6 digits.');const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:Uint8Array.from(salt),iterations:100000},key,256);return Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,'0')).join('');}
export async function makePIN(pin){const salt=Array.from(crypto.getRandomValues(new Uint8Array(16)));return {salt,hash:await hashPIN(pin,salt)};}
export async function checkPIN(pin,record){try{return !!record&&await hashPIN(pin,record.salt)===record.hash;}catch{return false;}}
