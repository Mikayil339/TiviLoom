import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.mjs';

const BASE='https://tiviloom-relay.example.workers.dev';
class MemoryKV {
  constructor(){this.values=new Map()}
  async put(k,v){this.values.set(k,String(v))}
  async get(k,type){const raw=this.values.get(k)||null;return type==='json'&&raw?JSON.parse(raw):raw}
  async delete(k){this.values.delete(k)}
}
function harness(){
 const env={SESSIONS:new MemoryKV()};
 const request=async(path,method='GET',body,token)=>{
  const res=await worker.fetch(new Request(BASE+path, {method,headers:{...(token?{'x-tiviloom-token':token}:{}),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),env);
  if(path==='/phone')return {status:res.status,text:await res.text(),headers:res.headers};
  return {status:res.status,body:await res.json()};
 };
 return {request,env};
}
const token='a'.repeat(48);
test('cloud QR full phone -> TV confirm -> phone status flow', async()=>{
 const {request}=harness();
 const healthy=await request('/health');assert.equal(healthy.body.configured,true);
 const opened=await request('/v1/open','POST',{token});assert.equal(opened.status,200);
 const html=await request('/phone');assert.match(html.text,/Send playlist to TV/);
 assert.match(html.headers.get('content-security-policy'),/default-src 'none'/);
 const submitted=await request('/v1/submit','POST',{name:'Family',url:'https://example.com/list.m3u?username=secret',epgURL:''},token);
 assert.equal(submitted.status,200);assert.match(submitted.body.id,/^[a-f0-9-]{20,}$/);
 const duplicate=await request('/v1/submit','POST',{url:'https://example.com/other.m3u'},token);assert.equal(duplicate.status,409);
 const polled=await request('/v1/poll','GET',undefined,token);
 assert.equal(polled.body.job.payload.name,'Family');
 assert.equal(polled.body.job.payload.url,'https://example.com/list.m3u?username=secret');
 const completed=await request('/v1/complete','POST',{id:submitted.body.id,ok:true,message:'Playlist saved to TV'},token);assert.equal(completed.status,200);
 const status=await request('/v1/status?id='+submitted.body.id,'GET',undefined,token);assert.equal(status.body.status,'done');
 const again=await request('/v1/poll','GET',undefined,token);assert.equal(again.body.job,null);
 const closed=await request('/v1/close','POST',{},token);assert.equal(closed.status,200);
 const after=await request('/v1/poll','GET',undefined,token);assert.equal(after.status,410);
});
test('Cloud endpoint validates tokens and source URL',async()=>{
 const {request}=harness();
 assert.equal((await request('/v1/poll')).status,403);
 await request('/v1/open','POST',{token});
 assert.equal((await request('/v1/submit','POST',{url:'file:///etc/passwd'},token)).status,400);
 assert.equal((await request('/v1/submit','POST',{url:'https://user:secret@example.com/list'},token)).status,400);
 assert.equal((await request('/v1/complete','POST',{id:'invalid',ok:true},token)).status,404);
});
test('Worker refuses missing KV binding and keeps HTTP response no-store',async()=>{
 const req=new Request(BASE+'/health');const res=await worker.fetch(req,{});
 assert.equal(res.status,503);assert.equal(res.headers.get('cache-control'),'no-store, max-age=0');
});
