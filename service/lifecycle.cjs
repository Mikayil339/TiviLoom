'use strict';
// Hold a bounded ActivityManager activity only while the phone screen is open.
// https://webostv.developer.lge.com/develop/guides/js-service-faq
function phoneActivity(manager){
 let wanted=false,pending=false,activity=null;
 function complete(value){if(value)manager.complete(value,function(){});}
 return function(active){
  wanted=active;
  if(!active){const old=activity;activity=null;complete(old);return;}
  if(activity||pending)return;
  pending=true;manager.create('TiviLoom-phone',function(value){pending=false;if(wanted)activity=value;else complete(value);});
 };
}
module.exports={phoneActivity};
