import test from 'node:test';
import assert from 'node:assert/strict';
import {parseM3U} from '../src/core.mjs';
import {parseEpisode,seriesCatalog,resumeOffset,nextEpisode} from '../src/media-library.mjs';
test('M3U series grouped into seasons and episodes',()=>{
 const m='#EXTM3U\n#EXTINF:-1 group-title="Series" tvg-logo="https://example.org/art.jpg",Example S01E02\nhttps://example.org/2.mp4\n#EXTINF:-1 group-title="Series",Example S01E01\nhttps://example.org/1.mp4';
 const channels=parseM3U(m).channels;assert.equal(channels.length,2);assert.equal(channels[0].type,'series');const groups=seriesCatalog(channels);assert.equal(groups.length,1);assert.deepEqual(groups[0].episodes.map(x=>x.episode),[1,2]);assert.equal(nextEpisode(groups[0].episodes,groups[0].episodes[0].id).episode,2);
});
test('only resume meaningful saved VOD positions',()=>{assert.equal(resumeOffset(50,300),50);assert.equal(resumeOffset(298,300),0);assert.equal(resumeOffset(3,300),0)});
test('no identified episode remains safe',()=>{assert.equal(parseEpisode('Untitled').identified,false)});
