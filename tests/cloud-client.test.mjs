import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createCloudBridge,validateEndpoint}=require('../service/cloud-client.cjs');

test('TV Cloud client calls HTTPS relay only with one-time pairing token', async()=>{
 const original=https.request,requests=[],activity=[];
 https.request=function(url,options,callback){
  const req=new EventEmitter(),chunks=[];
  req.setTimeout=()=>req;
  req.write=part=>{chunks.push(part);return true;};
  req.end=function(part){if(part)chunks.push(part);queueMicrotask(()=>{
   const body=chunks.join(''),entry={url:url.href,method:options.method,token:options.headers['X-TiviLoom-Token'],body:body?JSON.parse(body):null};requests.push(entry);
   const resp=new PassThrough();resp.statusCode=200;callback(resp);
   resp.end(JSON.stringify(entry.url.endsWith('/v1/open')?{returnValue:true,expires:Date.now()+600000}:entry.url.endsWith('/v1/poll')?{returnValue:true,job:{id:'abc',type:'playlist',payload:{name:'TV',url:'https://provider.test/list.m3u'}}}:{returnValue:true}));
  });};
  req.destroy=()=>req;
  return req;
 };
 try{
  const bridge=createCloudBridge({onActive:v=>activity.push(v)});
  const root='https://relay.example.workers.dev/';
  const open=await bridge.api('phoneStart',{bridgeURL:root});
  assert.equal(open.cloud,true);assert.equal(open.token.length,48);
  assert.equal(open.urls[0],root+'phone#'+open.token);
  const poll=await bridge.api('phonePoll',{token:open.token});assert.equal(poll.job.payload.name,'TV');
  await bridge.api('phoneComplete',{token:open.token,id:'abc',ok:true,message:'Playlist added on TV.'});
  await bridge.api('phoneStop',{token:open.token});
  assert.deepEqual(activity,[true,false]);
  assert.deepEqual(requests.map(x=>new URL(x.url).pathname),['/v1/open','/v1/poll','/v1/complete','/v1/close']);
  assert.equal(requests[0].body.token,open.token);
  assert.equal(requests[1].token,open.token);
  assert.equal(requests[2].body.ok,true);
 }finally{https.request=original;}
});
test('cloud relay only accepts clean HTTPS URLs',()=>{
 assert.equal(validateEndpoint('https://my-service.workers.dev/').hostname,'my-service.workers.dev');
 for(const url of ['http://192.168.1.1/','https://user:pass@example.org/','https://example.org/bad','https://example.org/?secret=1'])assert.throws(()=>validateEndpoint(url));
});
