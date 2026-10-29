import {test} from 'node:test';
import assert from 'node:assert/strict';
test('full document reaches extractor and fractional rent survives normalization',async()=>{
 const oldKey=process.env.SOLAR_API_KEY;process.env.SOLAR_API_KEY='test-only';
 const oldFetch=globalThis.fetch;
 try{
  const {extractFromMarkdown}=await import('../lib/solar-extract');
  let payload='';
  globalThis.fetch=async(_input,init)=>{payload=String(init?.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({rows:[{houseType:'16A',deposit:1234.56,rent:12.345}],deadline:'2026.10.15'})}}]}),{status:200});};
  const result=await extractFromMarkdown('모집공고 보증금\n'+'가'.repeat(30000)+'마지막 접수 일정',{type:'happy',fullDocument:true});
  assert.equal(result.rows[0].rent,12.345);assert.equal(result.rows[0].deposit,1234.56);
  assert.ok(payload.includes('마지막 접수 일정'));
 }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.SOLAR_API_KEY;else process.env.SOLAR_API_KEY=oldKey;}
});
test('new schema carries dates, evidence and shared quota through model response parsing',async()=>{
 const oldKey=process.env.SOLAR_API_KEY;process.env.SOLAR_API_KEY='test-only';
 const oldFetch=globalThis.fetch;
 try{
  const {extractFromMarkdown}=await import('../lib/solar-extract');
  globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({rows:[{houseType:'16형 대학생',deposit:1230.8,rent:7.692,supplyUnits:40},{houseType:'16형 대학생',deposit:1230.8,rent:7.692,supplyUnits:40},{houseType:'16형 청년',deposit:1303.2,rent:8.145,supplyUnits:40}],supplyGroups:[{label:'16형 통합',kind:'reserve',count:40,houseTypes:['16형 대학생','16형 청년'],evidence:'16형 예비자 40명 통합 모집'}],eligibility:[{label:'소득',detail:'소득요건 배제',evidence:'소득요건 배제'}],schedule:{applyStart:'2026.10.14',applyEnd:'2026.10.15',docResultAt:'2026.10.20',winnerAt:'2026.11.26'}})}}]}));
  const fields=await extractFromMarkdown('16형 예비자 40명 통합 모집\n소득요건 배제',{type:'happy',fullDocument:true});
  assert.equal(fields.rows.length,2);assert(fields.rows.every(r=>r.supplyUnits===null));assert.equal(fields.supplyGroups?.[0].count,40);assert.equal(fields.schedule?.docResultAt,'2026.10.20');assert.equal(fields.eligibility?.length,1);
 }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.SOLAR_API_KEY;else process.env.SOLAR_API_KEY=oldKey;}
});
