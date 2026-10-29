import {readFile} from 'node:fs/promises';
import {NextRequest} from 'next/server';
import {timingSafeEqual,randomBytes} from 'node:crypto';
import path from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {hasDb,sql} from '@/lib/db';
export const runtime='nodejs';
const pattern=/^[a-f0-9]{64}\.(?:pdf|hwp|hwpx|zip|xlsx|xls)$/;
export async function GET(request:NextRequest,{params}:{params:Promise<{filename:string}>}){
 if(process.env.NODE_ENV==='production'){const expected=Buffer.from((process.env.ADMIN_PASSWORD??'').trim()),given=Buffer.from((request.cookies.get('admin_session')?.value??'').trim());if(!expected.length||expected.length!==given.length||!timingSafeEqual(expected,given))return new Response('Unauthorized',{status:401});}
 const {filename}=await params;if(!pattern.test(filename))return new Response('Not found',{status:404});
 const type=filename.endsWith('.pdf')?'application/pdf':'application/octet-stream';
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY;
 if(!url||!key||!hasDb){
  if(process.env.NODE_ENV!=='production')try{const bytes=await readFile(path.join(process.cwd(),'public/notice-files',filename));return new Response(bytes,{headers:{'Content-Type':type,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});}catch{/* missing local file */}
  return new Response('공고문 저장소가 설정되지 않았습니다.',{status:503});
 }
 try{
  const rows=await sql`select bytes from public.housing_notice_documents where object_name=${filename} limit 1`;
  if(!rows.length)return new Response('Not found',{status:404});
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  if(Number(rows[0].bytes)>50*1024*1024){
   const partSize=40*1024*1024,count=Math.ceil(Number(rows[0].bytes)/partSize);
   const parts=await Promise.all(Array.from({length:count},(_,i)=>client.storage.from('housing-notice-documents').createSignedUrl(`${filename}.part-${String(i).padStart(4,'0')}`,300)));
   if(parts.some(p=>p.error||!p.data?.signedUrl))return new Response('공고문 파일을 불러오지 못했습니다.',{status:502});
   const urls=JSON.stringify(parts.map(p=>p.data!.signedUrl)).replace(/</g,'\\u003c');
   const nonce=randomBytes(16).toString('base64');const origin=new URL(url).origin;
   const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><title>공고문 다운로드</title><body><p id="status">파일을 안전하게 준비하고 있습니다. 잠시만 기다려 주세요.</p><script nonce="${nonce}">(async()=>{try{const urls=${urls};const chunks=[];for(const url of urls){const r=await fetch(url);if(!r.ok)throw Error('download failed');chunks.push(await r.blob())}const blob=new Blob(chunks);const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=${JSON.stringify(filename)};link.click();document.getElementById('status').textContent='파일 다운로드가 시작되었습니다.';setTimeout(()=>URL.revokeObjectURL(link.href),60000)}catch{document.getElementById('status').textContent='다운로드에 실패했습니다. 다시 시도해 주세요.'}})()</script></body></html>`;
   return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; connect-src ${origin}; base-uri 'none'; frame-ancestors 'self'`,'X-Content-Type-Options':'nosniff'}});
  }
  const {data,error}=await client.storage.from('housing-notice-documents').createSignedUrl(filename,60);
  if(error||!data?.signedUrl)return new Response('공고문 파일을 불러오지 못했습니다.',{status:502});
  return new Response(null,{status:307,headers:{Location:data.signedUrl,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return new Response('공고문 저장소를 확인해 주세요.',{status:503});}
}
