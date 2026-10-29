import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCatalog,queryCatalog} from '../lib/housing-catalog';
import {withCatalogLocations} from '../lib/catalog-location-overlay';
test('saved addresses are searchable and raw API objects remain unchanged',async()=>{
 const raw={id:'lh-rental-2015122300020842',title:'제주 공고',address:'',sourceUrl:'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?panId=2015122300020842&ccrCnntSysDsCd=03&uppAisTpCd=13&aisTpCd=26&mi=1026'};
 const records=normalizeCatalog('lh-listings',[raw]);const enriched=await withCatalogLocations(records);
 assert.equal(queryCatalog(enriched,{q:'산천단동3길 8-4'},{},'lh-listings').total,1);
 assert.equal(records[0].address,'');assert.equal(raw.address,'');assert.ok(!enriched[0].issues.includes('주소 미수집'));
});

test('undisclosed addresses are distinguished from failed collection',async()=>{
 const fs=await import('node:fs/promises');
 const listings=JSON.parse(await fs.readFile('lib/listings-api.json','utf8'));
 const raw=listings.find((l:{id:string})=>l.id==='lh-rental-2015122300020770');
 const enriched=await withCatalogLocations(normalizeCatalog('lh-listings',[raw]));
 assert.ok(enriched[0].issues.includes('공고문 상세주소 미공개'));
 assert.ok(!enriched[0].issues.includes('주소 미수집'));
 assert.ok(!enriched[0].issues.includes('좌표 미수집'));
});
