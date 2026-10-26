import {access} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
const exists=async file=>{try{await access(file);return true;}catch{return false;}};
export async function findCLI(root,{localOnly=false}={}){
  const candidates=[path.join(root,'node_modules/@webos-tools/cli/bin')];
  if(!localOnly){
    let current=root;
    for(let depth=0;depth<7;depth++){
      candidates.push(path.join(current,'work/webos/toolchain/node_modules/@webos-tools/cli/bin'));
      candidates.push(path.join(current,'tools/node_modules/@webos-tools/cli/bin'));
      const parent=path.dirname(current);if(parent===current)break;current=parent;
    }
  }
  for(const candidate of candidates){
    const names=['ares-install','ares-launch','ares-setup-device','ares-novacom'];
    if((await Promise.all(names.map(name=>exists(path.join(candidate,name+'.js'))))).every(Boolean))return candidate;
  }
  return null;
}
function runNode(file,args,cwd){return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[file,...args],{cwd,stdio:'inherit',shell:false});
  child.on('error',reject);child.on('exit',code=>resolve(code));
});}
export async function ensureTools(root,{prepare=true,localOnly=false,log=console.log,run=runNode,npmPath}={}){
  const ready=await findCLI(root,{localOnly});if(ready)return ready;
  if(!prepare)throw Error('Qurasdirma aletleri hele hazir deyil. TV-ye qurasdir.cmd faylini acin; aletler avtomatik hazirlanacaq.');
  for(const name of ['package.json','package-lock.json'])if(!await exists(path.join(root,name)))throw Error('Paket natamamdir. ZIP faylini tam qovluq kimi cixarin, sonra TV-ye qurasdir.cmd faylini acin.');
  const npm=npmPath||path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
  if(!await exists(npm))throw Error('Node.js npm aleti tapilmadi. Node.js-i npm ile birlikde qurasdirin, sonra yeniden acin.');
  log('webOS qurasdirma aletleri hazirlanir. Ilk defe internet baglantisi lazimdir...');
  const code=await run(npm,['ci','--include=dev','--no-audit','--no-fund','--cache',path.join(root,'.tool-cache')],root);
  if(code!==0)throw Error('Aletler yuklenmedi. Internet baglantisini yoxlayib bu fayli yeniden acin. Yuxaridaki xeta metnini de gondere bilersiniz.');
  const installed=await findCLI(root,{localOnly:true});
  if(!installed)throw Error('Yukleme bitdi, amma webOS aletleri tapilmadi. Qurasdirici xetasini gonderin.');
  return installed;
}
