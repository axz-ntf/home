#!/usr/bin/env node
// markdown 캐시 (lib/notice-texts/*.md) → 청크 분할 → Upstage Solar 임베딩 → 저장.
//
// 저장 구조 (binary + metadata 하이브리드 — 4096dim float32 가 JSON 으론 너무 큼):
//   lib/notice-embeddings/index.json — { dim, model, listings: { id: [{ idx, text, offset }] } }
//   lib/notice-embeddings/vectors.bin — Float32 binary blob (모든 청크 벡터 concat)
//
// 사용:
//   node --env-file=.env.local --env-file=.env.solar-test scripts/embed-notice-texts.mjs [--limit N] [--force]

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TEXTS_DIR = path.join(ROOT, "lib/notice-texts");
const OUT_DIR = path.join(ROOT, "lib/notice-embeddings");
const INDEX_PATH = path.join(OUT_DIR, "index.json");
const VECTORS_PATH = path.join(OUT_DIR, "vectors.bin");

const SOLAR_API_KEY = process.env.SOLAR_API_KEY;
if (!SOLAR_API_KEY) { console.error("ERROR: SOLAR_API_KEY 누락"); process.exit(1); }

const EMBED_URL = "https://api.upstage.ai/v1/embeddings";
const MODEL = "solar-embedding-1-large-passage";
const CHUNK_SIZE = 900;       // 문자 단위 — Solar 는 한국어에서 토큰당 ~1.5자
const CHUNK_OVERLAP = 100;    // 청크 경계에서 컨텍스트 손실 방지
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 32);  // Solar embedding-1-large 의 max batch 권장 ~32
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS ?? 80); // rate-limit 방어 (보수적 80ms)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hashOf = (s) => crypto.createHash("sha1").update(s).digest("hex");

// markdown 을 의미 단위(빈 줄 paragraph)로 끊고, 청크 크기까지 greedy-fill.
// 큰 단락은 강제 슬라이스 + overlap.
function chunkMarkdown(md) {
  const paragraphs = md.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let cur = "";
  const flush = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ""; };

  for (const p of paragraphs) {
    if (p.length > CHUNK_SIZE * 1.5) {
      // 너무 큰 단락은 강제로 슬라이스 (overlap 포함)
      flush();
      let i = 0;
      while (i < p.length) {
        chunks.push(p.slice(i, i + CHUNK_SIZE));
        i += CHUNK_SIZE - CHUNK_OVERLAP;
      }
      continue;
    }
    if (cur.length + p.length + 2 > CHUNK_SIZE) {
      flush();
      // overlap — 이전 청크 꼬리를 새 청크 머리로
      const tail = chunks.at(-1)?.slice(-CHUNK_OVERLAP) ?? "";
      cur = tail ? tail + "\n\n" : "";
    }
    cur += (cur ? "\n\n" : "") + p;
  }
  flush();
  return chunks;
}

async function embedBatch(texts) {
  const r = await fetch(EMBED_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SOLAR_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`embed HTTP ${r.status}: ${txt.slice(0, 200)}`);
  }
  const j = await r.json();
  return { vectors: j.data.map((d) => d.embedding), usage: j.usage };
}

function parseArgs() {
  const a = process.argv.slice(2);
  const limIdx = a.indexOf("--limit");
  return {
    limit: limIdx >= 0 ? Number(a[limIdx + 1]) : Infinity,
    force: a.includes("--force"),
  };
}

