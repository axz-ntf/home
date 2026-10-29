import {timingSafeEqual} from 'node:crypto';
import {hasDb,sql} from '@/lib/db';
export type Kind='complexes'|'notices';
const sources={complexes:['lh-complexes','youth-complexes'],notices:['lh-listings','lh-notices','sh-notices','youth-notices']} as const;
const headers={'Cache-Control':'private, no-store','Vary':'Authorization'};
export const respond=(body:unknown,status=200)=>Response.json(body,{status,headers});
export function authorize(request:Request){
 const expected=process.env.HOUSING_API_KEY?.trim();
 if(!expected)return respond({error:{code:'API_NOT_CONFIGURED',message:'API 인증키가 설정되지 않았습니다.'}},503);
 const given=request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]??'';
 const a=Buffer.from(given),b=Buffer.from(expected);
 if(a.length!==b.length||!timingSafeEqual(a,b))return respond({error:{code:'UNAUTHORIZED',message:'유효한 Bearer API 키가 필요합니다.'}},401);
 if(!hasDb)return respond({error:{code:'DATABASE_NOT_CONFIGURED',message:'데이터베이스가 설정되지 않았습니다.'}},503);
 return null;
}
function isSource(kind:Kind,source:string){return (sources[kind] as readonly string[]).includes(source);}
export async function list(kind:Kind,request:Request){
 const error=authorize(request);if(error)return error;
 const p=new URL(request.url).searchParams;const source=p.get('source')||'';const q=(p.get('q')||'').trim(),region=(p.get('region')||'').trim();
 const page=Number(p.get('page')??'1'),limit=Number(p.get('limit')??'20');
 if((source&&!isSource(kind,source))||q.length>100||region.length>100||!Number.isSafeInteger(page)||page<1||page>1000||!Number.isSafeInteger(limit)||limit<1||limit>100)return respond({error:{code:'INVALID_PARAMETERS',message:'source, 검색어 또는 페이지 범위를 확인하세요. page 1~1000, limit 1~100.'}},400);
 const escape=(v:string)=>v.replace(/[\\%_]/g,'\\$&');const query=`%${escape(q)}%`,reg=`%${escape(region)}%`,offset=(page-1)*limit;
 try{
  // Queries use fixed SQL and bound parameters; return only explicitly chosen columns.
  const rows=kind==='complexes'?await sql`select v.source,v.source_id as id,v.name,v.address,v.pnu,v.latitude,v.longitude,s.imported_at as snapshot_at from public.housing_complexes_v v join public.housing_catalog_snapshots s on s.source=v.source where v.has_external_id and (${source}='' or v.source=${source}) and (${q}='' or v.name ilike ${query} or v.address ilike ${query}) and (${region}='' or v.address ilike ${reg}) order by v.source,v.source_id limit ${limit+1} offset ${offset}`:
  await sql`select v.source,v.source_id as id,v.title,v.announced_at_text as announced_at,v.source_url,v.address,s.imported_at as snapshot_at from public.housing_notices_v v join public.housing_catalog_snapshots s on s.source=v.source where left(v.source_id,14) <> '__missing_row_' and (${source}='' or v.source=${source}) and (${q}='' or v.title ilike ${query} or v.address ilike ${query}) and (${region}='' or v.address ilike ${reg} or v.source_data->>'sido' ilike ${reg} or v.source_data->>'gu' ilike ${reg}) order by v.source,v.source_id,v.source_row limit ${limit+1} offset ${offset}`;
  return respond({data:rows.slice(0,limit),pagination:{page,limit,has_more:rows.length>limit},meta:{data_kind:'project_snapshot',last_updated_note:'snapshot_at은 API 원본 갱신일이 아닌 프로젝트 데이터를 DB에 저장한 시각입니다.'}});
 }catch{ return respond({error:{code:'DATABASE_ERROR',message:'데이터 조회에 실패했습니다.'}},503);}
}
export async function detail(kind:Kind,request:Request,source:string,id:string){
 const error=authorize(request);if(error)return error;
 if(!isSource(kind,source)||!id||id.length>128||id.startsWith('__missing_row_'))return respond({error:{code:'INVALID_PARAMETERS',message:'유효하지 않은 출처 또는 식별자입니다.'}},400);
 try{
 const rows=kind==='complexes'?await sql`select v.source,v.source_id as id,v.name,v.address,v.pnu,v.latitude,v.longitude,s.imported_at as snapshot_at from public.housing_complexes_v v join public.housing_catalog_snapshots s on s.source=v.source where v.source=${source} and v.source_id=${id} and v.has_external_id limit 2`:
 await sql`select v.source,v.source_id as id,v.title,v.announced_at_text as announced_at,v.source_url,v.address,s.imported_at as snapshot_at from public.housing_notices_v v join public.housing_catalog_snapshots s on s.source=v.source where v.source=${source} and v.source_id=${id} limit 2`;
 if(rows.length===0)return respond({error:{code:'NOT_FOUND',message:'데이터를 찾을 수 없습니다.'}},404);
 if(rows.length>1)return respond({error:{code:'AMBIGUOUS_ID',message:'동일 출처에 중복 식별자가 있어 상세 조회할 수 없습니다.'}},409);
 if(kind==='complexes'&&source==='lh-complexes'){
  const units=await sql`select unit_type,building_type,exclusive_area_m2,deposit_won,monthly_rent_won from public.housing_unit_types_v where source=${source} and complex_source_id=${id} order by source_row limit 501`;
  return respond({data:{...rows[0],unit_types:units.slice(0,500),unit_types_truncated:units.length>500},meta:{data_kind:'project_snapshot'}});
 }
 return respond({data:rows[0],meta:{data_kind:'project_snapshot'}});
 }catch{return respond({error:{code:'DATABASE_ERROR',message:'데이터 조회에 실패했습니다.'}},503);}
}
