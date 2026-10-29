import { createHash } from 'node:crypto';
import { officialUrl } from './notice-materials.mjs';
export function identifyDocument(buffer) {
  if (buffer.subarray(0,5).toString() === '%PDF-') return { ext:'pdf', mime:'application/pdf' };
  if (buffer.subarray(0,8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]))) return { ext:'hwp', mime:'application/x-hwp' };
  if (buffer[0]===0x50 && buffer[1]===0x4b && buffer[2]===3 && buffer[3]===4) return { ext:'zip', mime:'application/zip' };
  throw new Error('PDF/HWP/ZIP 파일이 아닌 응답 (HTML 오류 페이지 등)');
}
export async function downloadDocument(url, referer, {maxBytes=50*1024*1024}={}) {
  let response;
  const signal = AbortSignal.timeout(60000);
  for (let i=0;i<4;i++) {
    if (!officialUrl(url)) throw new Error('공식 첨부파일 주소가 아님');
    response = await fetch(url,{redirect:'manual',signal,headers:{Referer:referer,'User-Agent':'daum-public-housing-app/1.0'}});
    if (response.status>=300 && response.status<400) {
      const location=response.headers.get('location'); await response.body?.cancel();
      if (!location) throw new Error('리다이렉트 주소 없음');
      url=new URL(location,url).href; response=undefined; continue;
    }
    break;
  }
  if (!response?.ok || !response.body) throw new Error(`파일 다운로드 HTTP ${response?.status ?? 'redirect'}`);
  const chunks=[];let bytes=0;
  const reader=response.body.getReader();
  try {
    for (;;) {
      const {done,value}=await reader.read();if(done)break;
      bytes+=value.length;
      if(bytes>maxBytes) throw new Error(`파일당 ${Math.round(maxBytes/1024/1024)}MB 제한 초과`);
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const buffer=Buffer.concat(chunks);
  if(buffer.length<100)throw new Error('빈 파일 또는 불완전한 응답');
  const format=identifyDocument(buffer);
  return {buffer,bytes,...format,sha256:createHash('sha256').update(buffer).digest('hex')};
}
