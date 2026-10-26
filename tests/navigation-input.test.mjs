import test from 'node:test';
import assert from 'node:assert/strict';
import {DialogStack} from '../src/dialog-stack.mjs';
import {createPressGesture} from '../src/press-gesture.mjs';
import {recentChannels} from '../src/recent-channels.mjs';
import {displayRect} from '../src/display-mode.mjs';
import source from '../service/source.cjs';
import {makePIN,checkPIN} from '../src/usability.mjs';
import {addPlaylist,emptyCatalog,overlayPlaylist,playlistSnapshot} from '../src/playlists.mjs';
test('Settings Back returns through edit, playlist, playlists and settings without closing the app',()=>{
 const s=new DialogStack(),frame={inputs:{url:'unsaved URL'},scroll:240};s.enter('root',()=>null);s.enter('sources',()=>({page:'root'}));s.enter('playlist:a',()=>({page:'sources'}));s.enter('edit:a',()=>({page:'playlist'}));s.enter('child',()=>frame);
 assert.equal(s.back(),frame);assert.equal(s.key,'edit:a');assert.equal(s.back().page,'playlist');assert.equal(s.back().page,'sources');assert.equal(s.back().page,'root');assert.equal(s.back(),null);
});
test('Dialog refresh does not add duplicate Back steps and explicit parent selection drops obsolete branches',()=>{
 const s=new DialogStack();s.enter('root',()=>null);s.enter('sources',()=>1);s.enter('sources',()=>2);assert.equal(s.frames.length,1);s.enter('edit',()=>3);s.enter('root',()=>4);assert.equal(s.frames.length,0);assert.equal(s.back(),null);s.clear();assert.equal(s.key,null);
});
function gesture(){const calls=[],timers=new Map();let next=0;const p=createPressGesture({short:(k,t)=>calls.push(['short',k,t]),long:(k,t)=>calls.push(['long',k,t]),setTimer:fn=>{timers.set(++next,fn);return next;},clearTimer:id=>timers.delete(id)});return {p,calls,fire(){const fs=[...timers.values()];timers.clear();fs.forEach(f=>f());},timers};}
test('Short OK acts exactly once on release, even with repeated keydown events',()=>{const g=gesture();g.p.down('Enter','channel');g.p.down('Enter','channel');assert.equal(g.calls.length,0);g.p.up('Enter');g.fire();assert.deepEqual(g.calls,[['short','Enter','channel']]);assert.equal(g.p.up('Enter'),false);});
test('Long OK opens tools/menu once and release never also executes the short action',()=>{const g=gesture();g.p.down('Enter','channel');g.fire();g.p.down('Enter','channel');g.p.down('Enter','channel');g.p.up('Enter');assert.deepEqual(g.calls,[['long','Enter','channel']]);});
test('Missing keyup, blur cancellation, changed keys and stale timers cannot invoke a delayed action',()=>{const g=gesture();g.p.down('Enter','old');const stale=[...g.timers.values()][0];g.p.cancel();stale();g.p.up('Enter');assert.deepEqual(g.calls,[]);g.p.down('ArrowLeft','guide');g.p.down('Enter','new');g.p.up('Enter');g.fire();assert.deepEqual(g.calls,[['short','Enter','new']]);});
test('Short and long Back share one gesture and never exit twice',()=>{const g=gesture();g.p.down('back','settings');g.p.up('back');g.p.down('back','guide');g.fire();g.p.up('back');assert.deepEqual(g.calls,[['short','back','settings'],['long','back','guide']]);});
test('Recent channel cards use most recent first, exclude current, hidden, removed channels and movies',()=>{
 const c=['a','b','c','d'].map(id=>({id,type:'tv',group:id==='d'?'Hidden':'News'}));c.push({id:'film',type:'movie'});
 assert.deepEqual(recentChannels(c,['a','b','b','missing','film','c','d'],'a',{hiddenChannels:['c'],hiddenGroups:['Hidden']}).map(c=>c.id),['b']);
 const many=Array.from({length:30},(_,i)=>({id:String(i),type:'tv'}));assert.equal(recentChannels(many,many.map(c=>c.id),null).length,20);
});
test('Display modes produce actual 4:3/16:9/cinema framing and supported zoom modes',()=>{
 const four=displayRect('4:3',1280,720);assert.equal(four.width,960);assert.equal(four.height,720);assert.equal(four.left,160);assert.equal(four.fit,'fill');
 const wide=displayRect('2.35:1',1280,720);assert.equal(wide.width,1280);assert.ok(wide.top>80);assert.equal(displayRect('cover',1280,720).fit,'cover');assert.equal(displayRect('reduced',1280,720).scale,.8);assert.equal(displayRect('cinema-zoom',1280,720).scale,1.32);
});
test('Native PIN hashing interoperates with browser PBKDF2 and never accepts malformed records',async()=>{
 const api=source.createSourceAPI(),sender=source.APP_ID,record=(await api('hashPIN',{pin:'123456'},sender)).record;
 assert.equal(await checkPIN('123456',record),true);assert.equal((await api('verifyPIN',{pin:'999999',record},sender)).valid,false);
 const browser=await makePIN('4321');assert.equal((await api('verifyPIN',{pin:'4321',record:browser},sender)).valid,true);
 for(const bad of [{},{salt:[],hash:'bad'},{salt:Array(16).fill(-1),hash:'a'.repeat(64)}])assert.equal((await api('verifyPIN',{pin:'4321',record:bad},sender)).valid,false);
 await assert.rejects(api('hashPIN',{pin:'abc'},sender),/PIN/);await assert.rejects(api('hashPIN',{pin:1234},sender),/PIN/);await assert.rejects(api('hashPIN',{pin:'4321'},'com.foreign.app'),/authorized/);
});
test('Program bookmarks survive playlist snapshots, immediate restart and removed-channel filtering',()=>{
 const channels=[{id:'one',type:'tv',group:'News',name:'One',url:'https://example.test/a'}],savedPrograms=[{key:'one|1',channelId:'one',title:'Programme',start:1,end:2}];
 const p=addPlaylist(emptyCatalog(),{name:'A',channels,savedPrograms},'a').playlists[0];assert.deepEqual(p.savedPrograms,savedPrograms);
 assert.deepEqual(playlistSnapshot({...p,source:p.name}).savedPrograms,savedPrograms);
 assert.deepEqual(overlayPlaylist(p,{version:1,favorites:[],history:[],savedPrograms:[...savedPrograms,{channelId:'gone'}]}).savedPrograms,savedPrograms);
 assert.deepEqual(overlayPlaylist(p,{version:1,favorites:[],history:[]}).savedPrograms,savedPrograms);
});
