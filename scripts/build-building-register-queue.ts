import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {DATASETS} from '../lib/housing-catalog';
import {readCatalog} from '../lib/housing-catalog-store';

type Entry={address:string;references:{source:string;id:string}[]; points:{lat:number;lng:number}[]};
const entries=new Map<string,Entry>();
const add=(address:string,source:string,id:string,lat?:number,lng?:number)=>{
 const value=address.replace(/\s*\([^)]*\)\s*$/,'').trim();
 // A complete road address with a building number is necessary for exact matching.
 if(!/^(?:[가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도)|서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)\s/.test(value)||!/(?:로|길)\s*\d/.test(value))return;
 const key=value.replace(/\s+/g,'');const found=entries.get(key)??{address:value,references:[],points:[]};
 if(!found.references.some(r=>r.source===source&&r.id===id))found.references.push({source,id});if(typeof lat==='number'&&typeof lng==='number'&&Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=33&&lat<=39&&lng>=124&&lng<=132&&!found.points.some(p=>p.lat===lat&&p.lng===lng))found.points.push({lat,lng});entries.set(key,found);
};
async function main(){
let records=0;
for(const source of DATASETS){
 const snapshot=await readCatalog(source.id);if(snapshot.error)throw new Error(`${source.id}: ${snapshot.error}`);
 records+=snapshot.records.length;
 for(const r of snapshot.records){
  if(!source.id.endsWith('complexes')&&r.sourceUrl){
   const file=`lib/notice-locations/${createHash('sha256').update(r.id).digest('hex')}.json`;
   const locations=await readFile(file,'utf8').then(JSON.parse).catch(()=>null);
   if(locations?.sourceUrl===r.sourceUrl&&Array.isArray(locations.locations)&&locations.locations.length){for(const l of locations.locations)if(typeof l.address==='string')add(l.address,source.id,r.id,!/대표|추정|지역/.test(l.coordinateStatus??'')?l.lat:undefined,!/대표|추정|지역/.test(l.coordinateStatus??'')?l.lng:undefined);continue;}
  }
  if(r.address){const row=r.rows[0];const precise=row.coordApprox!==true&&row.geocoded!=='regional';add(r.address,source.id,r.id,precise&&typeof row.lat==='number'?row.lat:undefined,precise&&typeof row.lng==='number'?row.lng:undefined);}
 }
}
await mkdir('lib/building-register-local',{recursive:true});
await writeFile('lib/building-register-local/queue.json',JSON.stringify([...entries.values()]));
console.log(`전체 ${records}개 데이터 중 조회 가능한 도로명주소 ${entries.size}개 준비 (중복 주소 통합).`);

}
main().catch(error=>{console.error(error);process.exitCode=1;});
