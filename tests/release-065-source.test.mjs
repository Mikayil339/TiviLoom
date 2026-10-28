import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>readFile(path.join(root,rel),'utf8');
test('LG release version is consistent; Android mobile release has its own version',async()=>{
 const version=await read('src/version.mjs'); const pkg=JSON.parse(await read('package.json')); const info=JSON.parse(await read('app/appinfo.json')); const gradle=await read('android/app/build.gradle');
 assert.equal(version.trim(), 'export const VERSION="0.6.10";');
 assert.equal(pkg.version,'0.6.10');
 assert.equal(info.version,'0.6.10');
 assert.match(gradle,/versionCode 73/);
 assert.ok(gradle.includes("versionName '0.6.13'"));
});
test('playlist wizard updates validation state on input without Enter or blur',async()=>{
 const ui=await read('src/tv-ui.mjs');
 assert.match(ui,/document\.addEventListener\('input',[\s\S]{0,900}const validUrl=value=>/);
 assert.match(ui,/if\(next\)next\.disabled=!valid/);
 assert.doesNotMatch(ui,/!canNext\|\|w\.edit/);
});
test('Settings places Application Information last and uses category icons',async()=>{
 const ui=await read('src/tv-ui.mjs');
 assert.match(ui,/settingsIcons=\{library:'settings',sources:'list',epg:'clock',appearance:'palette',playback:'play',remote:'screen',parental:'lock',status:'history',about:'info'\}/);
 assert.match(ui,/rows\.filter\(\(\[id\]\)=>id!=='about'\)/);
 assert.match(ui,/Application information/);
});
test('phone navigation uses equal-width responsive slots and safe insets',async()=>{
 const css=await read('src/phone.css');
 assert.match(css,/flex:1 1 0;width:0;min-width:0/); assert.match(css,/env\(safe-area-inset-left\)/); assert.match(css,/env\(safe-area-inset-right\)/);
});
