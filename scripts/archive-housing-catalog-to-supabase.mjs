// Archive the catalog currently used by the app. This is not an upstream raw API archive.
import postgres from 'postgres';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const datasets=[['lh-listings','listings-api.json'],['lh-complexes','lh-complexes.json'],['lh-notices','lh-notices-all.json'],['sh-notices','sh-notices.json'],['youth-notices','youth-notices.json'],['youth-complexes','youth-complexes.json']];
const connection=process.env.DIRECT_URL||process.env.DATABASE_URL;
if(!connection)throw new Error('DIRECT_URL 또는 DATABASE_URL이 필요합니다.');
// Validate all input before making any change; missing sources never erase database data.
const input=[];
for(const [source,file] of datasets){const path=resolve('lib',file);const bytes=await readFile(path);const rows=JSON.parse(bytes);if(!Array.isArray(rows)||rows.length===0||rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw new Error(`${file}: 비어 있거나 유효하지 않은 데이터`);input.push({source,file,rows,hash:createHash('sha256').update(bytes).digest('hex'),modified:(await stat(path)).mtime});}
const sql=postgres(connection,{prepare:false,max:1,connect_timeout:15});
try{
 await sql.begin(async tx=>{
  await tx`select pg_advisory_xact_lock(hashtext('housing_catalog_archive_v1'))`;
  await tx`create table if not exists public.housing_catalog_snapshots (source text primary key, file_name text not null, sha256 text not null, row_count integer not null, file_modified_at timestamptz not null, imported_at timestamptz not null default now(), provenance text not null)`;
  await tx`create table if not exists public.housing_catalog_records (source text not null references public.housing_catalog_snapshots(source) on delete cascade, row_number integer not null, payload jsonb not null, primary key(source,row_number))`;
  await tx`alter table public.housing_catalog_snapshots enable row level security`;
  await tx`alter table public.housing_catalog_records enable row level security`;
  await tx`revoke all on public.housing_catalog_snapshots, public.housing_catalog_records from anon, authenticated`;
  for(const entry of input){
   await tx`insert into public.housing_catalog_snapshots(source,file_name,sha256,row_count,file_modified_at,provenance) values (${entry.source},${entry.file},${entry.hash},${entry.rows.length},${entry.modified},${'프로젝트 JSON 스냅샷: API 및 공식 사이트 기반 가공 데이터'}) on conflict(source) do update set file_name=excluded.file_name,sha256=excluded.sha256,row_count=excluded.row_count,file_modified_at=excluded.file_modified_at,imported_at=now(),provenance=excluded.provenance`;
   await tx`delete from public.housing_catalog_records where source=${entry.source}`;
   for(let i=0;i<entry.rows.length;i+=500){const part=entry.rows.slice(i,i+500).map((payload,j)=>({row_number:i+j,payload}));await tx`insert into public.housing_catalog_records(source,row_number,payload) select ${entry.source}, row_number,payload from jsonb_to_recordset(${tx.json(part)}::jsonb) as t(row_number integer,payload jsonb)`;}
   console.log(`${entry.source}: ${entry.rows.length}건 준비`);
  }
 });
 console.log('전체 스냅샷 저장 완료');
}finally{await sql.end();}
