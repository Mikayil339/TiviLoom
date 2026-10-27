import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
import {cleanOptions,makePIN,checkPIN} from '../src/usability.mjs';
import {emptyCatalog,addPlaylist,loadCatalog,editPlaylist} from '../src/playlists.mjs';
import {makeBackup} from '../src/backups.mjs';
import {parseM3U} from '../src/core.mjs';
const require=createRequire(import.meta.url);
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
