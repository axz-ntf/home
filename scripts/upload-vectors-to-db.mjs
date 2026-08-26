#!/usr/bin/env node
// lib/notice-embeddings/{index.json,vectors.bin} → Supabase Postgres(pgvector) notice_chunks.
// Blob 1GB 한도를 벗어나기 위해 벡터 저장을 DB 로 이전. embed 산출물(인덱스+바이너리)을 그대로 적재.
//
// 증분 적재(기본): DB 의 공고별 청크 수와 인덱스를 비교해 달라진 공고만 delete+insert.
// (이전: 매일 10만 청크 전량 재적재 ~16분 — Actions 무료 한도(월 2,000분) 초과 주범.)
// 한계: 청킹이 바뀌어도 공고별 청크 수가 같으면 감지 못함 — 임베딩 클린 리빌드 뒤에는
// --full 로 1회 전량 재적재할 것.
//
// 메모리 주의: 10만 청크 × 4096 float 문자열 ≈ 2.3GB → 전부 배열로 쌓으면 OOM.
// --full 은 스테이징 테이블에 배치 스트리밍 insert(메모리 한정) 후 한 트랜잭션으로 원자적 swap.
// 증분은 변경분(보통 수백 청크)만 다루므로 live 테이블에 직접 배치 insert.
//
// 사용: node --env-file=.env.local scripts/upload-vectors-to-db.mjs [--full] [--dry-run]
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(ROOT, "lib/notice-embeddings/index.json");
const VECTORS = path.join(ROOT, "lib/notice-embeddings/vectors.bin");
const SCHEMA = path.join(ROOT, "scripts/sql/notice-chunks.sql");

const FULL = process.argv.includes("--full");
const DRY = process.argv.includes("--dry-run");

const CONN = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!CONN) { console.error("ERROR: DIRECT_URL/DATABASE_URL 누락"); process.exit(1); }
const sql = postgres(CONN, { prepare: false });

const BATCH = 500;
// 변경 공고가 이보다 많으면 (첫 적재·클린 리빌드 등) row 단위 증분보다 stage+swap 이 빠름.
const FULL_THRESHOLD_CHUNKS = 30000;

function chunkRow(listingId, c, vectors, dim) {
  const off = c.offset / 4;
  const v = vectors.subarray(off, off + dim);
  return [listingId, c.idx, c.text, "[" + Array.from(v).join(",") + "]"];
}

async function flush(tx, table, rows) {
  await tx`
    insert into ${tx(table)} (listing_id, chunk_idx, text, embedding)
    select * from unnest(
      ${rows.map((r) => r[0])}::text[],
      ${rows.map((r) => r[1])}::int[],
      ${rows.map((r) => r[2])}::text[],
      ${rows.map((r) => r[3])}::text[]::halfvec[]
    )`;
}

// 전량 재적재 — 스테이징에 스트리밍 적재 후 원자적 swap.
async function fullReload(index, vectors, dim) {
  // 스테이징 테이블 — 컬럼만 복제(인덱스 없음 → 적재 빠름). 적재 완료 후 live 로 swap.
  await sql`drop table if exists notice_chunks_stage`;
  await sql`create table notice_chunks_stage (like notice_chunks)`;

  const t0 = Date.now();
  let batch = [];
  let n = 0;
  for (const [listingId, chunks] of Object.entries(index.listings)) {
    for (const c of chunks) {
      batch.push(chunkRow(listingId, c, vectors, dim));
      if (batch.length >= BATCH) { await flush(sql, "notice_chunks_stage", batch); n += batch.length; batch = []; }
    }
    if (n && n % 10000 < BATCH) console.log(`  ${n} 청크…`);
  }
  if (batch.length) { await flush(sql, "notice_chunks_stage", batch); n += batch.length; }
  console.log(`스테이징 적재 ${n} 청크 / ${((Date.now() - t0) / 1000).toFixed(1)}s — swap 중`);

  // 원자적 교체: live 비우고 stage 내용 이관(서버측 insert-select, 클라 메모리 무관).
  await sql.begin(async (tx) => {
    await tx`truncate notice_chunks`;
    await tx`insert into notice_chunks select * from notice_chunks_stage`;
  });
  await sql`truncate notice_chunks_stage`;
}

