'use strict';
var createPhoneBridge=require('./relay-client.cjs').createPhoneBridge;
var createCloudBridge=require('./cloud-client.cjs').createCloudBridge;
var createLocalBridge=require('./phone.cjs').createPhoneBridge;
var http=require('http'),https=require('https'),zlib=require('zlib'),crypto=require('crypto');
var URL=require('url').URL;
var epg=require('./epg.cjs');
var APP_ID='com.tiviloom.app',MAX_BYTES=30*1024*1024,CHUNK=8192;

function validURL(value) {
  if(typeof value!=='string'||value.length>16384)throw Error('Invalid source URL.');
  var u=new URL(value);
  if(!/^https?:$/.test(u.protocol)||u.username||u.password)throw Error('Use an HTTP or HTTPS source URL.');
  return u;
}
function download(value,options) {
  options=options||{};
  return new Promise(function(resolve,reject){
    var request,stream,timer,settled=false;
    function finish(error,result){if(settled)return;settled=true;clearTimeout(timer);if(error){if(request)request.destroy();if(stream)stream.destroy();reject(error);}else resolve(result);}
    timer=setTimeout(function(){finish(Error('Source request timed out.'));},options.timeout||25000);
    function get(value,redirects){
      var url;try{url=validURL(value);}catch(e){finish(e);return;}
      var transport=url.protocol==='https:'?https:http;
      request=transport.get(url,{headers:{'User-Agent':options.userAgent||'TiviLoom-webOS/0.6.7','Accept-Encoding':'gzip, deflate'}},function(response){
        if([301,302,303,307,308].indexOf(response.statusCode)!==-1&&response.headers.location){
          response.resume();if(redirects>=5)return finish(Error('Too many redirects.'));
          try{get(new URL(response.headers.location,url).href,redirects+1);}catch(e){finish(e);}return;
        }
        if(response.statusCode<200||response.statusCode>=300){response.resume();return finish(Error('Source returned HTTP '+response.statusCode+'.'));}
        stream=response;
        var encoding=(response.headers['content-encoding']||'').toLowerCase();
        if(encoding==='gzip')stream=response.pipe(zlib.createGunzip());
        else if(encoding==='deflate')stream=response.pipe(zlib.createInflate());
        var parts=[],size=0;
        response.on('error',finish);response.on('aborted',function(){finish(Error('Source connection ended early.'));});
        stream.on('error',finish);
        stream.on('data',function(part){size+=part.length;if(size>(options.maxBytes||MAX_BYTES))return finish(Error('Source exceeds the 30 MB limit.'));parts.push(part);});
        stream.on('end',function(){if(!settled)finish(null,{text:options.binary?null:Buffer.concat(parts).toString('utf8'),buffer:options.binary?Buffer.concat(parts):undefined,contentType:response.headers['content-type']||'',finalURL:url.href});});
      });
      request.on('error',function(){finish(Error('Cannot connect to the source. Check its address and your network.'));});
    }
    get(value,0);
  });
}
function probeMedia(value,options){options=options||{};return new Promise(function(resolve){var settled=false,req,redirects=0,agent=String(options.userAgent||'TiviLoom/0.6.4'),referer=String(options.referer||''),timer=setTimeout(function(){finish(0,'Connection timeout');},9000);function finish(status,message,type){if(settled)return;settled=true;clearTimeout(timer);if(req)req.destroy();resolve({returnValue:true,status:status||0,message:message||'',contentType:type||'',redirects:redirects});}if(agent.length>200||referer.length>4000||/[\r\n]/.test(agent+referer))return finish(0,'Invalid source headers');function get(value){var url;try{url=validURL(value);}catch(e){return finish(0,'Invalid source URL');}var headers={'Range':'bytes=0-0','User-Agent':agent};if(referer)headers.Referer=referer;try{req=(url.protocol==='https:'?https:http).request(url,{method:'GET',headers:headers},function(res){var code=res.statusCode||0,type=res.headers['content-type']||'',location=res.headers.location;res.destroy();if([301,302,303,307,308].indexOf(code)>=0&&location){if(++redirects>5)return finish(0,'Too many redirects');var next;try{next=validURL(new URL(location,url).href);}catch(e){return finish(0,'Invalid redirect');}if(next.origin!==url.origin)referer='';return get(next.href);}finish(code,'',type);});req.on('error',function(){finish(0,'Network connection failed');});req.end();}catch(e){finish(0,'Network connection failed');}}get(value);});}
function derivePIN(pin,salt){return new Promise(function(resolve,reject){crypto.pbkdf2(pin,Buffer.from(salt),100000,32,'sha256',function(error,key){if(error)reject(error);else resolve(key.toString('hex'));});});}
async function pinAPI(method,payload){
 if(method==='hashPIN'){
  if(typeof payload.pin!=='string'||!/^\d{4,6}$/.test(payload.pin))throw Error('PIN must contain 4–6 digits.');
  var salt=Array.from(crypto.randomBytes(16));return {returnValue:true,record:{salt:salt,hash:await derivePIN(payload.pin,salt)}};
 }
 var record=payload.record;
 if(typeof payload.pin!=='string'||!/^\d{4,6}$/.test(payload.pin)||!record||!Array.isArray(record.salt)||record.salt.length!==16||record.salt.some(function(n){return !Number.isInteger(n)||n<0||n>255;})||!/^[a-f0-9]{64}$/.test(record.hash||''))return {returnValue:true,valid:false};
 var hash=await derivePIN(payload.pin,record.salt);return {returnValue:true,valid:crypto.timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(record.hash,'hex'))};
}
function createSourceAPI(options){
  options=options||{};
  var tickets=new Map(),active=0,now=options.now||Date.now,images=new Map(),imageBytes=0,imageActive=0;
  var phone=createPhoneBridge(options.phone||{}),cloud=createCloudBridge(options.phone||{}),local=createLocalBridge(options.phone||{}),phoneClient=null;
  function imageTicket(text){prune();if(tickets.size>=24)tickets.delete(tickets.keys().next().value);var ticket=crypto.randomBytes(16).toString('hex');tickets.set(ticket,{text:text,expires:now()+180000});return {returnValue:true,ticket:ticket,length:text.length,chunks:Math.ceil(text.length/CHUNK)};}
  function prune(){tickets.forEach(function(t,key){if(t.expires<now())tickets.delete(key);});}
  function authorized(sender){return sender===APP_ID||sender===APP_ID+'.source';}
  return async function(method,payload,sender){
    payload=payload||{};prune();
    if(!authorized(sender))throw Error('Caller is not authorized.');
    if(method==='phoneStart'){phoneClient=payload.bridgeMode==='local'?local:payload.bridgeMode==='cloud'||(payload.bridgeURL&&!payload.bridgeCode)?cloud:phone;return phoneClient.api(method,payload);}
    if(method.startsWith('phone')){if(!phoneClient)throw Error('Open a QR pairing session first.');return phoneClient.api(method,payload);}
    if(method==='hashPIN'||method==='verifyPIN')return pinAPI(method,payload);
    if(method==='probeMedia')return probeMedia(payload.url,{userAgent:payload.userAgent||'',referer:payload.referer||''});
    var userAgent=typeof payload.userAgent==='string'?payload.userAgent:'';if(userAgent.length>200||/[\r\n]/.test(userAgent))throw Error('Invalid User-Agent.');
    if(method==='fetchImage'){
      validURL(payload.url);var cached=images.get(payload.url);if(cached&&now()-cached.time<86400000)return imageTicket(cached.data);
      if(imageActive>=3)throw Error('Image queue is busy.');imageActive++;var result;try{result=await download(payload.url,Object.assign({},options,{binary:true,maxBytes:512*1024,userAgent:userAgent,timeout:12000}));}finally{imageActive--;}
      var mime=result.contentType.split(';')[0].toLowerCase();if(!['image/png','image/jpeg','image/webp','image/gif','image/svg+xml','image/avif','image/x-icon'].includes(mime))throw Error('Unsupported logo format.');
      var data='data:'+mime+';base64,'+result.buffer.toString('base64');
      if(cached){imageBytes-=cached.data.length;images.delete(payload.url);}while(images.size&&(imageBytes+data.length>16*1024*1024||images.size>=200)){var key=images.keys().next().value;imageBytes-=images.get(key).data.length;images.delete(key);}
      images.set(payload.url,{data:data,time:now()});imageBytes+=data.length;return imageTicket(data);
    }
    if(method==='ping')return {returnValue:true,version:require('./package.json').version,chunkSize:CHUNK};
    if(method==='fetchSource'){
      if(active>=2)throw Error('Another source is loading. Try again shortly.');
      active++;
      var result;try{result=payload.kind==='epg'?{text:JSON.stringify(await epg.downloadCompact(payload.url,{validateURL:validURL,userAgent:userAgent,timeout:120000}))}:await download(payload.url,Object.assign({},options,{userAgent:userAgent}));}finally{active--;}
      prune();if(tickets.size>=12)tickets.delete(tickets.keys().next().value);
      var ticket=crypto.randomBytes(16).toString('hex');
      tickets.set(ticket,{text:result.text,expires:now()+180000});
      return {returnValue:true,ticket:ticket,length:result.text.length,chunks:Math.ceil(result.text.length/CHUNK),finalURL:result.finalURL};
    }
    if(method==='readSource'){
      var t=tickets.get(payload.ticket);
      if(!t)throw Error('Source session expired. Load the playlist again.');
      if(!Number.isInteger(payload.index)||payload.index<0||payload.index>=Math.ceil(t.text.length/CHUNK))throw Error('Invalid source part.');
      t.expires=now()+180000;
      return {returnValue:true,index:payload.index,text:t.text.slice(payload.index*CHUNK,(payload.index+1)*CHUNK)};
    }
    if(method==='releaseSource'){tickets.delete(payload.ticket);return {returnValue:true};}
    throw Error('Unknown service method.');
  };
}
module.exports={download:download,validURL:validURL,createSourceAPI:createSourceAPI,APP_ID:APP_ID,CHUNK:CHUNK};
