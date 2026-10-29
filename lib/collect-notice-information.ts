import { collectNoticeLocations } from './notice-locations';
import { EXTRACTION_VERSION } from './notice-extraction-quality';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Listing } from './types';
import { getSavedDocuments } from './saved-documents';
import { parseUploadedPdf, resolveMarkdown } from './notice-markdown';
import { extractFromMarkdown } from './solar-extract';
import { saveNoticeInformation, readNoticeInformation } from './notice-information';
export async function collectNoticeInformation(listing:Listing,force=false){
 if(!listing.sourceUrl)throw new Error('공식 공고 출처가 없어 원문을 선택할 수 없습니다.');
 const files=await getSavedDocuments(listing.sourceUrl);
 const pdf=files.find(f=>f.localUrl.endsWith('.pdf') && /공고문/.test(f.name)) ?? files.find(f=>f.localUrl.endsWith('.pdf'));
 const previous=await readNoticeInformation(listing.id);
 const key=createHash('sha256').update(listing.id).digest('hex');
 const dir=path.join(process.cwd(),'.cache/information-locks');await fs.mkdir(dir,{recursive:true});
 const lock=path.join(dir,key);
 try{const stat=await fs.stat(lock);if(Date.now()-stat.mtimeMs>600000)await fs.unlink(lock);}catch{/* no lock */}
 let handle;
 try{handle=await fs.open(lock,'wx');}catch{throw new Error('이미 이 공고를 자동 수집하고 있습니다.');}
 try{
  await collectNoticeLocations(listing.id,listing.sourceUrl);
 if(!force && pdf && previous && previous.sourceUrl===listing.sourceUrl && previous.sourceHash===pdf.sha256 && previous.schemaVersion===EXTRACTION_VERSION)return {skipped:true,collectedAt:previous.collectedAt};
  let markdown:string,sourceLabel:string,sourceHash:string;
  if(pdf){
   const bytes=await fs.readFile(path.join(process.cwd(),'public',pdf.localUrl));
   sourceHash=createHash('sha256').update(bytes).digest('hex');
   if(sourceHash!==pdf.sha256)throw new Error('저장된 원문 파일이 변경되었습니다. 다시 다운로드해 주세요.');
   markdown=await parseUploadedPdf(bytes,pdf.name);sourceLabel=pdf.name;
  }else{
   const result=await resolveMarkdown(listing.id,listing.sourceUrl??null,true);
   markdown=result.markdown;sourceLabel='공식 공고문';sourceHash=createHash('sha256').update(markdown).digest('hex');
  }
  if(!markdown.trim())throw new Error('공고문에서 읽을 수 있는 내용을 찾지 못했습니다.');
  const fields=await extractFromMarkdown(markdown,{type:listing.type,isSale:listing.type==='sale',fullDocument:true});
  if(!fields.rows.length&&!fields.tiers?.length&&!fields.householdTypes?.length&&!fields.supportLimit?.byHousehold?.length&&!fields.deadline&&!fields.schedule?.applyStart&&!fields.schedule?.winnerAt&&!fields.eligibility?.length)throw new Error('원문에서 구조화할 정보를 찾지 못했습니다. 기존 결과는 유지됩니다.');
  const collectedAt=new Date().toISOString();
  await saveNoticeInformation(listing.id,{schemaVersion:EXTRACTION_VERSION,collectedAt,sourceUrl:listing.sourceUrl??'',sourceHash,sourceLabel,fields});
  return {skipped:false,collectedAt};
 }finally{await handle.close();await fs.unlink(lock).catch(()=>{});}
}
