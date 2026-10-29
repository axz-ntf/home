import fs from 'node:fs/promises';
import {LH_ADMIN_LISTINGS} from '../lib/lh-adapter';
import {effectiveStatus} from '../lib/dday';
import {orderDocuments} from './lib/api-first-runner.mjs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { downloadDocument } from './lib/download-material.mjs';
import type { MaterialsStore } from '../lib/notice-materials';
import type { SavedDocument } from '../lib/saved-documents';
const root='public/notice-files',indexFile='lib/downloaded-documents.local.json';
const arg=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
async function main(){
  const limit=Number(arg('--limit')??200),panId=arg('--pan-id');
  if(!Number.isInteger(limit)||limit<1||limit>500)throw new Error('limit must be 1..500');
  const sources:MaterialsStore=JSON.parse(await fs.readFile('lib/notice-materials.json','utf8'));
  let index:Record<string,SavedDocument>={};
  try{index=JSON.parse(await fs.readFile(indexFile,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  await fs.mkdir(root,{recursive:true});
  const activeUrls=new Set(LH_ADMIN_LISTINGS.filter(l=>effectiveStatus(l.status,l.deadline,l.beginDate)!=='closed').map(l=>l.sourceUrl));
  const queue=new Map<string,{name:string;url:string;sourceUrl:string}>();
  for(const record of Object.values(sources.records)){
    if(process.argv.includes('--active-only')&&!activeUrls.has(record.sourceUrl))continue;
    if(!record.materials.length||(panId&&new URL(record.sourceUrl).searchParams.get('panId')!==panId))continue;
    for(const m of record.materials)if((m.kind==='notice'||m.kind==='housing-list'))queue.set(m.url,{...m,sourceUrl:record.sourceUrl});
  }
  let downloaded=0,skipped=0,failed=0;
  let attempted=0;
  for(const m of orderDocuments(queue.values(),index)){
    const previous=index[m.url];
    if(previous?.localUrl && !process.argv.includes('--force') && Date.now()-Date.parse(previous.downloadedAt)<86400000){
      try{const bytes=await fs.readFile(path.join('public',previous.localUrl));if(createHash('sha256').update(bytes).digest('hex')===previous.sha256){skipped++;continue;}}catch{/* redownload missing file */}
    }
    if(attempted++>=limit)break;
    try{
      const result=await downloadDocument(m.url,m.sourceUrl);
      const ext=result.ext==='zip' && /\.hwpx/i.test(m.name)?'hwpx':result.ext==='zip' && /\.xlsx/i.test(m.name)?'xlsx':result.ext;
      const filename=`${result.sha256}.${ext}`;
      await fs.writeFile(path.join(root,filename)+'.tmp',result.buffer);
      await fs.rename(path.join(root,filename)+'.tmp',path.join(root,filename));
      index[m.url]={name:m.name,sourceUrl:m.sourceUrl,originalUrl:m.url,localUrl:`/notice-files/${filename}`,bytes:result.bytes,sha256:result.sha256,downloadedAt:new Date().toISOString()};
      downloaded++;console.log(`저장 완료: ${m.name} (${result.bytes} bytes)`);
    }catch(error){failed++;console.error(`저장 실패: ${m.name} — ${error instanceof Error?error.message:error}`);}
    await fs.writeFile(indexFile+'.tmp',JSON.stringify(index,null,2)+'\n');await fs.rename(indexFile+'.tmp',indexFile);
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  console.log(JSON.stringify({downloaded,skipped,failed,total:queue.size}));
  if(failed)process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
