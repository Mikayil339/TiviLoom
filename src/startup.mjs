// Resume only durable library selection. Dialogs, old EPG time and media URLs
// belonging to a previous server process must never be restored.
export function captureResume(state, previous={}) {
  const result={version:1,...previous};
  const selected=state.channels.find(c=>c.id===state.channel);
  const playing=state.channels.find(c=>c.id===state.playing);
  if(state.view==='guide'&&selected?.type==='tv') {
    result.guideChannel=selected.id;
    result.guideGroup=state.group;
  }
  if(playing?.type==='tv')result.lastTVChannel=playing.id;
  return result;
}

export function resumePlan(channels, saved={}, prefs={}, favorites=[], history=[], now=Date.now()) {
  const tv=channels.filter(c=>c.type==='tv');
  const exists=id=>tv.find(c=>c.id===id);
  const last=exists(saved.lastTVChannel)||history.map(exists).find(Boolean);
  const selected=(prefs.autoplay&&last)||exists(saved.guideChannel)||last||tv[0];
  let group=saved.guideGroup||'Hamısı';
  if(group==='Sevimlilər') {
    if(!selected||!favorites.includes(selected.id))group='Hamısı';
  } else if(group!=='Hamısı'&&selected?.group!==group)group='Hamısı';
  return {view:'guide',channel:selected?.id||null,group,window:Math.floor(now/1800000)*1800000,
    autoplay:!!(prefs.autoplay&&selected),fullscreen:!!(prefs.autoplay&&selected)};
}
