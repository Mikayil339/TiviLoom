const labels={loading:'Loading',playing:'Now playing',paused:'Paused',buffering:'Buffering',error:'Playback failed'};

export function playbackPresentation(state,id){
 const phase=state.playing===id?(state.playbackPhase||'loading'):'idle';
 return {phase,active:phase!=='idle',label:labels[phase]||''};
}

// Patch existing rows; media events must not rebuild the guide or move focus.
export function syncPlaybackRows(root,state){
 for(const row of root.querySelectorAll('.channel-name')){
  const p=playbackPresentation(state,row.dataset.channel),marker=row.querySelector('[data-playback-indicator]');
  row.classList.toggle('is-tuned',p.active);
  row.classList.toggle('is-playing',p.phase==='playing');
  if(p.active)row.setAttribute('aria-current','true');else row.removeAttribute('aria-current');
  const name=row.querySelector('.label')?.textContent||'';
  row.setAttribute('aria-label',name+(p.label?' · '+p.label:''));
  if(marker){marker.hidden=!p.active;marker.dataset.phase=p.phase;marker.setAttribute('title',p.label);marker.setAttribute('aria-label',p.label);}
 }
}

export function favoriteNumberLookup(state,value){
 const text=String(value),favorites=new Set(state.favorites||[]),hidden=new Set(state.hiddenChannels||[]),groups=new Set(state.hiddenGroups||[]);
 const candidates=state.channels.filter(c=>c.type==='tv'&&favorites.has(c.id)&&!hidden.has(c.id)&&!groups.has(c.group)&&Number.isInteger(state.channelNumbers?.[c.id])&&String(state.channelNumbers[c.id]).startsWith(text));
 return {exact:candidates.find(c=>String(state.channelNumbers[c.id])===text)||null,candidates};
}
