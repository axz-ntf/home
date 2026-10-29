import fs from 'node:fs/promises';
import path from 'node:path';
import {hasDb,sql} from './db';
export type SavedDocument={name:string;sourceUrl:string;originalUrl:string;localUrl:string;bytes:number;sha256:string;downloadedAt:string};
export async function getSavedDocuments(sourceUrl?:string):Promise<SavedDocument[]>{
  let records:Record<string,SavedDocument>;
  try{records=JSON.parse(await fs.readFile(path.join(process.cwd(),'lib/downloaded-documents.local.json'),'utf8'));}catch{records={};}
  if(process.env.NODE_ENV==='production' && hasDb){
    try{const rows=await sql`select original_url,source_url,name,object_name,bytes,sha256,downloaded_at from public.housing_notice_documents where (${sourceUrl??''}='' or source_url=${sourceUrl??''})`;return rows.map(r=>({name:r.name,sourceUrl:r.source_url,originalUrl:r.original_url,localUrl:`/notice-files/${r.object_name}`,bytes:Number(r.bytes),sha256:r.sha256,downloadedAt:new Date(r.downloaded_at).toISOString()}));}catch{return [];}
  }
  const candidates=Object.values(records).filter(r=>(!sourceUrl||r.sourceUrl===sourceUrl)&&/^\/notice-files\/[a-f0-9]{64}\.(pdf|hwp|hwpx|zip|xlsx|xls)$/.test(r.localUrl));
  const checked=await Promise.all(candidates.map(async r=>{
    try{const stat=await fs.stat(path.join(process.cwd(),'public',r.localUrl));return stat.isFile()&&stat.size===r.bytes?r:null;}catch{return null;}
  }));
  return checked.filter((r):r is SavedDocument=>!!r);
}
