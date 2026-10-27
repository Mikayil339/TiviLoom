import test from 'node:test';
import assert from 'node:assert/strict';
import {assignNumber,numberKey,cleanOptions,moveFavorite,normalizeSearch,reconnectDelay,validSourceSettings,makePIN,checkPIN} from '../src/usability.mjs';
import {makeBackup,validateBackup,mergeBackup} from '../src/backups.mjs';
import {emptyCatalog,addPlaylist,editPlaylist,deletePlaylist,choosePlaylist,overlayPlaylist} from '../src/playlists.mjs';
import {parseM3U} from '../src/core.mjs';
const channels=['a','b','c'].map(id=>({id,name:id,group:'News',type:'tv',url:'https://example.test/'+id}));
const data={name:'A',channels,favorites:['a','b'],channelNumbers:{a:7},hiddenChannels:['c'],hiddenGroups:[],lockedChannels:['b'],sourceURL:'https://example.test/a.m3u',updateHours:24};
test('Favorite numbers enforce unique values, range and membership; digits work on both keypads',()=>{
 assert.deepEqual(assignNumber({a:7},'b','12',['a','b']),{a:7,b:12});
 for(const n of ['7','0','10000','1.5','a'])assert.throws(()=>assignNumber({a:7},'b',n,['a','b']));
 assert.throws(()=>assignNumber({},'c','1',['a']));assert.deepEqual(assignNumber({a:7},'a','',['a']),{});
 assert.equal(numberKey({keyCode:103}),'7');assert.equal(numberKey({keyCode:55}),'7');assert.equal(numberKey({key:'3'}),'3');assert.equal(numberKey({key:'ArrowDown'}),null);
});
test('Removed channels prune customization; favorite order and options remain isolated on overlays',()=>{
 const clean=cleanOptions({...data,channelNumbers:{a:7,b:7,c:8,missing:9},hiddenChannels:['c','missing'],hiddenGroups:'invalid'},channels,['a','b']);
 assert.deepEqual(clean.channelNumbers,{a:7});assert.deepEqual(clean.hiddenChannels,['c']);assert.deepEqual(clean.hiddenGroups,[]);
 assert.deepEqual(moveFavorite(['a','b','c'],'c',-1),['a','c','b']);assert.deepEqual(moveFavorite(['a','b'],'a',-1),['a','b']);
 const p=addPlaylist(emptyCatalog(),data,'p').playlists[0];const over=overlayPlaylist(p,{version:1,favorites:['b'],channelNumbers:{b:42},hiddenChannels:['a'],history:[]});
 assert.deepEqual(over.channelNumbers,{b:42});assert.deepEqual(p.channelNumbers,{a:7});assert.deepEqual(over.hiddenChannels,['a']);
});
test('Disabled/deleted active playlists select another enabled list or a clean empty state',()=>{
 let c=addPlaylist(addPlaylist(emptyCatalog(),data,'a'),{...data,name:'B'},'b');
 c=editPlaylist(c,'b',{enabled:false});assert.equal(c.activeId,'a');assert.throws(()=>choosePlaylist(c,'b'));
 c=editPlaylist(c,'a',{enabled:false});assert.equal(c.activeId,null);c=editPlaylist(c,'b',{enabled:true});assert.equal(c.activeId,'b');
 c=deletePlaylist(c,'b');assert.equal(c.activeId,null);assert.equal(c.playlists.length,1);assert.equal(deletePlaylist(c,'a').playlists.length,0);
});
test('Backup restores additional lists and customization while excluding the PIN',()=>{
 const c=addPlaylist(emptyCatalog(),data,'old'),prefs={parental:{hash:'secret'},lockSettings:true,autoplay:true,longOK:'phone',remoteActions:{favorite:'last-channel',bad:'unknown'}};
 const backup=makeBackup(c,prefs);assert.equal(backup.prefs.parental,undefined);assert.equal(backup.prefs.lockSettings,undefined);assert.equal(backup.prefs.longOK,undefined);
 const valid=validateBackup(JSON.parse(JSON.stringify(backup)));const merged=mergeBackup(c,valid,()=> 'new');
 assert.equal(merged.playlists.length,2);assert.equal(merged.activeId,'new');assert.deepEqual(merged.playlists[0],c.playlists[0]);assert.deepEqual(merged.playlists[1].channelNumbers,{a:7});assert.deepEqual(merged.playlists[1].lockedChannels,['b']);
 assert.throws(()=>validateBackup({format:'Other',version:2}));
 assert.throws(()=>validateBackup({...backup,catalog:{...c,playlists:[{...c.playlists[0],channels:[{...channels[0],url:'file:///secret'}]}]}}));
 const disabled={catalog:editPlaylist(c,'old',{enabled:false}),prefs:{}};assert.equal(mergeBackup(emptyCatalog(),disabled,()=> 'disabled').activeId,null);
});
test('PIN hashes use independent salts and reject wrong or malformed input',async()=>{
 const one=await makePIN('1234'),two=await makePIN('1234');assert.notDeepEqual(one.salt,two.salt);assert.notEqual(one.hash,two.hash);assert.equal(one.hash.length,64);
 assert.equal(await checkPIN('1234',one),true);assert.equal(await checkPIN('9999',one),false);assert.equal(await checkPIN('bad',one),false);await assert.rejects(makePIN('12'),/4–6/);
});
test('Search normalizes Azerbaijani and source settings reject invalid addresses and headers',()=>{
 assert.equal(normalizeSearch('ŞƏKİ IĞDIR'),'seki igdir');assert.deepEqual([1,2,3,4].map(reconnectDelay),[1500,3500,7000,null]);
 assert.equal(validSourceSettings({...data,userAgent:'TV/1'}).updateHours,24);
 for(const p of [{name:''},{...data,sourceURL:'file:///a'},{...data,userAgent:'x\r\ny'},{...data,updateHours:2}])assert.throws(()=>validSourceSettings(p));
});
test('Playlist logo attributes support single quotes, commas, relative addresses and alternate names',()=>{
 const {channels,epg}=parseM3U("#EXTM3U url-tvg='guide.xml'\n#EXTINF:-1 tvg-id='x' group-title='News, local' tvg-logo='../logo.png?a=1&amp;b=2',Name, HD\nstreams/a.m3u8\n#EXTINF:-1 logo=logo2.png,Second\nhttps://example.test/second\n",'https://example.test/lists/a.m3u');
 assert.equal(channels[0].name,'Name, HD');assert.equal(channels[0].logo,'https://example.test/logo.png?a=1&b=2');assert.equal(channels[1].logo,'https://example.test/lists/logo2.png');assert.equal(epg,'https://example.test/lists/guide.xml');
});
