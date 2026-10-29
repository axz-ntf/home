import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runStages,orderDocuments} from './lib/api-first-runner.mjs';
test('API failure stops dependent stages and persists failure status',async()=>{
 const called=[],states=[];
 await assert.rejects(runStages([['api','API',['api']],['parse','Parse',['parse']]],async a=>{called.push(a[0]);return 1;},async(label,rows)=>states.push(structuredClone(rows))),/API 실패/);
 assert.deepEqual(called,['api']);assert.equal(states.at(-1)[0].status,'failed');
});
test('successful stages run sequentially and record all results',async()=>{
 const called=[];const r=await runStages([['api','API',['api']],['files','Files',['files']]],async a=>{called.push(a[0]);return 0;},async()=>{});
 assert.deepEqual(called,['api','files']);assert.equal(r.filter(r=>r.status==='completed').length,2);
});
test('new and older files precede fresh cached entries under a batch limit',()=>{
 const items=[{url:'fresh'},{url:'old'},{url:'new'}];
 const sorted=orderDocuments(items,{fresh:{downloadedAt:'2026-10-28'},old:{downloadedAt:'2026-10-01'}});
 assert.deepEqual(sorted.map(x=>x.url),['new','old','fresh']);assert.equal(items[0].url,'fresh');
});

test('scheduled data pipeline uses all three official sources and never invokes AI extraction',async()=>{
 const {spawnSync}=await import('node:child_process');
 const result=spawnSync(process.execPath,['scripts/sync-api-first.mjs','--data-only','--dry-run'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const stages=JSON.parse(result.stdout).stages.map(x=>x.id);
 assert.ok(stages.includes('housing-api'));assert.ok(stages.includes('sh'));assert.ok(stages.includes('youth'));
 assert.ok(!stages.includes('information'));assert.ok(!stages.includes('materials'));
});
