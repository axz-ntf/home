import 'server-only';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
export type BuildingRegisterCandidate={name:string;height:number;floors:number};
export type BuildingRegisterResult={id:string;inputAddress?:string;status:'geometry_unavailable'|'register_unavailable'|'address_unconfirmed'|'request_failed';reason:string;officialAddress?:string;updatedAt:string;sourceUrl:string;buildings:BuildingRegisterCandidate[]};
export async function readBuildingRegisterCandidate(id:string):Promise<BuildingRegisterResult|null>{
 try{const hash=createHash('sha256').update(id).digest('hex');const file=path.join(process.cwd(),'lib/building-register-local',`${hash}.json`);const data=JSON.parse(await readFile(file,'utf8')) as BuildingRegisterResult;if(data.id!==id||!Array.isArray(data.buildings))return null;return data;}catch{return null;}
}

/** Share results only for the exact address used during collection. */
export async function readBuildingRegisterAddress(address:string):Promise<BuildingRegisterResult|null>{
 const clean=address.replace(/\s*\([^)]*\)\s*$/,'').trim();
 if(!clean)return null;
 const id=clean.replace(/\s+/g,'');
 try{const hash=createHash('sha256').update(id).digest('hex');const file=path.join(process.cwd(),'lib/building-register-local',`address-${hash}.json`);const data=JSON.parse(await readFile(file,'utf8')) as BuildingRegisterResult;
 if(data.id!==id||data.inputAddress?.replace(/\s+/g,'')!==id||!Array.isArray(data.buildings))return null;return data;
 }catch{return null;}
}

export async function readAddressBuildingModel(address:string):Promise<import('./types').BuildingModel|null>{
 const clean=address.replace(/\s*\([^)]*\)\s*$/,'').replace(/\s+/g,'');
 if(!clean)return null;
 try{
  const hash=createHash('sha256').update(clean).digest('hex');
  const data=JSON.parse(await readFile(path.join(process.cwd(),'lib/building-register-local',`model-${hash}.json`),'utf8')) as import('./types').BuildingModel;
  if(data.id!==hash||data.address.replace(/\s*\([^)]*\)\s*$/,'').replace(/\s+/g,'')!==clean||!Array.isArray(data.buildings)||!data.buildings.length)return null;
  const queue=JSON.parse(await readFile(path.join(process.cwd(),'lib/building-register-local/queue.json'),'utf8')) as {address:string;points:{lat:number;lng:number}[]}[];
  const entry=queue.find(item=>item.address.replace(/\s+/g,'')===clean);
  if(!entry||entry.points?.length!==1||entry.points[0].lng!==data.center[0]||entry.points[0].lat!==data.center[1])return null;
  const register=await readBuildingRegisterAddress(address);
  if(register?.status!=='geometry_unavailable'||data.buildings.some(b=>!register.buildings.some(r=>r.name===b.name&&r.height===b.height&&r.floors===b.floors)||!Array.isArray(b.ring)||b.ring.length<4))return null;
  return data;
 }catch{return null;}
}
