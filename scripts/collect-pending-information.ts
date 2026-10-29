import { collectNoticeLocations, readNoticeLocations } from '../lib/notice-locations';
import { EXTRACTION_VERSION } from '../lib/notice-extraction-quality';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {LH_ADMIN_LISTINGS} from '../lib/lh-adapter';
import {effectiveStatus} from '../lib/dday';
import {getSavedDocuments} from '../lib/saved-documents';
import {readNoticeInformation} from '../lib/notice-information';
import {collectNoticeInformation} from '../lib/collect-notice-information';
const dir='lib/information-retries';
async function main(){
 const i=process.argv.indexOf('--limit'),limit=i<0?15:Number(process.argv[i+1]);
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('limit must be 1..100');
 const dry=process.argv.includes('--dry-run');

 const files=await getSavedDocuments();
 const pdfs=new Map<string,(typeof files)[number]>();for(const f of files)if(f.localUrl.endsWith('.pdf')&&(!pdfs.has(f.sourceUrl)||/공고문/.test(f.name)))pdfs.set(f.sourceUrl,f);
 let pending=0,completed=0,failed=0;const seen=new Set<string>();
 await fs.mkdir(dir,{recursive:true});
 for(const listing of LH_ADMIN_LISTINGS){
  if(!listing.sourceUrl||seen.has(listing.sourceUrl)||effectiveStatus(listing.status,listing.deadline,listing.beginDate)==='closed')continue;
  if(!dry)await collectNoticeLocations(listing.id,listing.sourceUrl);
  const pdf=pdfs.get(listing.sourceUrl);if(!pdf)continue;seen.add(listing.sourceUrl);
  const previous=await readNoticeInformation(listing.id);
  const housingFiles=files.filter(f=>f.sourceUrl===listing.sourceUrl&&f.localUrl.endsWith('.xlsx')&&/주택목록|주택보유목록|주택내역|공급대상|공급목록/.test(f.name.replace(/[_\s]/g,"")));
  const locations=housingFiles.length?await readNoticeLocations(listing.id,listing.sourceUrl):null;
  const locationsCurrent=!housingFiles.length || (locations?.locations.length && (locations.locations.every(l=>l.lat!=null&&l.lng!=null) || Date.now()-Date.parse(locations.collectedAt)<86400000) && JSON.stringify(locations.sourceHashes)===JSON.stringify(housingFiles.map(f=>f.sha256).sort()));
  if(previous?.sourceUrl===listing.sourceUrl&&previous.sourceHash===pdf.sha256 && previous.schemaVersion===EXTRACTION_VERSION && locationsCurrent)continue;
  const retryFile=path.join(dir,createHash('sha256').update(listing.id).digest('hex')+'.json');
  let retry:{attempts:number;nextAt:string;hash:string}|null=null;
  try{retry=JSON.parse(await fs.readFile(retryFile,'utf8'));}catch{/* first attempt */}
  if(retry?.hash===pdf.sha256&&Date.parse(retry.nextAt)>Date.now())continue;
  if(pending++>=limit)break;
  if(dry)continue;
  if(!process.env.SOLAR_API_KEY?.trim()){console.log('AI 추출 대기: SOLAR_API_KEY 미설정 (주소 수집은 유지)');continue;}
  try{await collectNoticeInformation(listing);await fs.unlink(retryFile).catch(()=>{});completed++;console.log(`자동 추출 완료: ${listing.title}`);}
  catch(error){
   failed++;const attempts=retry?.hash===pdf.sha256?retry.attempts+1:1;
   const state={attempts,hash:pdf.sha256,nextAt:new Date(Date.now()+Math.min(24,2**Math.min(attempts-1,5))*3600000).toISOString(),error:error instanceof Error?error.message:'추출 실패'};
   await fs.writeFile(retryFile+'.tmp',JSON.stringify(state,null,2));await fs.rename(retryFile+'.tmp',retryFile);
   console.error(`자동 추출 재시도 예약: ${listing.title} — ${state.error}`);
  }
 }
 console.log(JSON.stringify({mode:dry?'dry-run':'auto',selected:Math.min(pending,limit),completed,failed}));
 if(failed)process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
