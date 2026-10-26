'use strict';
// webOS 6.0 JS services run Node 8.12.0. No inbound TCP listener on the TV.
// All bridge traffic is made as outbound HTTP(S) calls to a user-controlled relay.
var http=require('http'),https=require('https'),URL=require('url').URL;
function bridgeAddress(value){
 var u=new URL(String(value||''));
 if(!/^https?:$/.test(u.protocol)||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('Bridge URL must be http://PC-IP:19790/ or an HTTPS relay root.');
 if(u.protocol==='http:'&&!/^(192\.168\.|10\.|127\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname))throw Error('Use HTTPS for a remote bridge.');
 return u;
}
function createPhoneBridge(options){
 options=options||{};var address=null,code=null,token=null,alive=false,active=options.onActive||function(){};
 function transport(method,payload){
  if(!address||!code)return Promise.reject(Error('Set up the phone bridge in Settings first.'));
  return new Promise(function(resolve,reject){
   var u=new URL('bridge',address),text=JSON.stringify({method:method,payload:payload||{}}),lib=u.protocol==='https:'?https:http;
   var req=lib.request(u,{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(text),'x-tiviloom-code':code}},function(res){
    var chunks=[],size=0;res.on('data',function(part){size+=part.length;if(size>40000){req.destroy();reject(Error('Invalid bridge response.'));}else chunks.push(part);});
    res.on('end',function(){try{var body=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(res.statusCode!==200||body.returnValue===false)reject(Error(body.errorText||body.error||'Bridge request failed.'));else resolve(body);}catch(e){reject(Error('The bridge did not return a valid response.'));}});
   });req.setTimeout(12000,function(){req.destroy(Error('Bridge timeout. Check that the PC relay is running.'));});req.on('error',function(e){reject(Error('Cannot reach phone bridge: '+e.message));});req.end(text);
  });
 }
 async function api(method,payload){
  payload=payload||{};
  if(method==='phoneStart'){
   address=bridgeAddress(payload.bridgeURL);code=String(payload.bridgeCode||'').trim();
   if(!/^[a-f0-9]{8,32}$/i.test(code))throw Error('Enter your relay bridge code (8–32 hex characters).');
   var result=await transport(method,{});token=result.token;active(true);alive=true;return result;
  }
  if(!alive||!token)throw Error('Phone bridge session has ended. Open pairing again.');
  if(payload.token!==token)throw Error('Invalid phone session.');
  try{var result=await transport(method,payload);if(method==='phoneStop'){alive=false;token=null;active(false);}return result;}
  catch(e){if(method==='phoneStop'){alive=false;token=null;active(false);}throw e;}
 }
 return {api:api};
}
module.exports={createPhoneBridge:createPhoneBridge,bridgeAddress:bridgeAddress};
