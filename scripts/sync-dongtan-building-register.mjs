// Refresh building-register heights for Dongtan A40. Never writes the API key or full response.
import {readFile,writeFile,rename} from 'node:fs/promises';
const key=process.env.BLDG_HUB_API_KEY?.trim();if(!key)throw new Error('BLDG_HUB_API_KEY 설정이 필요합니다.');
const path='public/building-models/dongtan-a40.json';const model=JSON.parse(await readFile(path,'utf8'));
const proof=JSON.parse(await readFile('.cache/building-model/address-proof.json','utf8')).results.juso;
if(!Array.isArray(proof)||proof.length!==1||!proof[0].jibunAddr.includes('여울동 1046'))throw new Error('공식 지번 확인 실패');
const j=proof[0],adm=String(j.admCd),bun=String(j.lnbrMnnm).padStart(4,'0'),ji=String(j.lnbrSlno).padStart(4,'0');
if(!/^\d{10}$/.test(adm)||!/^\d{4}$/.test(bun)||!/^\d{4}$/.test(ji))throw new Error('주소 코드 오류');
let rows=[],page=1,total;
do{
 const p=new URLSearchParams({serviceKey:key,sigunguCd:adm.slice(0,5),bjdongCd:adm.slice(5),platGbCd:'0',bun,ji,numOfRows:'100',pageNo:String(page),_type:'json'});
 let res;try{res=await fetch('https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?'+p,{signal:AbortSignal.timeout(30000)});}catch{throw new Error('건축물대장 API 연결 실패');}
 if(!res.ok)throw new Error(`건축물대장 API HTTP ${res.status}`);
 const json=await res.json();if(json.response?.header?.resultCode!=='00')throw new Error('건축물대장 API 응답 오류');
 const body=json.response.body;total=Number(body.totalCount);const items=body.items?.item;const batch=Array.isArray(items)?items:items?[items]:[];
 if(!Number.isSafeInteger(total)||total<1||batch.length===0||page>100)throw new Error('표제부 응답 누락');rows.push(...batch);page++;
}while(rows.length<total);
if(rows.length!==total)throw new Error('표제부 응답 수 불일치');
const updated=model.buildings.map(b=>{
 const matches=rows.filter(r=>String(r.dongNm??'').trim()===b.name && String(r.platPlc??'').includes('여울동 1046'));
 if(matches.length!==1)throw new Error(`${b.name} 일치 결과가 없거나 중복입니다.`);
 const record=matches[0],height=Number(record.heit),floors=Number(record.grndFlrCnt);
 if(!(height>0&&height<300)||!Number.isInteger(floors)||floors<1||floors>100)throw new Error(`${b.name} 높이 또는 층수 오류`);
 return {...b,osmFloors:b.osmFloors??b.floors,floors,height,heightSource:'국토교통부 건축물대장 표제부 높이',heightVerifiedAt:new Date().toISOString()};
});
if(updated.length!==8||new Set(updated.map(x=>x.name)).size!==8)throw new Error('8개 동 확인 실패');
model.buildings=updated;model.heightReference='국토교통부 건축HUB 건축물대장 표제부 · 여울동 1046';model.heightReferenceUrl='https://www.data.go.kr/data/15134735/openapi.do';
await writeFile(path+'.tmp',JSON.stringify(model,null,2)+'\n');await rename(path+'.tmp',path);
for(const b of updated)console.log(`${b.name}: ${b.height}m / ${b.floors}층${b.osmFloors!==b.floors?` (OSM ${b.osmFloors}층과 차이)`:''}`);
