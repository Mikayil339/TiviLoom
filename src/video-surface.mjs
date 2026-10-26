export function createVideoSurface(video,stage,error,onLayout=()=>{}){
  const host=document.createElement('div');host.id='video-surface';host.append(video,error);stage.append(host);
  let target=document.querySelector('#preview'),frame=0,until=0;
  function layout(){frame=0;const base=stage.getBoundingClientRect(),box=target?.getBoundingClientRect();if(!box||!base.width||!box.width||!box.height){host.hidden=true;return;}host.hidden=false;const sx=base.width/stage.offsetWidth,sy=base.height/stage.offsetHeight;Object.assign(host.style,{left:(box.left-base.left)/sx+'px',top:(box.top-base.top)/sy+'px',width:box.width/sx+'px',height:box.height/sy+'px',borderRadius:target.id==='preview'?'11px':'0px'});onLayout();if(performance.now()<until)frame=requestAnimationFrame(layout);}
  function refresh(){until=performance.now()+250;if(!frame)frame=requestAnimationFrame(layout);}
  function place(next,full=false){target=next;host.classList.toggle('full-surface',full);host.style.zIndex=target?.id==='mini-video-host'?'25':target?.id==='list-preview'?'25':full?'19':'1';refresh();}
  const resize=new ResizeObserver(refresh);resize.observe(stage);document.querySelector('#app').addEventListener('transitionrun',refresh);window.addEventListener('resize',refresh);refresh();return {place,refresh,host};
}
