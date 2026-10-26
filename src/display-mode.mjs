export const displayModes=[['contain','Normal'],['fill','Full'],['cover','Zoom'],['cinema-zoom','Zoom - 2.35:1'],['reduced','Reduced'],['4:3','4:3'],['16:9','16:9'],['2.35:1','2.35:1']];
export function displayRect(mode,width,height){
 let w=width,h=height,fit=mode==='cover'?'cover':mode==='fill'?'fill':'contain',scale=mode==='reduced'?.8:mode==='cinema-zoom'?1.32:1;
 const ratio=({'4:3':4/3,'16:9':16/9,'2.35:1':2.35})[mode];
 if(ratio){w=Math.min(width,height*ratio);h=w/ratio;fit='fill';}
 return {width:w,height:h,left:(width-w)/2,top:(height-h)/2,fit,scale};
}
export function applyDisplayMode(video,host,mode){const r=displayRect(mode,host.clientWidth||1280,host.clientHeight||720);Object.assign(video.style,{width:r.width+'px',height:r.height+'px',left:r.left+'px',top:r.top+'px',right:'auto',bottom:'auto',objectFit:r.fit,transform:r.scale===1?'none':'scale('+r.scale+')',transformOrigin:'center'});}
