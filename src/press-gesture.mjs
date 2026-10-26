export function createPressGesture({short,long,repeat=()=>{},delay=650,setTimer=setTimeout,clearTimer=clearTimeout}){
 let held=null,timer=null;
 function cancel(){if(timer!==null)clearTimer(timer);timer=null;held=null;}
 function down(key,target){
  if(held?.key===key){if(held.long)repeat(key,held.target);return;}
  cancel();const current=held={key,target,long:false};
  timer=setTimer(()=>{timer=null;if(held!==current)return;current.long=true;long(key,target);},delay);
 }
 function up(key){if(held?.key!==key)return false;const current=held;cancel();if(!current.long)short(key,current.target);return true;}
 return {down,up,cancel,isHeld:key=>held?.key===key};
}
