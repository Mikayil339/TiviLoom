import test from 'node:test';
import assert from 'node:assert/strict';
import {playbackPresentation,syncPlaybackRows,favoriteNumberLookup} from '../src/playback-status.mjs';
function row(id){const attrs={},classes=new Set(),marker={hidden:true,dataset:{},setAttribute:(k,v)=>attrs['marker:'+k]=v};return {dataset:{channel:id},attrs,classes,marker,classList:{toggle:(n,on)=>on?classes.add(n):classes.delete(n)},setAttribute:(k,v)=>attrs[k]=v,removeAttribute:k=>delete attrs[k],querySelector:s=>s==='.label'?{textContent:'Channel '+id}:marker};}
test('Tuning patches the existing favorite rows immediately, removes the previous marker and preserves node identity',()=>{
 const rows=['one','two','three'].map(row),root={querySelectorAll:()=>rows};let state={playing:'one',playbackPhase:'playing'};
 syncPlaybackRows(root,state);assert.equal(rows[0].marker.hidden,false);assert.equal(rows[0].attrs['aria-current'],'true');
 const focusedRow=rows[0];state={playing:'three',playbackPhase:'loading'};syncPlaybackRows(root,state);
 assert.equal(rows[0],focusedRow);assert.equal(rows[0].marker.hidden,true);assert.equal(rows[0].attrs['aria-current'],undefined);assert.equal(rows[2].marker.dataset.phase,'loading');assert.equal(rows.filter(r=>!r.marker.hidden).length,1);
 state.playbackPhase='playing';syncPlaybackRows(root,state);assert.equal(rows[2].classes.has('is-playing'),true);assert.match(rows[2].attrs['aria-label'],/Now playing/);
 state.playing=null;syncPlaybackRows(root,state);assert.equal(rows.every(r=>r.marker.hidden),true);
});
test('Paused, failed and buffering streams never retain a misleading playing triangle',()=>{
 for(const phase of ['loading','paused','buffering','error']){const r=row('one');syncPlaybackRows({querySelectorAll:()=>[r]},{playing:'one',playbackPhase:phase});assert.equal(r.classes.has('is-playing'),false);assert.equal(r.marker.dataset.phase,phase);assert.ok(r.attrs['marker:aria-label']);}
 assert.equal(playbackPresentation({playing:'two',playbackPhase:'playing'},'one').active,false);
});
test('Favorite number preview distinguishes an exact match, a multi-digit prefix and an unassigned number',()=>{
 const channels=['one','twelve','other','hidden','movie'].map((id,i)=>({id,type:id==='movie'?'movie':'tv',group:'News',logo:'logo-'+i}));const state={channels,favorites:channels.map(c=>c.id),channelNumbers:{one:1,twelve:12,other:3,hidden:4,movie:5},hiddenChannels:['hidden']};
 const first=favoriteNumberLookup(state,'1');assert.equal(first.exact.id,'one');assert.equal(first.exact.logo,'logo-0');assert.equal(first.candidates.length,2);
 assert.equal(favoriteNumberLookup(state,'12').exact.id,'twelve');assert.equal(favoriteNumberLookup(state,'2').exact,null);assert.equal(favoriteNumberLookup(state,'4').candidates.length,0);assert.equal(favoriteNumberLookup(state,'5').candidates.length,0);
 state.hiddenGroups=['News'];assert.equal(favoriteNumberLookup(state,'1').candidates.length,0);state.hiddenGroups=[];state.favorites=[];assert.equal(favoriteNumberLookup(state,'3').exact,null);
});