async function main() {
  const args = parseArgs();
  await fs.mkdir(OUT_DIR, { recursive: true });

  // 이미 인덱싱된 매물은 skip (force 가 아니면)
  let existing = { dim: null, model: MODEL, listings: {}, hashes: {} };
  let existingVecBytes = 0;
  if (!args.force) {
    try {
      existing = JSON.parse(await fs.readFile(INDEX_PATH, "utf8"));
      const stat = await fs.stat(VECTORS_PATH);
      existingVecBytes = stat.size;
    } catch {
      // 신규
    }
  }
  if (!existing.hashes) existing.hashes = {};
  // 내용 해시 → 첫 등장 id. 동일 공고문(houseSn 별 중복 md)은 벡터를 한 번만
  // 저장하고 같은 offset 을 공유 — 재임베딩·vectors.bin 중복 append 방지.
  const hashToId = new Map();
  for (const [id, h] of Object.entries(existing.hashes)) {
    if (existing.listings[id] && !hashToId.has(h)) hashToId.set(h, id);
  }

  const files = (await fs.readdir(TEXTS_DIR))
    .filter((f) => f.endsWith(".md"));
  const targets = files
    .map((f) => ({ id: f.replace(/\.md$/, ""), file: path.join(TEXTS_DIR, f) }))
    .filter((t) => args.force || !existing.listings[t.id])
    .slice(0, args.limit);

  console.log(`처리 대상: ${targets.length}건 / 전체 캐시: ${files.length} / 이미 임베딩: ${Object.keys(existing.listings).length}건\n`);

  // vec 파일은 append 모드
  const vecHandle = await fs.open(VECTORS_PATH, args.force ? "w" : "a");
  let totalChunks = Object.values(existing.listings).reduce((a, arr) => a + arr.length, 0);
  let totalTokens = 0;
  let vecBytes = args.force ? 0 : existingVecBytes;
  const t0 = Date.now();

  try {
    for (let i = 0; i < targets.length; i++) {
      const { id, file } = targets[i];
      const md = await fs.readFile(file, "utf8");

      // 동일 내용(houseSn 별 중복 공고문)이면 이미 임베딩된 벡터 offset 을 그대로 공유.
      const h = hashOf(md);
      const dupId = hashToId.get(h);
      if (dupId) {
        existing.listings[id] = existing.listings[dupId];
        existing.hashes[id] = h;
        console.log(`[${i + 1}/${targets.length}] ${id} ← ${dupId} 동일 공고문 — 벡터 재사용`);
        await fs.writeFile(INDEX_PATH, JSON.stringify(existing, null, 2) + "\n", "utf8");
        continue;
      }

      const chunks = chunkMarkdown(md);
      console.log(`[${i + 1}/${targets.length}] ${id}  md=${md.length}자 → 청크 ${chunks.length}개`);

      const chunkEntries = [];
      for (let b = 0; b < chunks.length; b += BATCH_SIZE) {
        const batch = chunks.slice(b, b + BATCH_SIZE);
        const { vectors, usage } = await embedBatch(batch);
        totalTokens += usage?.total_tokens ?? 0;

        for (let k = 0; k < batch.length; k++) {
          const v = vectors[k];
          if (!Array.isArray(v) || v.length === 0) {
            console.log(`  WARN: empty vector chunk ${b + k}`);
            continue;
          }
          if (existing.dim == null) existing.dim = v.length;
          // float32 binary 로 append
          const arr = new Float32Array(v);
          const buf = Buffer.from(arr.buffer);
          await vecHandle.write(buf);
          chunkEntries.push({ idx: b + k, text: batch[k], offset: vecBytes });
          vecBytes += buf.length;
        }
        await sleep(REQUEST_DELAY_MS);
      }
      existing.listings[id] = chunkEntries;
      existing.hashes[id] = h;
      hashToId.set(h, id);
      totalChunks += chunkEntries.length;

      // 인덱스를 매 매물마다 save — crash 시 재개 가능
      await fs.writeFile(INDEX_PATH, JSON.stringify(existing, null, 2) + "\n", "utf8");
    }
  } finally {
    await vecHandle.close();
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n완료: 매물 ${Object.keys(existing.listings).length}건 / 청크 ${totalChunks}개 / 토큰 ${totalTokens.toLocaleString()}`);
  console.log(`vector blob 크기: ${(vecBytes / 1024 / 1024).toFixed(1)} MB (dim=${existing.dim})`);
  console.log(`소요 시간: ${elapsed}s`);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
