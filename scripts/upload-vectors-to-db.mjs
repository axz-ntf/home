#!/usr/bin/env node
// lib/notice-embeddings/{index.json,vectors.bin} → Supabase Postgres(pgvector) notice_chunks.
// Blob 1GB 한도를 벗어나기 위해 벡터 저장을 DB 로 이전. embed 산출물(인덱스+바이너리)을 그대로 적재.
//
// 메모리 주의: 5.8만 청크 × 4096 float 문자열 ≈ 2.3GB → 전부 배열로 쌓으면 OOM.
// 스테이징 테이블에 배치 스트리밍 insert(메모리 한정) 후, 한 트랜잭션으로 원자적 swap.
//
// 사용: node --env-file=.env.local scripts/upload-vectors-to-db.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(ROOT, "lib/notice-embeddings/index.json");
const VECTORS = path.join(ROOT, "lib/notice-embeddings/vectors.bin");
const SCHEMA = path.join(ROOT, "scripts/sql/notice-chunks.sql");

const CONN = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!CONN) { console.error("ERROR: DIRECT_URL/DATABASE_URL 누락"); process.exit(1); }
const sql = postgres(CONN, { prepare: false });

const BATCH = 500;

async function flush(rows) {
  await sql`
    insert into notice_chunks_stage (listing_id, chunk_idx, text, embedding)
    select * from unnest(
      ${rows.map((r) => r[0])}::text[],
      ${rows.map((r) => r[1])}::int[],
      ${rows.map((r) => r[2])}::text[],
      ${rows.map((r) => r[3])}::text[]::halfvec[]
    )`;
}

async function main() {
  await sql.unsafe(await fs.readFile(SCHEMA, "utf8"));
  // 스테이징 테이블 — 컬럼만 복제(인덱스 없음 → 적재 빠름). 적재 완료 후 live 로 swap.
  await sql`drop table if exists notice_chunks_stage`;
  await sql`create table notice_chunks_stage (like notice_chunks)`;

  const index = JSON.parse(await fs.readFile(INDEX, "utf8"));
  const buf = await fs.readFile(VECTORS);
  const vectors = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const dim = index.dim;
  const totalListings = Object.keys(index.listings).length;
  console.log(`적재 시작: ${totalListings} 공고 (dim=${dim}) — 스트리밍 배치 ${BATCH}`);

  const t0 = Date.now();
  let batch = [];
  let n = 0;
  for (const [listingId, chunks] of Object.entries(index.listings)) {
    for (const c of chunks) {
      const off = c.offset / 4;
      const v = vectors.subarray(off, off + dim);
      batch.push([listingId, c.idx, c.text, "[" + Array.from(v).join(",") + "]"]);
      if (batch.length >= BATCH) { await flush(batch); n += batch.length; batch = []; }
    }
    if (n && n % 10000 < BATCH) console.log(`  ${n} 청크…`);
  }
  if (batch.length) { await flush(batch); n += batch.length; }
  console.log(`스테이징 적재 ${n} 청크 / ${((Date.now() - t0) / 1000).toFixed(1)}s — swap 중`);

  // 원자적 교체: live 비우고 stage 내용 이관(서버측 insert-select, 클라 메모리 무관).
  await sql.begin(async (tx) => {
    await tx`truncate notice_chunks`;
    await tx`insert into notice_chunks select * from notice_chunks_stage`;
  });
  await sql`truncate notice_chunks_stage`;

  const cnt = await sql`select count(*)::int as n, count(distinct listing_id)::int as l from notice_chunks`;
  console.log(`완료: ${cnt[0].n} 행 / ${cnt[0].l} 공고`);
  await sql.end();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
