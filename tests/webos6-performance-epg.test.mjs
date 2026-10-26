import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {gzipSync} from 'node:zlib';
import source from '../service/source.cjs';
import epg from '../service/epg.cjs';
import phone from '../service/phone.cjs';
const root=new URL('../',import.meta.url);
test('EPG download cap is 150 MiB (decoded), streaming EPG does not require a browser DOM',async()=>{
 assert.equal(epg.MAX_BYTES,150*1024*1024);
 const now=Date.now(), fmt=d=>new Date(d).toISOString().replace(/[-:T]/g,'').slice(0,14)+' +0000';
 const data=`<?xml version="1.0"?><tv><channel id="eng"><display-name>English &amp; News</display-name></channel>`+
  Array.from({length:600},(_,i)=>`<programme channel="eng" start="${fmt(now+i*900000)}" stop="${fmt(now+(i+1)*900000)}"><title>News &amp; Sport ${i}</title><desc>A &lt; B</desc></programme>`).join('')+'</tv>';
 const zipped=gzipSync(Buffer.from(data));
 const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/xml','Content-Encoding':'gzip'});res.end(zipped);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
   const api=source.createSourceAPI();const sender=source.APP_ID;
   const r=await api('fetchSource',{kind:'epg',url:`http://127.0.0.1:${server.address().port}/xmltv.gz`},sender);
   let json='';for(let i=0;i<r.chunks;i++)json+=(await api('readSource',{ticket:r.ticket,index:i},sender)).text;
   const parsed=JSON.parse(json);assert.equal(parsed.names.eng,'English & News');assert(parsed.programs.length>=400);
   assert.equal(parsed.programs[0].title,'News & Sport 0');assert.equal(parsed.programs[0].description,'A < B');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('remote group focus no longer activates and rebuilds groups during ArrowDown',()=>{
 const ui=fs.readFileSync(new URL('../src/tv-ui.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/focusin[^\n]+selectGroup\(/);
 assert.match(ui,/closest\('\[data-tv\],\[data-group\]'\)/);
 assert.match(ui,/fastSelectGuide/);
});
test('local QR bridge delivers accepted playlist without PC or cloud in a local Node test',async()=>{
 const bridge=phone.createPhoneBridge({host:'127.0.0.1',port:0,addresses:['127.0.0.1']});const s=await bridge.start();const base=new URL(s.urls[0]).origin;
 try{
  const page=await fetch(base+'/phone');assert.equal(page.status,200);
  const reply=await fetch(base+'/api/playlist',{method:'POST',headers:{'Content-Type':'application/json','x-tiviloom-pair':s.token},body:JSON.stringify({name:'TV channels',url:'https://example.com/live.m3u'})});assert.equal(reply.status,200);
  const queued=await reply.json();const job=(await bridge.api('phonePoll',{token:s.token})).job;assert.equal(job.id,queued.id);
  await bridge.api('phoneComplete',{token:s.token,id:job.id,ok:true,message:'Playlist added on TV.'});
  const status=await(await fetch(base+'/api/status?id='+job.id,{headers:{'x-tiviloom-pair':s.token}})).json();assert.equal(status.status,'done');
 }finally{await bridge.stop();}
});
