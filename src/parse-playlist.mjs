import {parseM3U} from './core.mjs';
export async function parsePlaylist(text,base=''){
 if(text.length<512*1024||typeof Worker==='undefined')return parseM3U(text,base);
 const data=await new Promise(resolve=>{let worker,timer,done=false;const end=value=>{if(done)return;done=true;clearTimeout(timer);worker?.terminate();resolve(value);};try{worker=new Worker('assets/playlist-worker.js');timer=setTimeout(()=>end({unavailable:true}),30000);worker.onerror=()=>end({unavailable:true});worker.onmessage=e=>end(e.data);worker.postMessage({text,base});}catch{end({unavailable:true});}});
 if(data.error)throw Error(data.error);if(data.result)return data.result;await new Promise(r=>setTimeout(r,0));return parseM3U(text,base);
}
