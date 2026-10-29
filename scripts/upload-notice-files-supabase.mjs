// Upload verified files to a private Supabase Storage bucket and persist source metadata.
import {createClient} from '@supabase/supabase-js';
import postgres from 'postgres';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY,conn=process.env.DATABASE_URL;
if(!url||!key||!conn)throw Error('Supabase URL, 서버 비밀 키, DATABASE_URL 설정이 필요합니다.');
const args=process.argv.indexOf('--limit'),limit=args<0?Infinity:Number(process.argv[args+1]);if(!(limit>0))throw Error('limit은 양수여야 합니다.');
const index=JSON.parse(await readFile('lib/downloaded-documents.local.json','utf8'));
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),bucket='housing-notice-documents';
const existing=await client.storage.getBucket(bucket);
if(existing.error){if(existing.error.statusCode!=='404'&&existing.error.statusCode!==404)throw Error(`Storage 버킷 조회 실패: ${existing.error.message}`);const created=await client.storage.createBucket(bucket,{public:false,fileSizeLimit:52428800});if(created.error)throw Error(`Storage 버킷 생성 실패: ${created.error.message}`);}
else if(existing.data.public)throw Error('기존 버킷이 공개 상태여서 처리를 중단합니다.');
const sql=postgres(conn,{prepare:false,max:1,connect_timeout:15});let uploaded=0,skipped=0,failed=0;
let verificationPending=process.argv.includes('--verify-one');
const shardArg=process.argv.indexOf('--shard'),shardsArg=process.argv.indexOf('--shards');
const shard=shardArg<0?0:Number(process.argv[shardArg+1]),shards=shardsArg<0?1:Number(process.argv[shardsArg+1]);
if(!Number.isInteger(shard)||!Number.isInteger(shards)||shards<1||shard<0||shard>=shards)throw Error('잘못된 분할 설정');
try{
 await sql`create table if not exists public.housing_notice_documents (original_url text primary key, source_url text not null, name text not null, object_name text not null, bytes bigint not null, sha256 text not null, downloaded_at timestamptz not null, stored_at timestamptz not null default now())`;
 await sql`alter table public.housing_notice_documents enable row level security`;
 await sql`revoke all on public.housing_notice_documents from anon, authenticated`;
 for(const [originalUrl,record] of Object.entries(index).filter((_,i)=>i%shards===shard)){
  if(uploaded+failed>=limit)break;
  const filename=path.basename(record.localUrl||'');
  if(!/^[a-f0-9]{64}\.(?:pdf|hwp|hwpx|zip|xlsx|xls)$/.test(filename)||filename.split('.')[0]!==record.sha256){failed++;console.error(`${record.name}: 지원하지 않는 형식 또는 잘못된 파일명`);continue;}
  try{
   const known=await sql`select sha256,object_name from public.housing_notice_documents where original_url=${originalUrl}`;
   if(known[0]?.sha256===record.sha256&&known[0]?.object_name===filename&&!verificationPending){skipped++;continue;}
   verificationPending=false;
   const bytes=await readFile(path.join('public/notice-files',filename));
   if(bytes.length!==record.bytes||createHash('sha256').update(bytes).digest('hex')!==record.sha256)throw Error('파일 무결성 확인 실패');
   // Objects larger than the project's 50 MB per-file cap are stored in ordered parts.
   const partSize=40*1024*1024;
   if(bytes.length>50*1024*1024){
    for(let i=0;i<Math.ceil(bytes.length/partSize);i++){
     const part=bytes.subarray(i*partSize,(i+1)*partSize);
     const {error}=await client.storage.from(bucket).upload(`${filename}.part-${String(i).padStart(4,'0')}`,part,{upsert:true,contentType:'application/octet-stream'});if(error)throw Error(error.message);
    }
   }else{const {error}=await client.storage.from(bucket).upload(filename,bytes,{upsert:true,contentType:filename.endsWith('.pdf')?'application/pdf':'application/octet-stream'});if(error)throw Error(error.message);}
   await sql`insert into public.housing_notice_documents(original_url,source_url,name,object_name,bytes,sha256,downloaded_at) values (${originalUrl},${record.sourceUrl},${record.name},${filename},${record.bytes},${record.sha256},${record.downloadedAt}) on conflict(original_url) do update set source_url=excluded.source_url,name=excluded.name,object_name=excluded.object_name,bytes=excluded.bytes,sha256=excluded.sha256,downloaded_at=excluded.downloaded_at,stored_at=now()`;
   uploaded++;console.log(`저장: ${record.name}`);
  }catch(error){failed++;console.error(`저장 실패: ${record.name}: ${error.message}`);if(failed>=3){console.error('반복 오류로 중단합니다.');break;}}
 }
 console.log(JSON.stringify({uploaded,skipped,failed,total:Object.keys(index).length}));if(failed)process.exitCode=1;
}finally{await sql.end();}
