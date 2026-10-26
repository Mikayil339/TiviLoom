'use strict';
// Streaming XMLTV reducer for webOS 6 / Node 8.12. 150 MiB *decoded*
// input cap; never constructs an XML DOM or holds the full input in memory.
var http=require('http'),https=require('https'),zlib=require('zlib');
var URL=require('url').URL,StringDecoder=require('string_decoder').StringDecoder;
var MAX_BYTES=150*1024*1024,MAX_PROGRAMS=45000;
function textEntity(str){return String(str||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&(#x[\da-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g,function(all,x){var m={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};if(m[x])return m[x];if(x[0]==='#'){var n=x[1]==='x'?parseInt(x.slice(2),16):parseInt(x.slice(1),10);if(n>0&&n<=0x10ffff)return String.fromCodePoint(n);}return all;}).replace(/<[^>]*>/g,'').trim();}
function attrs(tag){var obj={},re=/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g,m;while((m=re.exec(tag)))obj[m[1]]=textEntity(m[3]);return obj;}
function xmlDate(s){var m=/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4}|Z)?/.exec(s||'');if(!m)return NaN;var z=m[7]||'+0000',t=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0));return z==='Z'?t:t-(+z.slice(1,3)*60 + +z.slice(3,5))*(z[0]==='-'?-1:1)*60000;}
function tagValue(body,key){var re=new RegExp('<'+key+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+key+'>','i'),match=re.exec(body);return match?textEntity(match[1]):'';}
function reducer(options){options=options||{};var buffer='',decoder=new StringDecoder('utf8'),names={},programs=[],nameCount=0,now=options.now||Date.now(),maxDate=now+7*86400000,minDate=now-6*3600000,counts={};
 function eat(chunk){buffer+=decoder.write(chunk);while(true){var idx=buffer.search(/<(channel|programme)\b/i);if(idx<0){buffer=buffer.slice(-50);break;}if(idx>0)buffer=buffer.slice(idx);var start=/<(channel|programme)\b/i.exec(buffer),kind=start[1].toLowerCase(),close='</'+kind+'>',end=buffer.toLowerCase().indexOf(close);if(end<0){if(buffer.length>3*1024*1024)throw Error('XMLTV element exceeds memory limit.');break;}var element=buffer.slice(0,end+close.length);buffer=buffer.slice(end+close.length);var head=element.slice(0,element.indexOf('>')+1),a=attrs(head);
   if(kind==='channel'){if(a.id&&nameCount<30000){if(!names[a.id])nameCount++;names[a.id]=tagValue(element,'display-name').slice(0,96)||a.id;}}
   else{var startDate=xmlDate(a.start),endDate=xmlDate(a.stop),id=a.channel;if(!id||!Number.isFinite(startDate)||!Number.isFinite(endDate)||endDate<=startDate||endDate<minDate||startDate>maxDate)continue;
    if(programs.length>=MAX_PROGRAMS)continue;
    if((counts[id]||0)>=420)continue;counts[id]=(counts[id]||0)+1;
    programs.push({channel:id,start:startDate,end:endDate,title:tagValue(element,'title').slice(0,130)||'Programme',description:tagValue(element,'desc').slice(0,180),category:tagValue(element,'category').slice(0,60)});
   }
 }}
 return {eat:eat,end:function(){buffer+=decoder.end();if(!programs.length)throw Error('XMLTV has no current/future programmes in the next 7 days.');return {names:names,programs:programs,rangeDays:7,limitBytes:MAX_BYTES};}};
}
function downloadCompact(url,options){options=options||{};var validate=options.validateURL||function(s){return new URL(s);};return new Promise(function(resolve,reject){var settled=false,req=null,raw=null,stream=null,timer=null,parser=reducer({now:options.now}),size=0;
 function finish(e,result){if(settled)return;settled=true;clearTimeout(timer);if(e){if(req)req.destroy();if(raw)raw.destroy();if(stream&&stream!==raw)stream.destroy();reject(e);}else resolve(result);}
 timer=setTimeout(function(){finish(Error('EPG download timed out.'));},options.timeout||120000);
 function get(address,redirects){var target;try{target=validate(address);}catch(e){return finish(e);}var lib=target.protocol==='https:'?https:http;
  req=lib.get(target,{headers:{'User-Agent':options.userAgent||'TiviLoom-webOS/0.6.4','Accept-Encoding':'gzip, deflate'}},function(res){if([301,302,303,307,308].indexOf(res.statusCode)>=0&&res.headers.location){res.resume();if(redirects>=5)return finish(Error('Too many EPG redirects.'));return get(new URL(res.headers.location,target).href,redirects+1);}
   if(res.statusCode<200||res.statusCode>=300){res.resume();return finish(Error('EPG HTTP '+res.statusCode));}
   raw=res;var enc=String(res.headers['content-encoding']||'').toLowerCase(),pathname=target.pathname.toLowerCase();
   stream=enc==='gzip'||(pathname.endsWith('.gz')&&enc!=='gzip')?res.pipe(zlib.createGunzip()):enc==='deflate'?res.pipe(zlib.createInflate()):res;
   res.on('error',finish);res.on('aborted',function(){finish(Error('EPG interrupted.'));});stream.on('error',finish);
   stream.on('data',function(chunk){try{size+=chunk.length;if(size>MAX_BYTES)return finish(Error('EPG exceeds 150 MiB decoded limit.'));parser.eat(chunk);}catch(e){finish(e);}});
   stream.on('end',function(){if(!settled){try{finish(null,parser.end());}catch(e){finish(e);}}});
  });req.on('error',function(e){finish(Error('Cannot connect to EPG: '+e.message));});req.setTimeout(30000,function(){finish(Error('EPG server stalled.'));});
 }
 get(url,0);
});}
module.exports={MAX_BYTES:MAX_BYTES,reducer:reducer,downloadCompact:downloadCompact,xmlDate:xmlDate};
