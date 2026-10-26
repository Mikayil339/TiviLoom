import {nativeHLSSupported,playbackEngine,playbackError} from './playback.mjs';
const video=document.querySelector('video'),report=document.querySelector('#report');let instance=null,latest='';
function status(){report.textContent=JSON.stringify({nativeHLS:nativeHLSSupported(video),hlsMSE:!!window.Hls?.isSupported(),engine:video.dataset.engine||'',readyState:video.readyState,paused:video.paused,width:video.videoWidth,height:video.videoHeight,error:video.error?.code||0,time:Math.round(video.currentTime*10)/10,message:latest},null,2);}
async function run(kind){instance?.destroy();instance=null;video.pause();video.removeAttribute('src');video.load();latest='';
 const url=new URL('../app/assets/'+(kind==='hls'?'hls/demo.m3u8':'demo.mp4'),location.href).href;
 const engine=playbackEngine(video,url,{native:!!window.PalmServiceBridge,Hls:window.Hls});video.dataset.engine=engine;
 if(engine==='hlsjs'){instance=new Hls({enableWorker:true});instance.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal){latest=playbackError(null,{url,hls:data});status();}});instance.loadSource(url);instance.attachMedia(video);}else video.src=url;
 try{await video.play();}catch(e){latest=playbackError(video.error||e,{url});}status();
}
document.querySelector('#mp4').onclick=()=>run('mp4');document.querySelector('#hls').onclick=()=>run('hls');setInterval(status,500);run('hls');
