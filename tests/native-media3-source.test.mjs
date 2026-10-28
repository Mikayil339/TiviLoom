import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
test('Android Gradle project declares Media3 ExoPlayer, HLS and UI modules',()=>{
 const g=read('../android/app/build.gradle');
 for(const dep of ['media3-exoplayer:1.5.1','media3-exoplayer-hls:1.5.1','media3-ui:1.5.1']) assert.ok(g.includes(dep),dep);
 const pkg=JSON.parse(read('../package.json'));
 assert.ok(g.includes("versionName '0.6.12'"));
});
test('native player accepts provider headers and has bounded startup buffering',()=>{
 const j=read('../android/app/src/main/java/com/tiviloom/mobile/NativePlayerHost.java');
 assert.match(j,/setDefaultRequestProperties\(headers\)/);
 assert.match(j,/setBufferDurationsMs\(1500,15000,500,1500\)/);
 assert.match(j,/onRenderedFirstFrame/);
 assert.match(j,/onPlayerError/);
});
test('Android preview and fullscreen share the embedded native host',()=>{
 const js=read('../src/app.mjs');assert.match(js,/openNativePlayer && !c\.demo/);
 const java=read('../android/app/src/main/java/com/tiviloom/mobile/MainActivity.java');assert.match(java,/new NativePlayerHost/);assert.doesNotMatch(java,/NativePlaybackActivity\.class/);
});
