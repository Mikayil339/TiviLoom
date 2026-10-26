'use strict';
// No PC bridge. TV JS service makes outbound HTTPS calls to a Cloudflare Worker.
// Compatible with webOS TV 6.0 / Node.js 8.12.
var https=require('https'),crypto=require('crypto'),URL=require('url').URL;
function validateEndpoint(value){
 var u=new URL(String(value||''));
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||!u.hostname)throw Error('Use your HTTPS Cloudflare Worker URL ending with /.');
 return u;
}
function createCloudBridge(options){
 options=options||{};var host=null,session=null;
 function send(path,method,payload,token){
  return new Promise(function(resolve,reject){
   var addr=new URL(path,host),text=payload?JSON.stringify(payload):'',done=false;
   var req=https.request(addr,{method:method,headers:{'Accept':'application/json','Content-Type':'application/json','Content-Length':Buffer.byteLength(text),'X-TiviLoom-Token':token||''}},function(response){
    var parts=[],length=0;
    response.on('data',function(p){length+=p.length;if(length>30000){req.destroy();return;}parts.push(p);});
    response.on('end',function(){if(done)return;done=true;try{if(length>30000)throw Error('Invalid cloud response.');var result=JSON.parse(Buffer.concat(parts).toString('utf8'));if(response.statusCode>=300||result.returnValue===false)throw Error(result.errorText||'Relay failed.');resolve(result);}catch(e){reject(e);}});
   });
   req.setTimeout(14000,function(){req.destroy(Error('Cloud relay timeout. Check your internet and Worker URL.'));});
   req.on('error',function(e){if(!done){done=true;reject(e);}});req.end(text);
  });
 }
 async function api(method,payload){
  payload=payload||{};
  if(method==='phoneStart'){
   host=validateEndpoint(payload.bridgeURL);session=crypto.randomBytes(24).toString('hex');
   try{var result=await send('v1/open','POST',{token:session},'');}
   catch(e){session=null;throw e;}
   options.onActive&&options.onActive(true);
   return {returnValue:true,token:session,urls:[new URL('phone#'+session,host).href],expires:result.expires,cloud:true,localOnly:false};
  }
  if(!session||payload.token!==session)throw Error('Phone QR is closed or expired.');
  if(method==='phonePoll')return send('v1/poll','GET',null,session);
  if(method==='phoneComplete')return send('v1/complete','POST',{id:payload.id,ok:!!payload.ok,message:payload.message||''},session);
  if(method==='phoneStop'){
   try{return await send('v1/close','POST',{},session);}finally{session=null;options.onActive&&options.onActive(false);}
  }
  if(/^phoneBackup|^phoneRead$/.test(method))throw Error('Phone backup/restore is not available with cloud QR pairing.');
  throw Error('Unsupported QR relay action.');
 }
 return {api:api};
}
module.exports={createCloudBridge:createCloudBridge,validateEndpoint:validateEndpoint};
