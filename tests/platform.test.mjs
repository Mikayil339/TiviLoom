import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
globalThis.window={};
globalThis.location={href:'file:///media/developer/apps/usr/palm/applications/com.tiviloom.app/index.html'};
const {remoteAction,validMediaURL,SERVICE}=await import('../src/platform.mjs');
test('LG physical Back, media and color keys map to app actions',()=>{
 assert.equal(remoteAction(461),'back');assert.equal(remoteAction(415),'play');assert.equal(remoteAction(19),'pause');assert.equal(remoteAction(413),'stop');assert.equal(remoteAction(403),'favorite');assert.equal(remoteAction(406),'context');assert.equal(remoteAction(175),null);
});
test('Packaged video and images resolve within the app instead of file:///assets',()=>{
 const root='file:///media/developer/apps/usr/palm/applications/com.tiviloom.app/';
 assert.equal(validMediaURL('/assets/demo.mp4'),root+'assets/demo.mp4');
 assert.equal(validMediaURL('assets/poster-0.svg'),root+'assets/poster-0.svg');
 assert.throws(()=>validMediaURL('file:///etc/passwd'));assert.throws(()=>validMediaURL('javascript:alert(1)'));
 assert.equal(validMediaURL('https://example.test/live.m3u8'),'https://example.test/live.m3u8');
});
test('Install metadata, service identity and browser bundle form one standalone app',async()=>{
 const app=JSON.parse(await readFile(new URL('../app/appinfo.json',import.meta.url)));
 const service=JSON.parse(await readFile(new URL('../service/services.json',import.meta.url)));
 const html=await readFile(new URL('../app/index.html',import.meta.url),'utf8');
 const bundle=await readFile(new URL('../app/bundle.js',import.meta.url),'utf8');
 assert.equal(app.disableBackHistoryAPI,true);assert.equal(app.resolution,'1920x1080');assert.equal(service.id,app.id+'.source');assert.equal(SERVICE,'luna://'+service.id);
 assert.match(html,/webOSTV\.js/);assert.match(html,/bundle\.js/);assert.doesNotMatch(html,/type="module"/);
 assert.doesNotMatch(bundle,/\/api\/session|127\.0\.0\.1:19783/);assert.match(bundle,/nativeHLS/);
});
