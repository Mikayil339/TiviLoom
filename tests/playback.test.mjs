import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeHLSSupported,playbackEngine,playbackError,streamKind} from '../src/playback.mjs';
const browser={canPlayType:()=>''},tv={canPlayType:t=>t.includes('mpegurl')?'maybe':''},Hls={isSupported:()=>true};
test('Simulator Luna presence cannot force unsupported native HLS',()=>{
 assert.equal(nativeHLSSupported(browser),false);
 assert.equal(playbackEngine(browser,'https://test/live.m3u8',{native:true,Hls}),'hlsjs');
 assert.equal(playbackEngine(tv,'https://test/live.m3u8',{native:true,Hls}),'native');
 assert.equal(playbackEngine(browser,'https://test/movie.mp4',{native:true,Hls}),'native');
});
test('HLS query endpoints and extensionless native rejection get one MSE path',()=>{
 assert.equal(streamKind('https://test/live?output=m3u8'),'hls');
 assert.equal(streamKind('https://test/play?format=hls'),'hls');
 assert.equal(playbackEngine(browser,'https://test/live?id=1',{native:true,Hls,forceHls:true}),'hlsjs');
 assert.equal(playbackEngine(browser,'https://test/live.ts',{native:true,Hls,forceHls:true}),'native');
 assert.equal(playbackEngine(browser,'https://test/video.mp4',{native:true,Hls,forceHls:true}),'native');
 assert.equal(playbackEngine(browser,'https://test/a.m3u8',{native:true,Hls:{isSupported:()=>false}}),'native');
});
test('Playback failures distinguish source refusal, network and codec without exposing URLs',()=>{
 const url='https://test/live/PRIVATE_USER/PRIVATE_PASS/1.ts?token=SECRET';
 assert.match(playbackError(null,{url,hls:{response:{code:403}}}),/403/);
 assert.match(playbackError(null,{url,hls:{type:'networkError'}}),/CORS/);
 assert.match(playbackError({code:4},{url}),/TS/);
 assert.match(playbackError({code:3},{url:'https://test/a.m3u8'}),/kodeki/);
 assert.match(playbackError({name:'NotAllowedError'},{url}),/OK/);
 for(const error of [{code:2},{code:3},{code:4}])assert.doesNotMatch(playbackError(error,{url}),/PRIVATE|SECRET|https/);
});
