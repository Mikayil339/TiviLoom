import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {gzipSync} from 'node:zlib';
import source from '../service/source.cjs';

test('TV source service follows redirects, expands gzip and releases chunked data',async()=>{
 const text='#EXTM3U\n'+('Azərbaycan — TV\n'.repeat(6000));
 const server=http.createServer((req,res)=>{
  if(req.url==='/redirect'){res.writeHead(302,{Location:'/playlist'});return res.end();}
  if(req.url==='/playlist'){res.writeHead(200,{'Content-Encoding':'gzip'});return res.end(gzipSync(text));}
  res.writeHead(404);res.end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url='http://127.0.0.1:'+server.address().port;
  const api=source.createSourceAPI(),sender=source.APP_ID;
  const reply=await api('fetchSource',{url:url+'/redirect'},sender);
  assert.ok(reply.chunks>1);assert.equal(reply.finalURL,url+'/playlist');
  let result='';for(let i=0;i<reply.chunks;i++){
   const part=await api('readSource',{ticket:reply.ticket,index:i},sender);
   assert.ok(Buffer.byteLength(JSON.stringify(part))<65536);result+=part.text;
  }
  assert.equal(result,text);
  await api('releaseSource',{ticket:reply.ticket},sender);
  await assert.rejects(api('readSource',{ticket:reply.ticket,index:0},sender),/expired/);
  await assert.rejects(api('fetchSource',{url:url+'/missing'},sender),/HTTP 404/);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('TV service denies other callers and non-network schemes',async()=>{
 const api=source.createSourceAPI();
 await assert.rejects(api('fetchSource',{url:'http://example.test'},'com.other.app'),/authorized/);
 for(const value of ['file:///etc/passwd','ftp://example.test/a','http://user:password@example.test'])assert.throws(()=>source.validURL(value));
 assert.equal(source.validURL('https://example.test/list?token=a').protocol,'https:');
});
test('TV download enforces decoded size and total timeout',async()=>{
 const server=http.createServer((req,res)=>{if(req.url==='/large')res.end('a'.repeat(5000));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  await assert.rejects(source.download(base+'/large',{maxBytes:100}),/limit/);
  await assert.rejects(source.download(base+'/slow',{timeout:75}),/timed out/);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
