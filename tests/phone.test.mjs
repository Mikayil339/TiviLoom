import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {gzipSync} from 'node:zlib';
import phone from '../service/phone.cjs';
import source from '../service/source.cjs';
import lifecycle from '../service/lifecycle.cjs';
test('Phone activity holds the webOS service only for the pairing session, including close during creation',()=>{
 let callback,creates=0;const completed=[];const active=lifecycle.phoneActivity({create(name,cb){creates++;callback=cb;},complete(a,cb){completed.push(a);cb();}});
 active(true);active(true);assert.equal(creates,1);active(false);callback('late');assert.deepEqual(completed,['late']);
 active(true);callback('live');active(true);assert.equal(creates,2);active(false);assert.deepEqual(completed,['late','live']);
});
test('Phone pairing requires token, local Host and matching Origin before queuing a TV confirmation',async()=>{
 const bridge=phone.createPhoneBridge({port:0,host:'127.0.0.1',addresses:['127.0.0.1']});
 const session=await bridge.start(),url=new URL(session.urls[0]),base=url.origin,token=session.token;
 const headers={'Content-Type':'application/json','x-tiviloom-pair':token};
 try{
  assert.equal((await fetch(base+'/phone')).status,200);assert.equal((await fetch(base+'/api/backup')).status,403);
  const badHost=await new Promise((resolve,reject)=>{http.get(base+'/api/backup',{headers:{...headers,Host:'attacker.test'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});assert.equal(badHost,403);
  assert.equal((await fetch(base+'/api/playlist',{method:'POST',headers:{...headers,Origin:'https://attacker.test'},body:'{}'})).status,403);
  assert.equal((await fetch(base+'/api/playlist',{method:'POST',headers,body:JSON.stringify({url:'file:///secret'})})).status,400);
  const sent=await(await fetch(base+'/api/playlist',{method:'POST',headers,body:JSON.stringify({name:'Phone',url:'https://example.test/live.m3u'})})).json();assert.ok(sent.id);
  const poll=await bridge.api('phonePoll',{token});assert.equal(poll.job.payload.name,'Phone');assert.equal(poll.job.id,sent.id);assert.equal((await bridge.api('phonePoll',{token})).job,null);
  assert.equal((await(await fetch(base+'/api/status?id='+sent.id,{headers})).json()).status,'working');
  await bridge.api('phoneComplete',{token,id:sent.id,ok:true,message:'Added'});
  assert.equal((await(await fetch(base+'/api/status?id='+sent.id,{headers})).json()).status,'done');
  await assert.rejects(bridge.api('phonePoll',{token:'wrong'}),/Invalid phone/);
 }finally{await bridge.stop();}
});
test('Phone backup chunks download intact and restore waits for TV acceptance; expired sessions stop',async()=>{
 let now=1000;const bridge=phone.createPhoneBridge({port:0,host:'127.0.0.1',addresses:[],now:()=>now});
 const s=await bridge.start(),base=new URL(s.urls[0]).origin,token=s.token,headers={'Content-Type':'application/json','x-tiviloom-pair':token};
 try{
  assert.equal(s.localOnly,true);assert.equal((await fetch(base+'/api/backup',{headers})).status,409);
  const text=JSON.stringify({format:'TiviLoom',version:2,note:'ə'.repeat(20000)});
  await bridge.api('phoneBackupBegin',{token});await assert.rejects(bridge.api('phoneBackupPart',{token,index:1,text:'bad'}),/Invalid/);
  for(let i=0;i<text.length;i+=8192)await bridge.api('phoneBackupPart',{token,index:i/8192,text:text.slice(i,i+8192)});
  await bridge.api('phoneBackupEnd',{token});assert.equal(await(await fetch(base+'/api/backup',{headers})).text(),text);
  const sent=await(await fetch(base+'/api/restore',{method:'POST',headers,body:text})).json();const j=(await bridge.api('phonePoll',{token})).job;assert.equal(j.type,'restore');assert.equal(j.id,sent.id);
  let read='';for(let i=0;i<j.chunks;i++)read+=(await bridge.api('phoneRead',{token,id:j.id,index:i})).text;assert.equal(read,text);
  await bridge.api('phoneComplete',{token,id:j.id,ok:false,message:'Rejected on TV'});assert.equal((await(await fetch(base+'/api/status?id=junk',{headers})).json()).error,'Request not found.');
  now=s.expires+1;await assert.rejects(bridge.api('phonePoll',{token}),/expired/);
 }finally{await bridge.stop();}
});
test('Native service rejects foreign phone callers; private address filter excludes public networks',async()=>{
 const api=source.createSourceAPI();await assert.rejects(api('phoneStart',{},'com.other.app'),/authorized/);
 for(const ip of ['127.0.0.1','192.168.1.2','172.16.0.1','10.0.0.2','::ffff:192.168.1.2'])assert.equal(phone.privateAddress(ip),true);
 for(const ip of ['8.8.8.8','172.15.0.1','192.169.0.1'])assert.equal(phone.privateAddress(ip),false);
});
test('Logo service follows redirects/gzip and caches image data; source User-Agent is forwarded',async()=>{
 let calls=0,agent;const image=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>');
 const server=http.createServer((req,res)=>{agent=req.headers['user-agent'];if(req.url==='/redirect'){res.writeHead(302,{Location:'/logo'});return res.end();}if(req.url==='/logo'){calls++;res.writeHead(200,{'Content-Type':'image/svg+xml','Content-Encoding':'gzip'});return res.end(gzipSync(image));}res.writeHead(200,{'Content-Type':'text/plain'});res.end('playlist');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,api=source.createSourceAPI(),sender=source.APP_ID;
 try{
  const r=await api('fetchImage',{url:base+'/redirect'},sender),part=await api('readSource',{ticket:r.ticket,index:0},sender);assert.equal(part.text,'data:image/svg+xml;base64,'+image.toString('base64'));await api('releaseSource',{ticket:r.ticket},sender);
  await api('fetchImage',{url:base+'/redirect'},sender);assert.equal(calls,1);await assert.rejects(api('fetchImage',{url:base+'/text'},sender),/format/);
  await api('fetchSource',{url:base+'/text',userAgent:'CustomTV/1'},sender);assert.equal(agent,'CustomTV/1');await assert.rejects(api('fetchSource',{url:base+'/text',userAgent:'x\r\ny'},sender),/User-Agent/);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
