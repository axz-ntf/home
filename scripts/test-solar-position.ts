import {test} from 'node:test';import assert from 'node:assert/strict';
import {solarPosition,shadowOffset} from '../lib/building-models/solar';
const lat=37.1818,lon=127.1114;
test('Korea solar direction crosses south and elevations change with seasons',()=>{
 const morning=solarPosition('2026-03-20',540,lat,lon)!,noon=solarPosition('2026-03-20',720,lat,lon)!,afternoon=solarPosition('2026-03-20',900,lat,lon)!;
 assert.ok(morning.azimuth<180&&afternoon.azimuth>180);assert.ok(noon.elevation>morning.elevation&&noon.elevation>afternoon.elevation);
 assert.ok(solarPosition('2026-06-21',720,lat,lon)!.elevation>solarPosition('2026-12-21',720,lat,lon)!.elevation);
 assert.ok(solarPosition('2026-10-28',0,lat,lon)!.elevation<0);
});
test('shadow points away from the sun, grows at low altitude, and is bounded',()=>{
 const a=shadowOffset(60,90,45)!,b=shadowOffset(60,90,10)!;assert.ok(Math.abs(a.east+60)<1e-8);assert.ok(Math.abs(a.north)<1e-8);assert.ok(b.east<a.east);assert.equal(shadowOffset(60,90,-1),null);assert.equal(shadowOffset(60,90,1)!.truncated,true);
});
test('invalid date and time are rejected',()=>{assert.equal(solarPosition('2026-02-30',720,lat,lon),null);assert.equal(solarPosition('2026-01-01',1440,lat,lon),null);});
