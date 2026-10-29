import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseOfficialNotice,reconcileMissingNotices} from './lib/lh-notice-reconciliation.mjs';
const notice={id:'lh-sale-123',pblancId:'123',title:'[정정공고] 테스트 아파트',status:'upcoming',deadline:'2026.12.31',sourceUrl:'https://apply.lh.or.kr/lhapply/test?panId=123'};
const html='<h1>[정정공고] 테스트 아파트</h1><ul class="bbsV_data"><li>유의사항</li></ul><ul class="bbsV_data"><li><strong>공고상태</strong><span>접수마감</span></li><li><strong>마감일</strong>2026.09.10</li></ul>';
test('official notice status selects the status block, not the warning block',()=>{
 assert.deepEqual(parseOfficialNotice(html,notice),{officialStatus:'접수마감',status:'closed',deadline:'2026.09.10'});
});
test('preserves verified notices missing from the API and updates their official status',async()=>{
 const r=await reconcileMissingNotices([],[notice],{delay:0,now:Date.parse('2026-10-29T00:00:00Z'),fetcher:async()=>new Response(html)});
 assert.equal(r.recovered,1);assert.equal(r.listings[0].status,'closed');assert.equal(r.listings[0].deadline,'2026.09.10');assert.equal(r.listings[0].officialNoticeStatus,'접수마감');
});
test('failed official validation prevents the new snapshot from silently dropping data',async()=>{
 await assert.rejects(reconcileMissingNotices([],[notice],{delay:0,fetcher:async()=>new Response('upstream error',{status:503})}),/기존 데이터 보존/);
});
test('does not recheck verified closed history or duplicate API records',async()=>{
 const past={...notice,status:'closed',officialNoticeStatus:'접수마감',officialStatusCheckedAt:'2026-01-01T00:00:00Z',collectionMethod:'official-detail-reconciliation'};
 const fetcher=async()=>{throw Error('unexpected fetch')};
 assert.equal((await reconcileMissingNotices([],[past],{delay:0,fetcher})).listings.length,1);
 assert.equal((await reconcileMissingNotices([notice],[past],{delay:0,fetcher})).listings.length,1);
});
