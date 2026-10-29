import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchRoadAddress,addressSearchKeyword} from '../lib/juso-address';
import {locate} from '../lib/notice-locations';

test('lookup removes building suffixes without truncating road or building numbers',()=>{
 assert.equal(addressSearchKeyword('전북특별자치도 전주시 덕진구 인교로 35-25, 뉴도현빌 (우아동1가)'), '전북특별자치도 전주시 덕진구 인교로 35-25');
 assert.equal(addressSearchKeyword('경기도 화성시 동탄대로12길 71 화성동탄2 A40블록'), '경기도 화성시 동탄대로12길 71');
 assert.equal(addressSearchKeyword('경기도 양주시 덕계동 338'), '경기도 양주시 덕계동 338');
});

test('road-address fallback rejects ambiguous/error results and resolves a unique address', async(t)=>{
 const oldJuso=process.env.JUSO_API_KEY,oldKakao=process.env.KAKAO_REST_API_KEY;
 process.env.JUSO_API_KEY='test-key';process.env.KAKAO_REST_API_KEY='test-key';
 t.after(()=>{if(oldJuso===undefined)delete process.env.JUSO_API_KEY;else process.env.JUSO_API_KEY=oldJuso;if(oldKakao===undefined)delete process.env.KAKAO_REST_API_KEY;else process.env.KAKAO_REST_API_KEY=oldKakao;});
 let count='2',code='0',calls=0;
 const road='제주특별자치도 제주시 거로길 50';
 t.mock.method(globalThis,'fetch',async(input: string|URL|Request)=>{
  calls++;
  const url=new URL(String(input));
  if(url.hostname==='business.juso.go.kr')return Response.json({results:{common:{errorCode:code,totalCount:count},juso:[{roadAddrPart1:road}]}});
  return Response.json(url.searchParams.get('query')===road ? {meta:{total_count:1},documents:[{address:{main_address_no:'50'},x:'126.56',y:'33.50'}]} : {meta:{total_count:0},documents:[]});
 });
 assert.equal(await searchRoadAddress('제주시'),null);assert.equal(calls,0);
 assert.equal(await searchRoadAddress('제주시 거로길 50'),null);
 count='1';code='E0001';assert.equal(await searchRoadAddress('제주시 거로길 50'),null);
 code='0';assert.equal(await searchRoadAddress('제주시 거로길 50'),road);
 const result=await locate('제주시 거로길 50');
 assert.equal(result.lat,33.5);assert.match(result.coordinateStatus,/행정안전부/);
 calls=0;await locate(road);assert.equal(calls,1,'successful original geocoding must not trigger another API');
});

test('a building annotation is retried as an exact road address without requiring Juso',async(t)=>{
 const old=process.env.KAKAO_REST_API_KEY;process.env.KAKAO_REST_API_KEY='test';
 t.after(()=>{if(old===undefined)delete process.env.KAKAO_REST_API_KEY;else process.env.KAKAO_REST_API_KEY=old;});
 const queries:string[]=[];
 t.mock.method(globalThis,'fetch',async(input:string|URL|Request)=>{
 const url=new URL(String(input));assert.equal(url.hostname,'dapi.kakao.com');const query=url.searchParams.get('query')!;queries.push(query);
 return Response.json(query==='경기도 화성시 동탄대로12길 71'?{meta:{total_count:1},documents:[{address:{main_address_no:'71'},x:'127.1',y:'37.1'}]}:{meta:{total_count:0},documents:[]});
 });
 const r=await locate('경기도 화성시 동탄대로12길 71 화성동탄2 A40블록');assert.equal(r.lat,37.1);assert.equal(queries.length,2);
});
