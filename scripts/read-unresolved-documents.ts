import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {downloadDocument} from './lib/download-material.mjs';
import type {SavedDocument} from '../lib/saved-documents';
import type {MaterialsStore} from '../lib/notice-materials';
async function main(){
 const out='.cache/document-address-review';await fs.mkdir(out,{recursive:true});
 const rows=JSON.parse(await fs.readFile('.cache/location-backfill/unresolved.json','utf8')) as {id:string;sourceUrl:string}[];
 await fs.writeFile(out+'/targets.json',JSON.stringify(rows,null,2));
 const materials=JSON.parse(await fs.readFile('lib/notice-materials.json','utf8')) as MaterialsStore;
 const docs=JSON.parse(await fs.readFile('lib/downloaded-documents.local.json','utf8')) as Record<string,SavedDocument>;
 const manifest:object[]=[];
 for(const row of rows){
  const all=materials.records[row.sourceUrl]?.materials??[];
  const selected=all.filter(m=>/\.(pdf|xlsx|xls)$/i.test(m.name)&&!/(평면|동호배치|단지배치|개인정보|신청서식|리플렛|팸플릿)/.test(m.name));
  if(!selected.some(m=>/\.pdf$/i.test(m.name)))selected.push(...all.filter(m=>/\.hwpx$/i.test(m.name)&&m.kind==='notice'));
  for(const [i,m] of selected.entries()){
   try{
    let d=docs[m.url];
    if(!d){
     const r=await downloadDocument(m.url,row.sourceUrl);const ext=/\.(xlsx|hwpx|xls)$/i.exec(m.name)?.[1]??r.ext;
     const localUrl=`/notice-files/${r.sha256}.${ext}`;await fs.writeFile('public'+localUrl,r.buffer);
     d={name:m.name,sourceUrl:row.sourceUrl,originalUrl:m.url,localUrl,bytes:r.bytes,sha256:r.sha256,downloadedAt:new Date().toISOString()};docs[m.url]=d;
     await fs.writeFile('lib/downloaded-documents.local.json.tmp',JSON.stringify(docs,null,2));await fs.rename('lib/downloaded-documents.local.json.tmp','lib/downloaded-documents.local.json');
    }
    const textFile=`${out}/${row.id}-${i}.txt`;
    if(d.localUrl.endsWith('.pdf'))execFileSync('pdftotext',['-layout','public'+d.localUrl,textFile],{timeout:60000,stdio:'pipe'});
    manifest.push({id:row.id,name:m.name,kind:m.kind,localUrl:d.localUrl,textFile,sha256:d.sha256});
   }catch(e){manifest.push({id:row.id,name:m.name,error:e instanceof Error?e.message.slice(0,160):'실패'});}
  }
  console.log(row.id,selected.length+'개 첨부 확인');
 }
 await fs.writeFile(out+'/manifest.json',JSON.stringify(manifest,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
