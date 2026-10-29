import{test}from'node:test';import assert from'node:assert/strict';
import{GET as map}from'../app/api/admin/building-map/route';
import{GET as config}from'../app/api/admin/building-map/config/route';
test('map requires a key and emits escaped isolated SDK initialization',async(t)=>{
 const a=process.env.VWORLD_API_KEY,b=process.env.VWORLD_WEBGL_KEY;t.after(()=>{if(a===undefined)delete process.env.VWORLD_API_KEY;else process.env.VWORLD_API_KEY=a;if(b===undefined)delete process.env.VWORLD_WEBGL_KEY;else process.env.VWORLD_WEBGL_KEY=b;});delete process.env.VWORLD_API_KEY;delete process.env.VWORLD_WEBGL_KEY;
 assert.equal((await map()).status,503);process.env.VWORLD_API_KEY='fallback';process.env.VWORLD_WEBGL_KEY=' ';assert.equal((await map()).status,200);process.env.VWORLD_WEBGL_KEY='test-"<key';const r=await map();const text=await r.text();assert.equal(r.status,200);assert.ok(!text.includes('test-"<key'));assert.match(text,/vmap.start\(\)/);assert.match(text,/127\.1114,37\.1818/);assert.equal(r.headers.get('cache-control'),'private, no-store');
});
test('configuration relay requests only the fixed official resource',async(t)=>{
 t.mock.method(globalThis,'fetch',async(url:string|URL|Request)=>{assert.equal(url,'https://map.vworld.kr/dtkmap/vworldJson.do?device=pc&output=json');return Response.json({terrain:{}});});assert.equal((await config()).status,200);
});
test('configuration relay reports malformed or failed upstream responses',async(t)=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json({error:'unavailable'}));assert.equal((await config()).status,502);
});
