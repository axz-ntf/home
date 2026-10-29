import fs from 'node:fs/promises';
import {readNoticeLocations} from '../lib/notice-locations';
async function main(){
 const listings=JSON.parse(await fs.readFile('lib/listings-api.json','utf8')) as {id:string;title:string;sourceUrl:string}[];
 const outcomes=JSON.parse(await fs.readFile('.cache/location-backfill/report.json','utf8')) as {id:string;reason:string}[];
 const rows=await Promise.all(listings.map(async l=>{const d=await readNoticeLocations(l.id,l.sourceUrl);const locations=d?.locations??[];return {...l,addresses:locations.length,coordinates:locations.filter(p=>p.lat!=null&&p.lng!=null).length,review:d?.review,reason:d?.review?.message??(locations.length?'주소 연결':outcomes.find(o=>o.id===l.id)?.reason??'공식 근거 미확보')};}));
 const summary={total:rows.length,addressConnected:rows.filter(r=>r.addresses).length,allCoordinates:rows.filter(r=>r.addresses&&r.coordinates===r.addresses).length,addresses:rows.reduce((n,r)=>n+r.addresses,0),coordinates:rows.reduce((n,r)=>n+r.coordinates,0),addressUnresolved:rows.filter(r=>!r.addresses).length};
 await fs.writeFile('.cache/location-backfill/final-report.json',JSON.stringify({summary,records:rows},null,2));
 await fs.writeFile('.cache/location-backfill/unresolved.json',JSON.stringify(rows.filter(r=>!r.addresses||r.coordinates<r.addresses),null,2));console.log(summary);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
