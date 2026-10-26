import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('Scanning a new QR in the same phone tab replaces its session and cancels the old status poll',async()=>{
 const html=await readFile(new URL('../service/phone.html',import.meta.url),'utf8');
 const script=html.match(/<script>([\s\S]*?)<\/script>/)[1],nodes=new Map(),events={},requests=[],cancelled=[];
 const button={disabled:false},form={querySelector:()=>button};
 const context={location:{hash:'#first-session'},document:{querySelector:s=>{if(!nodes.has(s))nodes.set(s,{});return nodes.get(s);}},window:{addEventListener:(name,fn)=>events[name]=fn},FormData:class{constructor(){return new Map([['name','Local test'],['url','https://example.test/list.m3u']]);}},fetch:async(url,opts)=>{requests.push({url,opts});return {ok:true,json:async()=>({id:'job'})};},setInterval:()=>17,clearInterval:id=>cancelled.push(id),URL,Error,JSON};
 vm.runInNewContext(script,context);
 const submit=()=>nodes.get('#playlist').onsubmit({preventDefault(){},target:form});
 await submit();assert.equal(requests[0].opts.headers['x-tiviloom-pair'],'first-session');
 context.location.hash='#second-session';events.hashchange();assert.ok(cancelled.includes(17));
 await submit();assert.equal(requests[1].opts.headers['x-tiviloom-pair'],'second-session');assert.equal(button.disabled,false);
});