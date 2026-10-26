import {build} from 'esbuild';import fs from 'node:fs';
const pkg=JSON.parse(fs.readFileSync('package.json'));fs.writeFileSync('src/version.mjs',`export const VERSION=${JSON.stringify(pkg.version)};\n`);
await build({entryPoints:['src/app.mjs'],bundle:true,outfile:'app/bundle.js',target:'chrome79',format:'iife',sourcemap:true});
await build({entryPoints:['src/playlist-worker.mjs'],bundle:true,outfile:'app/assets/playlist-worker.js',target:'chrome79',format:'iife',minify:true});
for(const n of ['index.html','tv.css','phone.css'])fs.copyFileSync('src/'+n,'app/'+n);
for(const n of ['app/appinfo.json','service/package.json']){const j=JSON.parse(fs.readFileSync(n));j.version=pkg.version;fs.writeFileSync(n,JSON.stringify(j,null,2)+'\n');}console.log('Built TiviLoom '+pkg.version+' for webOS / phone');
