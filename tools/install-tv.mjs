import {spawn} from 'node:child_process';
import {access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createInterface} from 'node:readline/promises';
import {ensureTools} from './ensure-tools.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let cli;
const checkOnly=process.argv.includes('--check'),prepareOnly=process.argv.includes('--prepare');
try{
  if(Number(process.versions.node.split('.')[0])<22)throw Error('Node.js 22 ve ya daha yeni versiya lazimdir.');
  await access(path.join(root,'ipk/com.tiviloom.app_0.6.4_all.ipk'));
  cli=await ensureTools(root,{prepare:!checkOnly||prepareOnly,localOnly:process.argv.includes('--local-tools')});
}catch(error){console.error(error.code==='ENOENT'?'IPK tapilmadi. ZIP faylini tam cixarin, sonra qurasdiricini acin.':error.message);process.exit(1);}
if(checkOnly||prepareOnly){console.log('webOS qurasdirma aletleri hazirdir. TV-ye baglanti edilmedi.');process.exit(0);}
const rl=createInterface({input:process.stdin,output:process.stdout});
console.log('TiviLoom webOS 0.6.4\nTurn on Developer Mode and Key Server on the TV. Use the same local network.');
const host=(await rl.question('TV IP address: ')).trim();rl.close();
if(!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)||host.split('.').some(x=>+x>255)){console.error('Enter a valid IPv4 address shown on the TV.');process.exit(1);}
const alias='tiviloom-'+host.replaceAll('.','-');
function command(name,args){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(cli,name+'.js'),...args],{stdio:'inherit',shell:false});child.on('error',reject);child.on('exit',code=>resolve(code));});}
const info=JSON.stringify({host,port:9922,username:'prisoner',description:'TiviLoom TV'});
let code=await command('ares-setup-device',['--add',alias,'--info',info]);
if(code!==0)code=await command('ares-setup-device',['--modify',alias,'--info',info]);
if(code!==0)process.exit(code||1);
console.log('Enter the temporary passphrase displayed in Developer Mode when LG asks.');
code=await command('ares-novacom',['--device',alias,'--getkey']);if(code!==0)process.exit(code||1);
code=await command('ares-install',['--device',alias,path.join(root,'ipk/com.tiviloom.app_0.6.4_all.ipk')]);if(code!==0)process.exit(code||1);
code=await command('ares-launch',['--device',alias,'com.tiviloom.app']);process.exit(code||0);
