// Keep live DOM frames so Back retains in-progress values and scroll position.
export class DialogStack {
 constructor(){this.key=null;this.frames=[];}
 enter(key,capture){
  if(key===this.key)return;
  const earlier=this.frames.findIndex(frame=>frame.key===key);
  if(earlier>=0)this.frames=this.frames.slice(0,earlier);
  else if(this.key!==null)this.frames.push({key:this.key,value:capture()});
  this.key=key;
 }
 back(){const frame=this.frames.pop();this.key=frame?.key??null;return frame?.value??null;}
 clear(){this.key=null;this.frames=[];}
}
