export function recentChannels(channels,history,current,{hiddenChannels=[],hiddenGroups=[]}={}){
 const byId=new Map(channels.filter(c=>c.type==='tv'&&!hiddenChannels.includes(c.id)&&!hiddenGroups.includes(c.group)).map(c=>[c.id,c]));
 return [...new Set(history)].filter(id=>id!==current&&byId.has(id)).slice(0,20).map(id=>byId.get(id));
}
