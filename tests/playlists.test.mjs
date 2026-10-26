import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyCatalog,loadCatalog,activePlaylist,captureActive,addPlaylist,choosePlaylist,overlayPlaylist} from '../src/playlists.mjs';
const channel={id:'shared-channel',name:'Channel',group:'News',type:'tv',url:'https://example.test/live.m3u8'};
const data=name=>({name,channels:[{...channel}],programs:[],imported:true});
test('Existing single playlist migrates without losing channels, EPG, favorites or resume',()=>{
 const old={...data('Old'),source:'Old library',programs:[{channel:'shared-channel',title:'News'}]};
 const c=loadCatalog(old,{favorites:['shared-channel'],history:['shared-channel']},{guideChannel:'shared-channel',guideGroup:'News'});
 assert.equal(c.version,2);assert.equal(c.playlists.length,1);assert.equal(activePlaylist(c).name,'Old library');assert.deepEqual(activePlaylist(c).channels,old.channels);assert.deepEqual(activePlaylist(c).programs,old.programs);assert.deepEqual(activePlaylist(c).favorites,['shared-channel']);assert.equal(activePlaylist(c).resume.guideGroup,'News');
});
test('Adding and switching preserves both complete playlists and selected active ID on restart',()=>{
 const first=addPlaylist(emptyCatalog(),data('A'),'a'),second=addPlaylist(first,data('B'),'b');
 assert.equal(first.playlists.length,1);assert.equal(second.playlists.length,2);assert.equal(activePlaylist(second).name,'B');
 const restarted=loadCatalog(JSON.parse(JSON.stringify(choosePlaylist(second,'a'))));
 assert.equal(restarted.playlists.length,2);assert.equal(activePlaylist(restarted).name,'A');
});
test('Overlapping channel IDs keep favorites, history and channel/group state isolated per playlist',()=>{
 let c=addPlaylist(emptyCatalog(),data('A'),'a');
 c=captureActive(c,{...data('A'),source:'A',favorites:['shared-channel'],history:['shared-channel'],sourceURL:'https://example.test/a.m3u'},{guideChannel:'shared-channel',guideGroup:'News'});
 c=addPlaylist(c,data('B'),'b');c=captureActive(c,{...data('B'),source:'B',favorites:[],history:[]},{guideGroup:'Hamısı'});
 const a=activePlaylist(choosePlaylist(c,'a')),b=activePlaylist(c);
 assert.deepEqual(a.favorites,['shared-channel']);assert.deepEqual(b.favorites,[]);assert.equal(a.resume.guideGroup,'News');assert.equal(b.resume.guideGroup,'Hamısı');assert.equal(a.sourceURL,'https://example.test/a.m3u');
});
test('Synchronous per-playlist state overlay survives an immediate reopen and filters removed channels',()=>{
 const a=activePlaylist(addPlaylist(emptyCatalog(),data('A'),'a'));
 const over=overlayPlaylist(a,{version:1,favorites:['shared-channel','removed'],history:['shared-channel'],resume:{guideGroup:'News'}});
 assert.deepEqual(over.favorites,['shared-channel']);assert.equal(over.resume.guideGroup,'News');assert.deepEqual(a.favorites,[]);
});
test('Invalid additions and missing selection cannot replace the existing catalog',()=>{
 const c=addPlaylist(emptyCatalog(),data('A'),'a'),original=JSON.stringify(c);
 assert.throws(()=>addPlaylist(c,{channels:[]},'b'));assert.throws(()=>addPlaylist(c,data('A'),'a'));assert.throws(()=>choosePlaylist(c,'missing'));assert.equal(JSON.stringify(c),original);
});
test('Corrupt active identity and duplicate records recover deterministically',()=>{
 const a=activePlaylist(addPlaylist(emptyCatalog(),data('A'),'a'));
 const c=loadCatalog({version:2,activeId:'missing',playlists:[null,a,{...a},{}]});
 assert.equal(c.playlists.length,1);assert.equal(c.activeId,'a');assert.deepEqual(loadCatalog({channels:[channel],imported:false}),emptyCatalog());
});
