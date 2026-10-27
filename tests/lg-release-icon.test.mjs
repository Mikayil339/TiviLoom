import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('webOS new icon files keep approved artwork at 80, 130 and 400 pixels',()=>{
 const app=JSON.parse(readFileSync(new URL('../app/appinfo.json',import.meta.url)));
 for(const [key,width] of [['icon',80],['largeIcon',130],['storeIcon',400]]){
  assert.ok(app[key]?.includes(app.version),key+' should be versioned for launcher cache refresh');
  const image=readFileSync(new URL('../app/'+app[key],import.meta.url));
  assert.equal(image.readUInt32BE(16),width);
  assert.equal(image.readUInt32BE(20),width);
 }
});
