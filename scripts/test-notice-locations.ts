import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {getSavedDocuments} from '../lib/saved-documents';
import {readHousingAddresses,readNoticeLocations} from '../lib/notice-locations';
const id='lh-rental-2015122300020842';
const source='https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?panId=2015122300020842&ccrCnntSysDsCd=03&uppAisTpCd=13&aisTpCd=26&mi=1026';
test('official housing workbook retains 23 rows grouped into two actual addresses',async()=>{
 const file=(await getSavedDocuments(source)).find(f=>f.localUrl.endsWith('.xlsx'));assert.ok(file);
 const rows=await readHousingAddresses(await fs.readFile('public'+file.localUrl),file.name,file.localUrl);
 assert.equal(rows.length,2);assert.equal(rows.reduce((n,r)=>n+r.units,0),23);
 assert.ok(rows.every(r=>r.address.startsWith('제주특별자치도 제주시')));
 assert.ok(rows.some(r=>r.address.includes('산천단동3길 8-4')));
 assert.ok(rows.some(r=>r.address.includes('거로길 50')));
 assert.ok(rows.every(r=>r.evidence.includes('!E')));
});
test('saved locations reject mismatched notice source',async()=>{
 assert.equal(await readNoticeLocations(id,'https://wrong.example'),null);
});
test('merged headers and regional metadata do not pollute building addresses',async()=>{
 const index=JSON.parse(await fs.readFile('lib/downloaded-documents.local.json','utf8')) as Record<string,{sourceUrl:string;localUrl:string;name:string}>;
 for(const id of ['2015122300020841','2015122300020797','2015122300020689']){
  const file=Object.values(index).find(f=>f.sourceUrl.includes(id)&&f.localUrl.endsWith('.xlsx'));assert.ok(file);
  const rows=await readHousingAddresses(await fs.readFile('public'+file.localUrl),file.name,file.localUrl);
  assert.ok(rows.length>0,id);assert.ok(rows.every(r=>!r.address.startsWith('매입다가구')),id);
 }
});
