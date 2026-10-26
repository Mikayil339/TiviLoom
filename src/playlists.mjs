import {cleanOptions} from './usability.mjs';
const list=value=>Array.isArray(value)?value:[];
export function emptyCatalog(){return {version:2,activeId:null,playlists:[]};}
export function playlistSnapshot(state,resume={}){
  return {name:state.source||'Playlist',channels:list(state.channels),programs:list(state.programs),epgNames:state.epgNames||{},imported:!!state.imported,
    sourceURL:state.sourceURL||'',epgURL:state.epgURL||'',favorites:list(state.favorites),history:list(state.history),reminders:list(state.reminders),savedPrograms:list(state.savedPrograms),resume:{...resume},
    enabled:state.enabled!==false,userAgent:state.userAgent||'',updateHours:Number(state.updateHours)||0,updateOnStart:!!state.updateOnStart,lastUpdated:Number(state.lastUpdated)||0,...cleanOptions(state,state.channels,state.favorites)};
}
export function loadCatalog(value,legacyState={},legacyResume={}){
  if(value?.version===2&&Array.isArray(value.playlists)){
    const seen=new Set(),playlists=value.playlists.filter(p=>{
      if(!p||typeof p.id!=='string'||!Array.isArray(p.channels)||!p.channels.length||seen.has(p.id))return false;
      seen.add(p.id);return true;
    });
    return {version:2,activeId:playlists.some(p=>p.id===value.activeId&&p.enabled!==false)?value.activeId:playlists.find(p=>p.enabled!==false)?.id||null,playlists};
  }
  if(value?.imported&&value.channels?.length){
    const playlist={...playlistSnapshot({...legacyState,...value},legacyResume),id:'legacy-active'};
    return {version:2,activeId:playlist.id,playlists:[playlist]};
  }
  return emptyCatalog();
}
export function activePlaylist(catalog){return catalog.playlists.find(p=>p.id===catalog.activeId)||null;}
export function captureActive(catalog,state,resume){
  if(!catalog.activeId)return catalog;
  return {...catalog,playlists:catalog.playlists.map(p=>p.id===catalog.activeId?{...p,...playlistSnapshot(state,resume)}:p)};
}
export function addPlaylist(catalog,data,id){
  if(!id||catalog.playlists.some(p=>p.id===id))throw Error('Playlist identity already exists.');
  if(!Array.isArray(data.channels)||!data.channels.length)throw Error('Playlist has no channels.');
  const playlist={...playlistSnapshot({...data,source:data.name||data.source},data.resume),id};
  return {...catalog,version:2,activeId:id,playlists:[...catalog.playlists,playlist]};
}
export function choosePlaylist(catalog,id){
  if(!catalog.playlists.some(p=>p.id===id&&p.enabled!==false))throw Error('Playlist was not found or is disabled.');
  return {...catalog,activeId:id};
}
export function overlayPlaylist(playlist,saved){
  if(!saved||saved.version!==1)return playlist;
  const ids=new Set(playlist.channels.map(c=>c.id));
  const filter=value=>list(value).filter(id=>ids.has(id));
  const favorites=filter(saved.favorites);return {...playlist,favorites,history:filter(saved.history),reminders:list(saved.reminders),savedPrograms:list(saved.savedPrograms||playlist.savedPrograms).filter(p=>p&&ids.has(p.channelId)),resume:{...playlist.resume,...saved.resume},...cleanOptions({...playlist,...saved},playlist.channels,favorites)};
}
export function editPlaylist(catalog,id,patch){
 if(!catalog.playlists.some(p=>p.id===id))throw Error('Playlist was not found.');
 const playlists=catalog.playlists.map(p=>p.id===id?{...p,...patch,id:p.id}:p);
 return {...catalog,playlists,activeId:playlists.some(p=>p.id===catalog.activeId&&p.enabled!==false)?catalog.activeId:playlists.find(p=>p.enabled!==false)?.id||null};
}
export function deletePlaylist(catalog,id){
 const playlists=catalog.playlists.filter(p=>p.id!==id);return {...catalog,playlists,activeId:playlists.some(p=>p.id===catalog.activeId&&p.enabled!==false)?catalog.activeId:playlists.find(p=>p.enabled!==false)?.id||null};
}
