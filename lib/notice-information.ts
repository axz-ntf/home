import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { ExtractedFields } from './solar-extract';
export type NoticeInformation = { schemaVersion?:number; correctedAt?:string; correctionNote?:string; collectedAt:string; sourceUrl:string; sourceHash:string; sourceLabel:string; fields:ExtractedFields };
const directory=path.join(process.cwd(),'lib/notice-information');
const filename=(id:string)=>path.join(directory,createHash('sha256').update(id).digest('hex')+'.json');
export async function readNoticeInformation(id:string):Promise<NoticeInformation|null>{
 try{return JSON.parse(await fs.readFile(filename(id),'utf8'));}catch{return null;}
}
export async function saveNoticeInformation(id:string,data:NoticeInformation){
 await fs.mkdir(directory,{recursive:true});
 const dest=filename(id);await fs.writeFile(dest+'.tmp',JSON.stringify(data,null,2)+'\n');await fs.rename(dest+'.tmp',dest);
}
