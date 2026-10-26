import test from 'node:test';
import assert from 'node:assert/strict';
import {captureResume,resumePlan} from '../src/startup.mjs';
const channels=[{id:'a',type:'tv',group:'News'},{id:'b',type:'tv',group:'Sport'},{id:'c',type:'tv',group:'Sport'},{id:'film',type:'movie',group:'Cinema'}];

test('Restart keeps TV selection/group, resets EPG to now and does not play by default',()=>{
 const saved=captureResume({channels,view:'guide',channel:'c',playing:'b',group:'Sport'});
 const plan=resumePlan(channels,saved,{},[],[],9_876_543);
 assert.deepEqual(plan,{view:'guide',channel:'c',group:'Sport',window:9_000_000,autoplay:false,fullscreen:false});
});
test('Turn on last channel starts the last played TV channel in the player',()=>{
 const plan=resumePlan(channels,{guideChannel:'a',guideGroup:'News',lastTVChannel:'b'},{autoplay:true});
 assert.equal(plan.channel,'b');assert.equal(plan.group,'Hamısı');assert.equal(plan.fullscreen,true);assert.equal(plan.autoplay,true);
});
test('Browsing movies does not overwrite the last TV selection or channel',()=>{
 const previous={version:1,guideChannel:'b',guideGroup:'Sport',lastTVChannel:'b'};
 const saved=captureResume({channels,view:'movies',channel:'film',playing:'film',group:'Cinema'},previous);
 assert.deepEqual(saved,previous);assert.equal(resumePlan(channels,saved).view,'guide');assert.equal(resumePlan(channels,saved).channel,'b');
});
test('Removed channels, groups and favorites recover to a valid visible TV channel',()=>{
 assert.equal(resumePlan(channels,{guideChannel:'removed',guideGroup:'Removed'}).channel,'a');
 assert.equal(resumePlan(channels,{guideChannel:'b',guideGroup:'Sevimlilər'}, {},[]).group,'Hamısı');
 assert.equal(resumePlan(channels,{guideChannel:'b',guideGroup:'Sevimlilər'}, {},['b']).group,'Sevimlilər');
 assert.equal(resumePlan(channels,{}, {},[],['film','c']).channel,'c');
});
test('VOD-only library opens empty TV guide without auto-playing a movie',()=>{
 const plan=resumePlan(channels.filter(c=>c.type==='movie'),{lastTVChannel:'gone'},{autoplay:true});
 assert.equal(plan.channel,null);assert.equal(plan.view,'guide');assert.equal(plan.autoplay,false);
});
