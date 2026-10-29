import fs from 'node:fs/promises';
import path from 'node:path';
import { LH_ADMIN_LISTINGS } from '@/lib/lh-adapter';
import { effectiveStatus } from '@/lib/dday';
import { getSavedDocuments } from '@/lib/saved-documents';
import { readNoticeInformation } from '@/lib/notice-information';
import { usableAuto, type AutoStore } from '@/lib/auto-prices';
import pricesRaw from '@/lib/auto-prices.json';
import materialsRaw from '@/lib/notice-materials.json';
import type { MaterialsStore } from '@/lib/notice-materials';

export type AutomationRow = {
  id:string;title:string;agency:string;district:string;date:string;sourceUrl:string;
  fileCount:number;extractedAt:string|null;
  priceState:'published'|'deferred'|'retry'|'expired'|'waiting'; reason:string;checkedAt:string|null;
};
export type AutomationData = {
  pipeline:{status:string;stage:string;startedAt:string;finishedAt:string|null}|null;
  rows:AutomationRow[];
  files:{name:string;url:string;bytes:number;at:string;title:string;agency:string;type:string}[];
  worker:{active:boolean;processing:boolean;at:string|null};
  lastMaterialsRun:string|null;lastPriceRun:string|null;
};
export async function getAutomationData():Promise<AutomationData>{
  const prices=pricesRaw as AutoStore, materials=materialsRaw as MaterialsStore;
  const all=LH_ADMIN_LISTINGS.filter(l=>effectiveStatus(l.status,l.deadline,l.beginDate)!=='closed');
  const files=await getSavedDocuments();
  const fileCounts=new Map<string,number>();for(const f of files)fileCounts.set(f.sourceUrl,(fileCounts.get(f.sourceUrl)??0)+1);
  const rows=await Promise.all(all.map(async l=>{
    const info=await readNoticeInformation(l.id);
    const storedPrice=prices.records[l.id];
    const price=storedPrice?.sourceUrl===l.sourceUrl?storedPrice:undefined;
    const extractedAt=info?.sourceUrl===l.sourceUrl?info?.collectedAt??null:null;
    const fileCount=fileCounts.get(l.sourceUrl??'')??0;
    return {id:l.id,title:l.title,agency:l.agency,district:l.district,date:l.announceDate??'',sourceUrl:l.sourceUrl??'',fileCount,extractedAt,
      priceState:price?.status==='published'?(usableAuto(price,l.sourceUrl)?'published':'expired'):price?.status??'waiting',reason:price?.reason??'처리 기록 없음',checkedAt:price?.checkedAt??null,

    } as AutomationRow;
  }));
  let worker={active:false,processing:false,at:null as string|null};
  try{const h=JSON.parse(await fs.readFile(path.join(process.cwd(),'.cache/information-worker.json'),'utf8'));const age=Date.now()-Date.parse(h.at);worker={active:age>=0&&age<45000,processing:h.state==='processing',at:h.at};}catch{/* no local worker */}
  let pipeline:AutomationData['pipeline']=null;
  try{pipeline=JSON.parse(await fs.readFile(path.join(process.cwd(),'.cache/api-first-status.json'),'utf8'));}catch{/* no execution yet */}
  const titleByUrl=new Map(LH_ADMIN_LISTINGS.map(r=>[r.sourceUrl,r]));
  return {pipeline,rows,files:files.map(f=>({name:f.name,url:f.localUrl,bytes:f.bytes,at:f.downloadedAt,title:titleByUrl.get(f.sourceUrl)?.title??f.name,agency:titleByUrl.get(f.sourceUrl)?.agency??'공식 원문',type:f.localUrl.split('.').pop()?.toUpperCase()??'FILE'})),worker,lastMaterialsRun:materials.lastRun,lastPriceRun:prices.lastRun};
}
