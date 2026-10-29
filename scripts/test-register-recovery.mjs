import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const script=path.resolve('scripts/collect-building-register-addresses.mjs');
test('refresh retains known buildings and stops after three failed API calls',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'housing-retry-'));try{
  await mkdir(path.join(dir,'lib/building-register-local'),{recursive:true});
  const entries=Array.from({length:5},(_,i)=>({address:`서울특별시 강남구 테스트로 ${i+1}`}));
  await writeFile(path.join(dir,'lib/building-register-local/queue.json'),JSON.stringify(entries));
  for(const entry of entries){const id=entry.address.replace(/\s+/g,''),hash=createHash('sha256').update(id).digest('hex');await writeFile(path.join(dir,`lib/building-register-local/address-${hash}.json`),JSON.stringify({id,status:'geometry_unavailable',buildings:[{name:'101동',height:30,floors:10}]}));}
  const mock=path.join(dir,'mock.mjs');await writeFile(mock,"globalThis.fetch=async()=>new Response('',{status:503});");
  const result=spawnSync(process.execPath,['--import',mock,script,'--refresh','--limit=5'],{cwd:dir,env:{...process.env,JUSO_API_KEY:'test',BLDG_HUB_API_KEY:'test'},encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stdout,/3건 확인/);assert.match(result.stderr,/연속 요청 실패/);
  for(const entry of entries){const hash=createHash('sha256').update(entry.address.replace(/\s+/g,'')).digest('hex');const data=JSON.parse(await readFile(path.join(dir,`lib/building-register-local/address-${hash}.json`),'utf8'));assert.equal(data.buildings[0].height,30);}
 }finally{await rm(dir,{recursive:true,force:true});}
});
