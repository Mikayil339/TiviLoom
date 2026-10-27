import {build} from 'esbuild';import fs from 'node:fs';
const pkg=JSON.parse(fs.readFileSync('package.json'));fs.writeFileSync('src/version.mjs',`export const VERSION=${JSON.stringify(pkg.version)};\n`);
await build({entryPoints:['src/app.mjs'],bundle:true,outfile:'app/bundle.js',target:'chrome79',format:'iife',sourcemap:true});
await build({entryPoints:['src/playlist-worker.mjs'],bundle:true,outfile:'app/assets/playlist-worker.js',target:'chrome79',format:'iife',minify:true});
for(const n of ['index.html','tv.css','phone.css'])fs.copyFileSync('src/'+n,'app/'+n);
const iconVersions=[['icon','icon-80.png'],['largeIcon','icon-130.png'],['storeIcon','icon-400.png']];
const info=JSON.parse(fs.readFileSync('app/appinfo.json'));
for(const [field,sourceName] of iconVersions){
 const filename=field+'-v'+pkg.version+'.png';
 fs.copyFileSync('branding/'+sourceName,'app/'+filename);
 info[field]=filename;
}
info.version=pkg.version;
fs.writeFileSync('app/appinfo.json',JSON.stringify(info,null,2)+'\n');
const service=JSON.parse(fs.readFileSync('service/package.json'));
service.version=pkg.version;
fs.writeFileSync('service/package.json',JSON.stringify(service,null,2)+'\n');console.log('Built TiviLoom '+pkg.version+' for webOS');
