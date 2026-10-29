import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {locate,readNoticeLocations,type NoticeLocations} from '../lib/notice-locations';
async function main(){
 const root='.cache/document-address-review';
 const listings=JSON.parse(await fs.readFile('lib/listings-api.json','utf8'));
 const docs=JSON.parse(await fs.readFile(root+'/manifest.json','utf8'));
 const save=async(id:string,d:NoticeLocations)=>{await fs.writeFile('lib/notice-locations/'+createHash('sha256').update(id).digest('hex')+'.json',JSON.stringify(d,null,2)+'\n');};
 for(const suffix of ['0742','0688','0802','0539','0478','0770','0768','0547','0568']){
 const id='lh-rental-201512230002'+suffix;const row=listings.find((r:{id:string})=>r.id===id);const d:NoticeLocations=await readNoticeLocations(id,row.sourceUrl)??{sourceUrl:row.sourceUrl,collectedAt:new Date().toISOString(),locations:[]};
 const doc=docs.find((x:{id:string;textFile?:string})=>x.id===id&&x.textFile?.endsWith('-0.txt'));
 if(suffix==='0742'){const html=await(await fetch(row.sourceUrl)).text();if(!html.includes('동서학동 875-1')||!html.includes('35.8096383')||!html.includes('127.1570341'))throw Error('LH 좌표 근거 변경');for(const l of d.locations.filter(l=>l.lat==null)){Object.assign(l,{lat:35.8096383,lng:127.1570341,coordinateStatus:'LH 공식 공급위치 좌표 확인'});l.evidence+=' · LH 공식 상세 공급위치 지도와 지번 일치';}}
 if(suffix==='0688'||suffix==='0802'){for(const l of d.locations.filter(l=>l.lat==null)){const q=suffix==='0688'?'경기도 안산시 상록구 이동 599-9':'경기도 수원시 영통구 삼성로320번길 17';Object.assign(l,await locate(q));l.evidence+=suffix==='0688'?' · 동일 주택목록 F158~159 지번: 경기도 안산시 상록구 이동 599-9':' · 동일 주택목록 광교웰스하임 지번295-1; 도로명주소 API 삼성로320번길17 (101동·102동·103동) 확인';}}
 if(suffix==='0539'||suffix==='0478'){
 const text=await fs.readFile(doc.textFile,'utf8');const needle=suffix==='0539'?'양곡리 490':'304';const start=text.indexOf(needle);if(start<0)throw Error('원문 근거 없음');const page=text.slice(0,start).split('\f').length;
 const addresses=suffix==='0539'?['경기도 김포시 양촌읍 양곡리 490','경기도 김포시 양촌읍 양곡리 488-3','경기도 김포시 양촌읍 양곡리 487']:['전남광주통합특별시 북구 대자로 55'];
 d.locations=[];for(const address of addresses){const q=address.replace('전남광주통합특별시','광주광역시');d.locations.push({address,units:0,evidence:`PDF ${page}쪽: ${text.slice(Math.max(0,start-70),start+150).replace(/\s+/g,' ')}${suffix==='0478'?' · 도로명주소 API 벽산블루밍 메가씨티 304동: 대자로55 확인':''}`,sourceLabel:doc.name,localUrl:doc.localUrl+'#page='+page,...await locate(q)});}}
 if(['0770','0768','0547','0568'].includes(suffix)){
 const text=await fs.readFile(doc.textFile,'utf8');const needle=suffix==='0568'?'주택세부내역':'공급대상 주택 내역';const start=text.indexOf(needle);if(start<0)throw Error('미공개 근거 없음 '+id);const page=text.slice(0,start).split('\f').length;
 d.review={status:'not-published',message:'공고문 상세주소 미공개 · 대상자 선정 또는 계약 안내 시 주택 내역 제공',evidence:text.slice(Math.max(0,start-30),start+170).replace(/\s+/g,' '),localUrl:doc.localUrl+'#page='+page,sourceLabel:doc.name};}
 await save(id,d);console.log(id,d.locations.length,d.locations.filter(l=>l.lat!=null).length);
 }
 const unresolved=JSON.parse(await fs.readFile(root+'/complex-unresolved.json','utf8'));
 const candidates=JSON.parse(await fs.readFile(root+'/complex-name-candidates.json','utf8'));
 for(const id of new Set<string>(unresolved.map((r:{id:string})=>r.id))){const row=listings.find((r:{id:string})=>r.id===id);const d=await readNoticeLocations(id,row.sourceUrl);const c=candidates.find((r:{id:string})=>r.id===id);if(d?.locations.length&&c){d.review={status:'partial',message:'공고문 단지 중 주소 일치를 확인한 항목만 표시합니다. 나머지 단지 주소는 확인 중입니다.',evidence:c.evidence,localUrl:c.localUrl+'#page='+c.page,sourceLabel:'공고문 임대대상 단지'};await save(id,d);}}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
