import {test} from 'node:test';
import assert from 'node:assert/strict';
import {identifyDocument,downloadDocument} from './lib/download-material.mjs';
test('recognizes document signatures and rejects HTML error pages',()=>{
 assert.equal(identifyDocument(Buffer.from('%PDF-1.7\n')).ext,'pdf');
 assert.equal(identifyDocument(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1])).ext,'hwp');
 assert.equal(identifyDocument(Buffer.from([0x50,0x4b,3,4])).ext,'zip');
 assert.throws(()=>identifyDocument(Buffer.from('<html>error</html>')));
});
test('downloads bytes with content hash, rejects unexpected redirect host',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response('%PDF-1.7\n'+'x'.repeat(120),{status:200});
  const file=await downloadDocument('https://apply.lh.or.kr/file.pdf','https://apply.lh.or.kr/');
  assert.equal(file.bytes,129);assert.equal(file.sha256.length,64);
  globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'https://example.com/file.pdf'}});
  await assert.rejects(downloadDocument('https://apply.lh.or.kr/file.pdf','https://apply.lh.or.kr/'),/공식/);
 }finally{globalThis.fetch=original;}
});
test('does not store HTTP errors or empty responses',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response('error',{status:403});
  await assert.rejects(downloadDocument('https://apply.lh.or.kr/file','https://apply.lh.or.kr/'),/403/);
  globalThis.fetch=async()=>new Response('%PDF-',{status:200});
  await assert.rejects(downloadDocument('https://apply.lh.or.kr/file','https://apply.lh.or.kr/'),/불완전/);
 }finally{globalThis.fetch=original;}
});
