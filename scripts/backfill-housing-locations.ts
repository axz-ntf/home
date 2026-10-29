import fs from 'node:fs/promises';
import path from 'node:path';
import {parseMaterials} from './lib/notice-materials.mjs';
import {downloadDocument} from './lib/download-material.mjs';
import {collectNoticeLocations} from '../lib/notice-locations';
import type {SavedDocument} from '../lib/saved-documents';
import type {MaterialsStore,Material} from '../lib/notice-materials';
async function main(){
 const listings=JSON.parse(await fs.readFile('lib/listings-api.json','utf8')) as {id:string;sourceUrl:string}[];
 const materials:MaterialsStore=JSON.parse(await fs.readFile('lib/notice-materials.json','utf8'));
 const docs:Record<string,SavedDocument>=JSON.parse(await fs.readFile('lib/downloaded-documents.local.json','utf8'));
 const report:{id:string;addresses:number;coordinates:number;reason:string}[]=[];
 await fs.mkdir('.cache/location-backfill',{recursive:true});
 await fs.copyFile('lib/notice-materials.json',`.cache/location-backfill/materials-${Date.now()}.json`);
 let cursor=0;
 async function worker(){for(;;){const l=listings[cursor++];if(!l)break;
 try{
  let record=materials.records[l.sourceUrl];
  if(!process.argv.includes('--saved-only') && (!record || record.status!=='collected')){
   const r=await fetch(l.sourceUrl,{redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error(`공식 원문 HTTP ${r.status}`);
   const html=await r.text();const links=parseMaterials(html,l.sourceUrl) as Material[];
   record={sourceUrl:l.sourceUrl,title:l.id,status:links.length?'collected':'empty',checkedAt:new Date().toISOString(),materials:links};materials.records[l.sourceUrl]=record;
  }
  if(!record)throw new Error('저장된 첨부 기록 없음');
  const sheets=record.materials.filter(m=>m.kind==='housing-list'&&/\.xlsx/i.test(m.name));
  for(const m of sheets){
   const old=docs[m.url];if(old && await fs.stat(path.join('public',old.localUrl)).then(()=>true).catch(()=>false))continue;
   const result=await downloadDocument(m.url,l.sourceUrl);if(result.ext!=='zip')throw new Error('XLSX 형식 불일치');
   const localUrl=`/notice-files/${result.sha256}.xlsx`;await fs.writeFile('public'+localUrl,result.buffer);
   docs[m.url]={name:m.name,sourceUrl:l.sourceUrl,originalUrl:m.url,localUrl,bytes:result.bytes,sha256:result.sha256,downloadedAt:new Date().toISOString()};
  }
  report.push({id:l.id,addresses:0,coordinates:0,reason:sheets.length?'주택목록 확보':record.materials.some(m=>m.kind==='housing-list')?'다른 형식의 주택목록':'XLSX 주택목록 없음'});
 }catch(e){report.push({id:l.id,addresses:0,coordinates:0,reason:e instanceof Error?e.message:'수집 오류'});}
 if(report.length%25===0)console.log(`첨부 확인 ${report.length}/${listings.length}`);
 }}
 await Promise.all([worker(),worker(),worker()]);
 await fs.writeFile('lib/notice-materials.json.tmp',JSON.stringify(materials,null,2));await fs.rename('lib/notice-materials.json.tmp','lib/notice-materials.json');
 await fs.writeFile('lib/downloaded-documents.local.json.tmp',JSON.stringify(docs,null,2));await fs.rename('lib/downloaded-documents.local.json.tmp','lib/downloaded-documents.local.json');
 for(const l of listings){const row=report.find(r=>r.id===l.id)!;if(row.reason!=='주택목록 확보')continue;
 try{const result=await collectNoticeLocations(l.id,l.sourceUrl);if(result){row.addresses=result.locations.length;row.coordinates=result.locations.filter(r=>r.lat!=null&&r.lng!=null).length;row.reason='주택목록 처리 완료';}else row.reason='주소 열 또는 번호 열 해석 필요';}catch(e){row.reason=e instanceof Error?e.message:'추출 오류';}
 console.log(`${l.id}: ${row.addresses}주소 / ${row.coordinates}좌표`);
 }
 await fs.writeFile('.cache/location-backfill/report.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({total:report.length,resolved:report.filter(r=>r.addresses).length,addresses:report.reduce((n,r)=>n+r.addresses,0),coordinates:report.reduce((n,r)=>n+r.coordinates,0)}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
