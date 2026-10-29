import {test} from 'node:test';import assert from 'node:assert/strict';
import model from '../public/building-models/dongtan-a40.json';
import{localPoint}from'../lib/building-models/types';
test('eight matched apartment footprints retain closed geographic rings and source attribution',()=>{
 assert.deepEqual(model.buildings.map(b=>b.name),Array.from({length:8},(_,i)=>`${1841+i}동`));
 for(const b of model.buildings){assert.deepEqual(b.ring[0],b.ring.at(-1));assert.ok(b.ring.length>=4);assert.match(b.sourceUrl,/^https:\/\/www.openstreetmap.org\/way\/\d+$/);assert.ok(b.height>0);assert.match(b.heightSource,/건축물대장/);assert.ok(Number.isInteger(b.floors));for(const p of b.ring){const [x,n]=localPoint(p,model.center);assert.ok(Math.abs(x)<300&&Math.abs(n)<300);}}
 assert.equal(model.license,'ODbL 1.0');
});
test('projection keeps east and north orientation and converts degrees to metres',()=>{
 assert.deepEqual(localPoint([127,37],[127,37]),[0,0]);
 const [e,n]=localPoint([127.001,37.001],[127,37]);assert.ok(e>88&&e<90);assert.ok(n>111&&n<112);
});

test('reconstructed roof cores stay within every actual building footprint',async()=>{
 const {roofCores,insideRing}=await import('../lib/building-models/exterior');
 for(const building of model.buildings){
  const ring=building.ring.slice(0,-1).map(p=>localPoint(p,model.center));
  const cores=roofCores(ring);assert.ok(cores.length>0,building.name);
  for(const core of cores){
   const c=Math.cos(core.angle),s=Math.sin(core.angle);
   for(const [u,v] of [[-3,-2.5],[3,-2.5],[3,2.5],[-3,2.5]])assert.ok(insideRing(core.x+u*c-v*s,core.y+u*s+v*c,ring),building.name);
  }
 }
});

test('polygon centre is independent of winding and repeated closing point',async()=>{
 const {buildingCenter,geographicBuildingCenter}=await import('../lib/building-models/types');
 const center=[127,37],ring=[[127,37],[127.001,37],[127.001,37.002],[127,37.002],[127,37]];
 const [lng,lat]=geographicBuildingCenter(ring,center);assert.ok(Math.abs(lng-127.0005)<1e-9);assert.ok(Math.abs(lat-37.001)<1e-9);
 const forward=buildingCenter(ring,center),backward=buildingCenter([...ring].reverse(),center);
 assert.ok(Math.abs(forward[0]-backward[0])<1e-8);assert.ok(Math.abs(forward[1]-backward[1])<1e-8);
});


test('building register retains the observed OSM discrepancy for 1846',()=>{
 const b=model.buildings.find(x=>x.name==='1846동')!;assert.equal(b.floors,20);assert.equal(b.osmFloors,17);assert.equal(b.height,62.05);
});
