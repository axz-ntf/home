#!/usr/bin/env node
// lib/notice-embeddings/{index.json,vectors.bin} → Supabase Postgres(pgvector) notice_chunks.
// Blob 1GB 한도를 벗어나기 위해 벡터 저장을 DB 로 이전. embed 파이프라인 산출물(인덱스+바이너리)을
// 그대로 읽어 행으로 적재 — 전체 동기화(truncate→insert)라 인덱스와 항상 일치.
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

// 대량 적재(truncate+배치 insert)는 세션 풀러(5432, DIRECT_URL)가 안전 — 트랜잭션 풀러(6543,
// pgbouncer)는 prepared statement·대형 트랜잭션 제약이 있다. DIRECT_URL 없으면 DATABASE_URL fallback.
const CONN = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!CONN) { console.error("ERROR: DIRECT_URL/DATABASE_URL 누락"); process.exit(1); }
const sql = postgres(CONN, { prepare: false });

const BATCH = 800;

async function main() {
  // 스키마 보장(idempotent)
  await sql.unsafe(await fs.readFile(SCHEMA, "utf8"));

  const index = JSON.parse(await fs.readFile(INDEX, "utf8"));
  const buf = await fs.readFile(VECTORS);
  const vectors = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const dim = index.dim;

  // (listing_id, chunk_idx, text, embeddingStr) 행 생성
  const rows = [];
  for (const [listingId, chunks] of Object.entries(index.listings)) {
    for (const c of chunks) {
      const off = c.offset / 4;
      const v = vectors.subarray(off, off + dim);
      rows.push([listingId, c.idx, c.text, "[" + Array.from(v).join(",") + "]"]);
    }
  }
  console.log(`적재 대상: ${rows.length} 청크 / ${Object.keys(index.listings).length} 공고 (dim=${dim})`);

  const t0 = Date.now();
  await sql.begin(async (tx) => {
    await tx`truncate notice_chunks`;
    for (let i = 0; i < rows.length; i += BATCH) {
      const b = rows.slice(i, i + BATCH);
      await tx`
        insert into notice_chunks (listing_id, chunk_idx, text, embedding)
        select * from unnest(
          ${b.map((r) => r[0])}::text[],
          ${b.map((r) => r[1])}::int[],
          ${b.map((r) => r[2])}::text[],
          ${b.map((r) => r[3])}::text[]::halfvec[]
        )
      `;
      if (i % (BATCH * 10) === 0) console.log(`  ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
    }
  });
  const cnt = await sql`select count(*)::int as n from notice_chunks`;
  console.log(`완료: ${cnt[0].n} 행 적재 / ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await sql.end();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
