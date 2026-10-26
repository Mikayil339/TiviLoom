import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {ensureTools,findCLI} from '../tools/ensure-tools.mjs';
const base=path.resolve('work/webos/installer-tests');await mkdir(base,{recursive:true});
async function fixture(){const root=await mkdtemp(path.join(base,'package with spaces-'));await writeFile(path.join(root,'package.json'),'{}');await writeFile(path.join(root,'package-lock.json'),'{}');const npmPath=path.join(root,'npm-cli.js');await writeFile(npmPath,'');return {root,npmPath};}
async function toolsAt(bin){await mkdir(bin,{recursive:true});for(const name of ['ares-install','ares-launch','ares-setup-device','ares-novacom'])await writeFile(path.join(bin,name+'.js'),'');}
test('Nested extracted package finds existing workspace CLI without a download',async()=>{
 const {root}=await fixture(),bin=path.join(root,'work/webos/toolchain/node_modules/@webos-tools/cli/bin'),nested=path.join(root,'outputs/version/TiviLoom-webOS');await toolsAt(bin);await mkdir(nested,{recursive:true});assert.equal(await findCLI(nested),bin);
 assert.equal(await ensureTools(nested,{run:()=>{throw Error('Unexpected download');}}),bin);
});
test('Missing tools automatically install locally using the lockfile and support paths with spaces',async()=>{
 const {root,npmPath}=await fixture(),bin=path.join(root,'node_modules/@webos-tools/cli/bin');let invoked=false;
 const result=await ensureTools(root,{localOnly:true,npmPath,log:()=>{},run:async(file,args,cwd)=>{invoked=true;assert.equal(file,npmPath);assert.equal(cwd,root);assert.equal(args[0],'ci');assert.ok(args.includes('--include=dev'));assert.ok(args.includes(path.join(root,'.tool-cache')));await toolsAt(bin);return 0;}});
 assert.ok(invoked);assert.equal(result,bin);
});
test('Check-only never downloads or connects to a TV',async()=>{
 const {root}=await fixture();await assert.rejects(ensureTools(root,{localOnly:true,prepare:false,run:()=>{throw Error('Unexpected install');}}),/hele hazir deyil/);
});
test('Interrupted download gives a useful retry message instead of proceeding to TV installation',async()=>{
 const {root,npmPath}=await fixture();await assert.rejects(ensureTools(root,{localOnly:true,npmPath,log:()=>{},run:async()=>1}),/Internet baglantisini/);
});
test('Incomplete extraction is detected before network setup',async()=>{
 const root=await mkdtemp(path.join(base,'incomplete-'));await assert.rejects(ensureTools(root,{localOnly:true,run:()=>{throw Error('Unexpected install');}}),/ZIP faylini tam/);
});