// 증분 적재 — 공고별 청크 수가 DB 와 다른 공고만 delete+insert.
async function incrementalSync(index, vectors, dim, changed, stale) {
  const t0 = Date.now();
  await sql.begin(async (tx) => {
    // stale = DB 에서 지울 공고 전부 (인덱스에서 사라진 것 + 청크 수 달라진 것 — 후자는 changed 로 재적재됨)
    const toDelete = [...stale.keys()];
    if (toDelete.length) await tx`delete from notice_chunks where listing_id = any(${toDelete})`;
    let batch = [];
    let n = 0;
    for (const id of changed) {
      for (const c of index.listings[id]) {
        batch.push(chunkRow(id, c, vectors, dim));
        if (batch.length >= BATCH) { await flush(tx, "notice_chunks", batch); n += batch.length; batch = []; }
      }
    }
    if (batch.length) { await flush(tx, "notice_chunks", batch); n += batch.length; }
    console.log(`증분 적재 ${n} 청크 (delete ${toDelete.length} 공고) / ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  });
}

async function main() {
  await sql.unsafe(await fs.readFile(SCHEMA, "utf8"));

  const index = JSON.parse(await fs.readFile(INDEX, "utf8"));
  const buf = await fs.readFile(VECTORS);
  const vectors = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const dim = index.dim;
  const totalListings = Object.keys(index.listings).length;

  if (FULL) {
    console.log(`전량 재적재(--full): ${totalListings} 공고 (dim=${dim})`);
    await fullReload(index, vectors, dim);
  } else {
    // DB 현황과 diff — 공고별 청크 수 비교.
    const db = await sql`select listing_id, count(*)::int as n from notice_chunks group by listing_id`;
    const dbCounts = new Map(db.map((r) => [r.listing_id, r.n]));
    // stale: DB 에만 있거나 청크 수가 다른 공고 (삭제 대상)
    const stale = new Map([...dbCounts].filter(([id, n]) => index.listings[id]?.length !== n));
    // changed: 인덱스에 있는데 DB 에 없거나 청크 수가 다른 공고 (적재 대상)
    const changed = Object.keys(index.listings).filter((id) => dbCounts.get(id) !== index.listings[id].length);
    const changedChunks = changed.reduce((s, id) => s + index.listings[id].length, 0);

    if (!stale.size && !changed.length) {
      console.log(`변경 없음 — skip (DB ${dbCounts.size} 공고 유지)`);
      await sql.end();
      return;
    }
    console.log(`diff: 적재 ${changed.length} 공고(${changedChunks} 청크), 제거 ${[...stale.keys()].filter((id) => !index.listings[id]).length} 공고 (DB ${dbCounts.size} → 로컬 ${totalListings})`);
    if (DRY) {
      console.log(`  적재 예시: ${changed.slice(0, 5).join(", ")}`);
      console.log(`  제거 예시: ${[...stale.keys()].filter((id) => !index.listings[id]).slice(0, 5).join(", ")}`);
      console.log("dry-run — 반영 안 함");
      await sql.end();
      return;
    }
    if (changedChunks > FULL_THRESHOLD_CHUNKS) {
      console.log(`변경 ${changedChunks} 청크 > ${FULL_THRESHOLD_CHUNKS} — 전량 재적재로 전환`);
      await fullReload(index, vectors, dim);
    } else {
      await incrementalSync(index, vectors, dim, changed, stale);
    }
  }

  const cnt = await sql`select count(*)::int as n, count(distinct listing_id)::int as l from notice_chunks`;
  console.log(`완료: ${cnt[0].n} 행 / ${cnt[0].l} 공고`);
  await sql.end();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
