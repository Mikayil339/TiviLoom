import {createPressGesture} from './press-gesture.mjs';
import {nativeHLSSupported} from './playback.mjs';
export const SERVICE='luna://com.tiviloom.app.source';
export function remoteAction(code){
  return ({461:'back',415:'play',19:'pause',413:'stop',417:'forward',412:'rewind',33:'previous',34:'next',403:'favorite',404:'guide',405:'search',406:'context'})[code]||null;
}
export function validMediaURL(value,base=location.href){
  const local=value.startsWith('/assets/')?value.slice(1):value;
  const url=new URL(local,base),appRoot=new URL('./',base).href;
  if(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password)return url.href;
  if(url.protocol==='file:'&&url.href.startsWith(appRoot+'assets/'))return url.href;
  throw Error('Unsupported media address.');
}
export const isPhone=!!window.TiviLoomNative||new URLSearchParams(location.search).get('layout')==='phone';
globalThis.document?.documentElement?.classList.toggle('phone',isPhone);
if(isPhone&&globalThis.document)document.title='TiviLoom';
const native=!!(window.PalmServiceBridge||window.PalmSystem||window.webOSSystem);
if(native&&!isPhone)document.documentElement.classList.add('low-power-tv');
const sourceBases=new Map();
let nativeSequence=0;const nativePending=new Map();
window.addEventListener?.('TiviLoomNativeResult',event=>{const data=event.detail,entry=nativePending.get(data?.id);if(!entry)return;clearTimeout(entry.timer);nativePending.delete(data.id);if(data.error)entry.reject(Error(data.error));else entry.resolve(data.result);});
export function request(method,parameters={}){const requestTimeout=method==='fetchSource'?150000:35000;
  if(window.TiviLoomNative)return new Promise((resolve,reject)=>{const id=String(++nativeSequence);const timer=setTimeout(()=>{nativePending.delete(id);reject(Error('The request timed out. Check your connection.'));},requestTimeout);nativePending.set(id,{resolve,reject,timer});try{window.TiviLoomNative.invoke(id,method,JSON.stringify(parameters));}catch{clearTimeout(timer);nativePending.delete(id);reject(Error('The source service is unavailable.'));}});
  if(!native&&/^https?:$/.test(location.protocol))return fetch('/__service/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(parameters)}).then(async r=>{const data=await r.json();if(!r.ok||data.returnValue===false)throw Error(data.errorText||'Source service failed.');return data;});
  return new Promise((resolve,reject)=>{
    if(!window.webOS?.service?.request)return reject(Error('The TV source service is unavailable. Install the complete TiviLoom package.'));
    let handle;const timer=setTimeout(()=>{handle?.cancel();reject(Error('The TV source service did not respond. Try again.'));},requestTimeout);
    handle=webOS.service.request(SERVICE,{method,parameters,onSuccess:data=>{clearTimeout(timer);if(data.returnValue===false)reject(Error(data.errorText));else resolve(data);},onFailure:error=>{clearTimeout(timer);reject(Error(error.errorText||'The TV source service is unavailable.'));}});
  });
}
export async function loadSource(url,options={}){
  const source=await request('fetchSource',{url,...options});
  sourceBases.set(url,source.finalURL||url);
  if(!source.ticket||!Number.isInteger(source.chunks)||source.chunks<0||source.chunks>5000)throw Error('Invalid source service response.');
  const parts=new Array(source.chunks);let index=0;
  try{
    const worker=async()=>{while(index<source.chunks){const i=index++;const part=await request('readSource',{ticket:source.ticket,index:i});parts[i]=part.text;}};
    await Promise.all(Array.from({length:Math.min(4,source.chunks)},worker));
    return parts.join('');
  }finally{await request('releaseSource',{ticket:source.ticket}).catch(()=>{});}
}
export const platform={isTV:!isPhone,isPhone,native,fileSupport:isPhone,get nativeHLS(){return nativeHLSSupported(document.createElement('video'));},
  sourceBase:url=>sourceBases.get(url)||url,request,
  async api(path,body){if(path==='source')return loadSource(body.url,{userAgent:body.userAgent||''});if(path==='epg')return JSON.parse(await loadSource(body.url,{userAgent:body.userAgent||'',kind:'epg'}));if(path==='epgFile'&&window.TiviLoomNative)return JSON.parse(await loadSource('',{kind:'epg',localFileName:body.name}));if(path==='media'){const url=validMediaURL(body.url);return window.TiviLoomNative?request('prepareMedia',{url,userAgent:body.userAgent||'',referer:body.referer||''}):{url};}if(path==='probe')return request('probeMedia',{url:body.url,userAgent:body.userAgent||'',referer:body.referer||''});throw Error('Unknown TV action.');},
  assetURL:value=>validMediaURL(value),
  exit(){if(window.TiviLoomNative)return window.TiviLoomNative.close();if(native&&window.webOS?.platformBack)webOS.platformBack();else{const toast=document.querySelector('#toast');toast.textContent='LG TV: exit confirmation opens here.';toast.hidden=false;setTimeout(()=>{toast.hidden=true;},3500);}}
};
export function bindRemote(handlers){
  window.addEventListener('TiviLoomAndroidBack',()=>handlers.back());
  window.addEventListener('TiviLoomAndroidSuspend',()=>handlers.suspend());
  window.addEventListener('TiviLoomAndroidResume',()=>handlers.resume());
  let previewFocus=null;const backPress=createPressGesture({short:()=>handlers.back(),long:()=>handlers.longBack?.()||undefined});
  if(!native)document.addEventListener('focusin',event=>{if(event.target.matches('button,input,select,textarea'))previewFocus=event.target;});
  window.addEventListener('keydown',event=>{
    const action=remoteAction(event.keyCode||event.which)||(!native&&event.key==='Escape'?'back':null);if(!action)return;
    if(action!=='back'&&(event.target.matches('input,textarea,select')||document.querySelector('#modal-root').children.length||!document.querySelector('#wizard').hidden||!document.querySelector('#welcome').hidden))return;
    event.preventDefault();event.stopImmediatePropagation();
    if(action==='back')backPress.down('back',event.target);else if(!event.repeat)handlers.action(action);
  },true);
  window.addEventListener('keyup',event=>{if(remoteAction(event.keyCode||event.which)==='back'||(!native&&event.key==='Escape')){event.preventDefault();event.stopImmediatePropagation();backPress.up('back');}},true);
  window.addEventListener('blur',()=>backPress.cancel());
  let hidden=false;
  const changed=()=>{if(window.TiviLoomNative?.isPickingFile?.())return;const value=!!(document.hidden||document.webkitHidden);if(value&&!hidden){hidden=true;backPress.cancel();handlers.suspend();}else if(!value&&hidden){hidden=false;handlers.resume();}};
  document.addEventListener('visibilitychange',changed);
  document.addEventListener('webkitvisibilitychange',changed);
  document.addEventListener('webOSRelaunch',()=>{if(hidden){hidden=false;handlers.resume();}});
  if(!native)window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='TiviLoomPreview')return;
    if(event.data.action==='suspend'){handlers.suspend();return;}
    if(event.data.action==='resume'){handlers.resume();return;}
    const code=Number(event.data.code),keys={13:'Enter',37:'ArrowLeft',38:'ArrowUp',39:'ArrowRight',40:'ArrowDown',461:'Unidentified',415:'MediaPlay',19:'Pause',413:'MediaStop',403:'ColorF0Red',404:'ColorF1Green',405:'ColorF2Yellow',406:'ColorF3Blue'};
    if(code>=48&&code<=57)keys[code]=String(code-48);
    if(!keys[code])return;
    const target=previewFocus?.isConnected&&previewFocus.offsetParent!==null?previewFocus:document.activeElement||document.body;
    target.focus?.({preventScroll:true});
    const down=new KeyboardEvent('keydown',{key:keys[code],keyCode:code,which:code,bubbles:true,cancelable:true});
    target.dispatchEvent(down);
    if(code===13&&!down.defaultPrevented&&target.matches('button'))target.click();
    target.dispatchEvent(new KeyboardEvent('keyup',{key:keys[code],keyCode:code,which:code,bubbles:true,cancelable:true}));
  });
  if(!native&&window.parent!==window)window.parent.postMessage({type:'TiviLoomPreviewReady'},location.origin);
}
