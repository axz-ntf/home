// Read-only building register acquisition. This never creates a 3D model from unverified nearby buildings.
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
const jusoKey=process.env.JUSO_API_KEY?.trim(),hubKey=process.env.BLDG_HUB_API_KEY?.trim();
if(!jusoKey||!hubKey)throw Error('도로명주소와 건축HUB 인증키가 필요합니다.');
const raw=await readFile('lib/listings-api.json','utf8');const listings=JSON.parse(raw);
if(!Array.isArray(listings))throw Error('공고 데이터 형식 오류');
const candidates=listings.filter(x=>typeof x.address==='string'&&x.address&&typeof x.lat==='number'&&typeof x.lng==='number'&&x.coordApprox!==true&&x.geocoded!=='regional');
const limit=Number(process.argv.find(x=>x.startsWith('--limit='))?.split('=')[1]??2);
if(!Number.isInteger(limit)||limit<1||limit>20)throw Error('한 번에 1~20건만 허용합니다.');
await mkdir('lib/building-register-local',{recursive:true});
for(const listing of candidates.slice(0,limit)){
 const id=String(listing.id),address=listing.address.replace(/\s*\([^)]*\)\s*$/,'').trim(),safeName=createHash('sha256').update(id).digest('hex');
 const out={id,inputAddress:address,updatedAt:new Date().toISOString(),status:'pending',reason:'',buildings:[],source:'국토교통부 건축HUB 표제부',sourceUrl:'https://www.data.go.kr/data/15134735/openapi.do'};
 try{
  const search=new URLSearchParams({confmKey:jusoKey,currentPage:'1',countPerPage:'10',keyword:address,resultType:'json'});let response;
  try{response=await fetch('https://business.juso.go.kr/addrlink/addrLinkApi.do?'+search,{signal:AbortSignal.timeout(15000)});}catch{throw Error('주소 API 연결 실패');}
  if(!response.ok)throw Error(`주소 API HTTP ${response.status}`);const j=await response.json();
  if(j.results?.common?.errorCode!=='0')throw Error('주소 API 응답 오류');const matches=j.results?.juso??[];
  if(Number(j.results?.common?.totalCount)!==1||matches.length!==1){out.status='address_unconfirmed';out.reason='단일 공식 주소를 확인할 수 없음';}
  else{
   const a=matches[0];const normalize=s=>String(s??'').replace(/\s+/g,'');
   if(normalize(address)!==normalize(a.roadAddrPart1)){out.status='address_unconfirmed';out.reason='공식 도로명주소가 입력 주소와 정확히 일치하지 않음';throw new Error('__ADDRESS_MISMATCH__');}
   if(!/^\d{10}$/.test(String(a.admCd)))throw Error('법정동 코드 오류');
   const params=new URLSearchParams({serviceKey:hubKey,sigunguCd:a.admCd.slice(0,5),bjdongCd:a.admCd.slice(5),platGbCd:'0',bun:String(a.lnbrMnnm).padStart(4,'0'),ji:String(a.lnbrSlno).padStart(4,'0'),numOfRows:'100',pageNo:'1',_type:'json'});
   let res;try{res=await fetch('https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?'+params,{signal:AbortSignal.timeout(20000)});}catch{throw Error('건축HUB API 연결 실패');}
   if(!res.ok)throw Error(`건축HUB HTTP ${res.status}`);const body=await res.json();if(body.response?.header?.resultCode!=='00')throw Error('건축HUB API 응답 오류');
   const b=body.response.body,total=Number(b?.totalCount);if(!Number.isInteger(total)||total<0||total>100)throw Error('표제부 건수 확인 또는 추가 페이지 필요');
   const items=b?.items?.item,arr=Array.isArray(items)?items:items?[items]:[];if(arr.length!==total)throw Error('표제부 응답 건수 불일치');
   const names=new Set(String(a.detBdNmList||'').split(',').map(s=>s.trim()).filter(Boolean));
   out.buildings=arr.filter(x=>names.has(String(x.dongNm??'').trim())&&Number(x.heit)>0&&Number(x.grndFlrCnt)>0).map(x=>({name:String(x.dongNm).trim(),height:Number(x.heit),floors:Number(x.grndFlrCnt)}));
   out.officialAddress=a.roadAddrPart1;out.status=out.buildings.length?'geometry_unavailable':'register_unavailable';out.reason=out.buildings.length?'공식 높이를 확인했으나 동별 도형과의 연결은 미확인':'동명·주소가 일치하는 유효한 표제부 미확보';
  }
 }catch(e){if(e.message!=='__ADDRESS_MISMATCH__'){out.status='request_failed';out.reason=e.message;}}
 const target=`lib/building-register-local/${safeName}.json`;const prior=await readFile(target,'utf8').then(JSON.parse).catch(()=>null);if(out.status==='request_failed'&&prior?.status==='geometry_unavailable'){console.log(`${id} 요청 실패 · 기존 결과 유지`);continue;}await writeFile(target+'.tmp',JSON.stringify(out,null,2)+'\n');await rename(target+'.tmp',target);
 console.log(`${id} ${out.status} 높이 ${out.buildings.length}개 · ${out.reason}`);
}
console.log(`대상 ${candidates.length}건 중 ${Math.min(limit,candidates.length)}건 처리. 기존 서비스·3D 모델은 변경하지 않았습니다.`);
