import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeNoticeFields, validNoticeDate } from '../lib/notice-extraction-quality';
import { extractedMoney, extractedSupply, noticeProgress, retryLabel } from '../lib/notice-extraction-summary';
import type { ExtractedFields, ExtractedRow } from '../lib/solar-extract';
import repairs from './fixtures/notice-information-repairs.json';
const row: ExtractedRow = {houseType:'16형 대학생',area:'16.98',supplyUnits:40,deposit:1230.8,rent:7.692,salePriceManwon:null};
const base = (): ExtractedFields => ({priceModel:'rows-by-area',rows:[{...row},{...row},{...row,houseType:'16형 청년'}],deadline:'2026.10.15',noticeStatus:null,progressStatus:'모집중'});

test('merged reserve quota is represented once while distinct price categories survive',()=>{
 const fields=base();fields.supplyGroups=[{label:'16형 통합',kind:'reserve',count:40,houseTypes:['16형 대학생','16형 청년'],evidence:'16형 통합 예비자 40명'}];
 const result=normalizeNoticeFields(fields,'16형 통합 예비자 40명');
 assert.equal(result.rows.length,2);assert(result.rows.every(r=>r.supplyUnits===null));assert.equal(result.supplyGroups?.length,1);
 assert.equal(extractedSupply(result),'16형 통합: 예비자 40명');assert.equal(fields.rows.length,3);
});
test('unfounded eligibility and overlapping/unlinked groups are rejected',()=>{
 const fields=base();fields.eligibility=[{label:'소득',detail:'제한 없음',evidence:'문서에 없는 문장'}];
 fields.supplyGroups=[{label:'x',kind:'units',count:40,houseTypes:['없는 주택형'],evidence:'금회 모집 40명'}];
 const result=normalizeNoticeFields(fields,'금회 모집 40명');assert.equal(result.supplyGroups?.length,0);assert.equal(result.eligibility?.length,0);assert(result.warnings!.length>=2);
});
test('calendar validation rejects impossible dates and reverse application windows',()=>{
 assert.equal(validNoticeDate('2026.02.30'),null);assert.equal(validNoticeDate('2028-02-29'),'2028.02.29');
 const fields=base();fields.schedule={applyStart:'2026.10.16',applyEnd:'2026.10.15',winnerAt:'2026.11.26'};
 const result=normalizeNoticeFields(fields,'');assert.equal(result.schedule?.applyStart,null);assert.equal(result.schedule?.applyEnd,null);assert.equal(result.progressStatus,null);
 assert.equal(noticeProgress({...base(),schedule:{applyStart:'2026.10.14',applyEnd:'2026.10.15',winnerAt:null}},new Date('2026-10-28T00:00:00Z')),'접수 마감');
});
test('multiple prices retain exact fractional rent, range and zero',()=>{
 const fields=base();fields.rows[2].deposit=1303.2;fields.rows[2].rent=8.145;
 assert.equal(extractedMoney(fields,'rent'),'7.692만원 ~ 8.145만원');
 fields.rows=[{...row,rent:0}];assert.equal(extractedMoney(fields,'rent'),'0원');
 fields.rows=[{...row,salePriceManwon:null,salePriceRange:[48536.3,55131]}];assert.equal(extractedMoney(fields,'salePriceManwon'),'4억 8,536.3만원 ~ 5억 5,131만원');
});
test('deposit increase and decrease do not duplicate base-price rows',()=>{
 const fields=base();fields.conversion={rateDown:6,rateUp:3.5,perHouseType:[{houseType:row.houseType,limitManwon:300,maxDeposit:1530.8,minRent:6.192},{houseType:row.houseType,limitManwon:900,maxDeposit:330.8,minRent:10.317}]};
 const result=normalizeNoticeFields(fields,'');assert.deepEqual(result.conversion?.perHouseType?.map(p=>p.direction),['increase','decrease']);
});
test('elapsed or invalid retry times never promise a future run',()=>{
 assert.equal(retryLabel('2026-10-06T07:35:00Z',Date.parse('2026-10-28')), '예정 시각 경과 · 실행 기록 확인 필요');
 assert.equal(retryLabel('bad'),'예약 기록 없음');
});
test('all repaired snapshots preserve source and current extraction schema',()=>{
 for(const patch of repairs){const saved=JSON.parse(fs.readFileSync('lib/notice-information/'+patch.file,'utf8'));assert.equal(saved.sourceHash,patch.sourceHash);assert.equal(saved.schemaVersion,2);assert(saved.correctedAt);assert.equal(saved.fields.progressStatus,null);}
 const gunsan=repairs.find(r=>r.sourceHash.startsWith('8a2684c7'))!;
 assert.equal(gunsan.fields.rows.length,3);assert.equal(gunsan.fields.supplyGroups?.[0].count,40);assert.equal(gunsan.fields.schedule.applyStart,'2026.10.14');assert.equal(gunsan.fields.eligibility?.length,6);
 const incheon=repairs.find(r=>r.sourceHash.startsWith('acef6681'))!;assert.equal(incheon.fields.rows[0].salePriceManwon,null);assert.deepEqual((incheon.fields.rows[0] as ExtractedRow).salePriceRange,[48536.3,55131]);assert.equal(incheon.fields.supplyGroups?.reduce((n,g)=>n+g.count,0),252);
});
test('tiered conversions keep their data when there is no single base-price row',()=>{
 const fields=base();fields.rows=[];fields.tiers=[{houseType:'26형',area:'26',supplyUnits:10,incomes:[{label:'가군',deposit:1000,rent:10}]}];fields.conversion={rateUp:3.5,rateDown:6,perHouseType:[{houseType:'26형',limitManwon:300,maxDeposit:1300,minRent:8.5}]};
 const result=normalizeNoticeFields(fields,'');assert.equal(result.conversion?.perHouseType?.length,1);assert.equal(result.conversion?.perHouseType?.[0].direction,undefined);
});
test('counts not present in source evidence are not accepted',()=>{
 const fields=base();fields.supplyGroups=[{label:'16형',kind:'reserve',count:400,houseTypes:['16형 대학생'],evidence:'예비자 40명 모집'}];
 assert.equal(normalizeNoticeFields(fields,'예비자 40명 모집').supplyGroups?.length,0);
});
test('rows that become identical after quota normalization are deduplicated',()=>{
 const fields=base();fields.rows[1].supplyUnits=null;
 fields.supplyGroups=[{label:'16형 통합',kind:'reserve',count:40,houseTypes:['16형 대학생','16형 청년'],evidence:'16형 예비자 40명'}];
 assert.equal(normalizeNoticeFields(fields,'16형 예비자 40명').rows.length,2);
});
