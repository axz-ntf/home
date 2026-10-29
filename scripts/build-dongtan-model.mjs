import fs from 'node:fs/promises';
if(process.argv.includes('--refresh')){
 if(!process.env.JUSO_API_KEY)throw Error('JUSO_API_KEY가 필요합니다.');
 await fs.mkdir('.cache/building-model',{recursive:true});
 const query='[out:json][timeout:25];way["building"](37.1790,127.1071,37.1848,127.1131);out tags geom;';
 const p=new URLSearchParams({confmKey:process.env.JUSO_API_KEY,currentPage:'1',countPerPage:'10',keyword:'동탄대로12길 71',resultType:'json'});
 const responses=await Promise.all([fetch('https://overpass-api.de/api/interpreter?'+new URLSearchParams({data:query}),{signal:AbortSignal.timeout(45000)}),fetch('https://business.juso.go.kr/addrlink/addrLinkApi.do?'+p,{signal:AbortSignal.timeout(15000)})]);
 if(responses.some(r=>!r.ok))throw Error('건물 원본 API 응답 실패 — 기존 모델 유지');
 const [osm,address]=await Promise.all(responses.map(r=>r.json()));
 if(!Array.isArray(osm.elements)||address.results?.common?.errorCode!=='0')throw Error('건물 원본 응답 형식 오류 — 기존 모델 유지');
 await fs.writeFile('.cache/building-model/osm.json',JSON.stringify(osm));await fs.writeFile('.cache/building-model/address-proof.json',JSON.stringify(address));
}

const raw=JSON.parse(await fs.readFile('.cache/building-model/osm.json','utf8'));
const proof=JSON.parse(await fs.readFile('.cache/building-model/address-proof.json','utf8')).results.juso;
if(proof.length!==1||!proof[0].roadAddrPart1.endsWith('동탄대로12길 71'))throw Error('주소 일치 확인 실패');
const buildings=raw.elements.filter(e=>/^184[1-8]동$/.test(e.tags?.name??'')).map(e=>{
 if(!proof[0].detBdNmList.split(',').map(s=>s.trim()).includes(e.tags.name))throw Error('공식 동 목록 불일치');
 const floors=Number(e.tags['building:levels'].replace(/층$/,''));if(!Number.isInteger(floors)||floors<1||floors>60)throw Error('층수 형식 오류');
 const ring=e.geometry.map(p=>[p.lon,p.lat]);if(ring.length<4||JSON.stringify(ring[0])!==JSON.stringify(ring.at(-1)))throw Error('닫히지 않은 도형');
 return {id:String(e.id),name:e.tags.name,floors,height:floors*3,heightSource:'OSM 층수 × 가정 층고 3m',ring,sourceUrl:`https://www.openstreetmap.org/way/${e.id}`};
}).sort((a,b)=>a.name.localeCompare(b.name));
if(buildings.length!==8)throw Error('8개 동 미확보');
const previous=await fs.readFile('public/building-models/dongtan-a40.json','utf8').then(JSON.parse).catch(()=>null);
if(previous?.heightReference==='국토교통부 건축HUB 건축물대장 표제부 · 여울동 1046'){for(let i=0;i<buildings.length;i++){const old=previous.buildings.find(b=>b.id===buildings[i].id&&b.name===buildings[i].name&&b.heightSource==='국토교통부 건축물대장 표제부 높이'&&b.height>0&&b.floors>0);if(!old)throw Error(`${buildings[i].name} 공식 높이 연결을 확인할 수 없어 기존 모델 유지`);buildings[i]={...buildings[i],osmFloors:buildings[i].floors,floors:old.floors,height:old.height,heightSource:old.heightSource,heightVerifiedAt:old.heightVerifiedAt};}}
const model={...(previous?.heightReference?{heightReference:previous.heightReference,heightReferenceUrl:previous.heightReferenceUrl}:{}),id:'dongtan-a40',name:proof[0].bdNm,address:proof[0].roadAddrPart1,noticeId:'lh-rental-0000061177',fetchedAt:new Date().toISOString(),dataTimestamp:raw.osm3s.timestamp_osm_base,center:[127.1114,37.1818],source:'OpenStreetMap contributors · Overpass API',license:'ODbL 1.0',licenseUrl:'https://www.openstreetmap.org/copyright',addressEvidence:'도로명주소 API 단일 주소의 상세건물명에서 1841~1848동 확인; LH 공고문 A40BL 소재지 동탄대로12길 71 일치',buildings};
await fs.mkdir('public/building-models',{recursive:true});await fs.writeFile('public/building-models/dongtan-a40.json.tmp',JSON.stringify(model,null,2)+'\n');await fs.rename('public/building-models/dongtan-a40.json.tmp','public/building-models/dongtan-a40.json');console.log(model.name,buildings.length+'개 동');
