import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountAdvanced} from '../src/advanced-ui.mjs';

const ui=readFileSync(new URL('../src/tv-ui.mjs',import.meta.url),'utf8');
test('Right on rail navigates to GROUPS before channel grid',()=>{
  assert.match(ui,/if\(key==='ArrowRight'\)\{setNav\(1\);return;\}if\(key==='Enter'\)/);
});
test('Long OK on a group opens its own properties',()=>{
  assert.match(ui,/target\?\.matches\('#groups \[data-group\]'\)/);
  assert.match(ui,/ctx\.advanced\.openGroupProperties\(target\.dataset\.group\)/);
});
test('Group scroll and button focus preserved on view refresh',()=>{
  assert.match(ui,/if\(markup!==lastGroupMarkup\)/);
  assert.match(ui,/const scroll=pane\.scrollTop;/);
  assert.match(ui,/pane\.scrollTop=scroll;/);
});
test('Large channel lists do not clone the playlist catalogue for every group check',()=>{
  const oldDocument=globalThis.document,oldWindow=globalThis.window,oldInterval=globalThis.setInterval;
  globalThis.document={addEventListener:()=>{},querySelector:()=>null};
  globalThis.window={addEventListener:()=>{}};
  globalThis.setInterval=()=>0;
  const state={channels:Array.from({length:15000},(_,i)=>({id:'ch'+i,group:'News',type:'tv'})),groupPins:{News:{hash:'secret'}},groupNames:{News:'News HD'},prefs:{}};
  let catalogReads=0;
  const ctx={state, $:()=>null, $$:()=>[], esc:String, toast:()=>{},platform:{native:false},getCatalog:()=>{catalogReads++;return {activeId:'list-1',playlists:[{id:'list-1',groupPins:state.groupPins}]};}};
  try{
    const adv=mountAdvanced(ctx);
    for(let i=0;i<state.channels.length;i++)assert.equal(adv.groupAccessible('News'),false);
    assert.ok(catalogReads<=1,'catalog reads '+catalogReads+' for 15,000 channels');
    assert.equal(adv.isGroupLocked('News'),true);
    assert.ok(catalogReads<=1);
  }finally{
    globalThis.document=oldDocument;globalThis.window=oldWindow;globalThis.setInterval=oldInterval;
  }
});
