import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
import {cleanOptions,makePIN,checkPIN} from '../src/usability.mjs';
import {emptyCatalog,addPlaylist,loadCatalog,editPlaylist} from '../src/playlists.mjs';
import {makeBackup} from '../src/backups.mjs';
import {parseM3U} from '../src/core.mjs';
const require=createRequire(import.meta.url);
const client=require('../service/relay-client.cjs');
const source=require('../service/source.cjs');

test('Group names and individually hashed PINs survive catalog reload and refresh',async()=>{
 const sports=await makePIN('4567'),kids=await makePIN('1234');
 const channels=[{id:'s1',name:'S1',group:'Sport',url:'https://example.com/s.m3u8',type:'tv'},{id:'k1',name:'K1',group:'Kids',url:'https://example.com/k.m3u8',type:'tv'}];
 const data={channels,name:'Cable',imported:true,groupNames:{Sport:'İdman',Kids:'Uşaqlar'},groupPins:{Sport:sports,Kids:kids}};
 const initial=addPlaylist(emptyCatalog(),data,'first');
 const loaded=loadCatalog(JSON.parse(JSON.stringify(initial)));
 assert.deepEqual(loaded.playlists[0].groupNames,data.groupNames);
 assert.equal(await checkPIN('4567',loaded.playlists[0].groupPins.Sport),true);
 assert.equal(await checkPIN('1234',loaded.playlists[0].groupPins.Sport),false);
 assert.equal(await checkPIN('1234',loaded.playlists[0].groupPins.Kids),true);
 const refreshed=editPlaylist(loaded,'first',{channels:channels.map(c=>({...c,name:c.name+' fresh'}))});
 assert.deepEqual(cleanOptions(refreshed.playlists[0],refreshed.playlists[0].channels).groupNames,data.groupNames);
 assert.equal(await checkPIN('4567',refreshed.playlists[0].groupPins.Sport),true);
 const backup=makeBackup(refreshed,{});
 assert.deepEqual(backup.catalog.playlists[0].groupNames,data.groupNames);
 assert.deepEqual(backup.catalog.playlists[0].groupPins,{}); // don't expose low-entropy PIN hashes
});

test('Phone bridge uses outgoing HTTP, never creates a server, and preserves confirmation state',async()=>{
 let createCount=0,valid='01020304',requests=[],token='123456789abc';
 const server=http.createServer(async(req,res)=>{
  createCount++;
  assert.equal(req.method,'POST');assert.equal(req.url,'/bridge');
  assert.equal(req.headers['x-tiviloom-code'],valid);
  let body='';for await(const data of req)body+=data;
  const entry=JSON.parse(body);requests.push(entry);
  let response;
  if(entry.method==='phoneStart')response={returnValue:true,token,urls:['http://192.168.1.4:19789/phone#'+token]};
  else if(entry.method==='phonePoll')response={returnValue:true,job:{id:'job',type:'playlist',payload:{name:'Test',url:'https://example.com/live.m3u'},chunks:0}};
  else response={returnValue:true};
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(response));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let activity=[];
 try{
  const bridge=client.createPhoneBridge({onActive:v=>activity.push(v)});
  const url='http://127.0.0.1:'+server.address().port+'/';
  const session=await bridge.api('phoneStart',{bridgeURL:url,bridgeCode:valid});
  assert.equal(session.token,token);assert.deepEqual(activity,[true]);
  const j=await bridge.api('phonePoll',{token});assert.equal(j.job.payload.url,'https://example.com/live.m3u');
  await bridge.api('phoneComplete',{token,id:'job',ok:true,message:'Playlist saved'});
  await bridge.api('phoneStop',{token});assert.deepEqual(activity,[true,false]);
  assert.deepEqual(requests.map(r=>r.method),['phoneStart','phonePoll','phoneComplete','phoneStop']);
  assert.equal(createCount,4);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('Source loader successfully downloads playlist through outbound HTTP and parses channels',async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','audio/x-mpegurl');res.end('#EXTM3U\n#EXTINF:-1 group-title="News",Live News\nhttps://media.example/live.m3u8\n');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const api=source.createSourceAPI();
  const url='http://127.0.0.1:'+server.address().port+'/channels.m3u';
  const result=await api('fetchSource',{url},source.APP_ID);
  const pieces=[];
  for(let i=0;i<result.chunks;i++)pieces.push((await api('readSource',{ticket:result.ticket,index:i},source.APP_ID)).text);
  const parsed=parseM3U(pieces.join(''),url);
  assert.equal(parsed.channels.length,1);assert.equal(parsed.channels[0].group,'News');
  assert.equal(parsed.channels[0].name,'Live News');
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('Remote address validation prevents plaintext off-LAN destinations',()=>{
 for(const url of ['http://google.com/','ftp://127.0.0.1/','http://127.0.0.1/path','http://user:pass@127.0.0.1/'])assert.throws(()=>client.bridgeAddress(url));
 assert.equal(client.bridgeAddress('http://192.168.1.2:19790/').hostname,'192.168.1.2');
});
