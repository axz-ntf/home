#!/usr/bin/env node
// public/lh-covers/*.jpg → Vercel Blob 업로드 + URL 매핑 JSON 저장.
//
// 사용:
//   node --env-file=.env.local scripts/upload-covers-to-blob.mjs [--limit N] [--force]
//
// 출력: lib/blob-covers.json (filename → blob url 매핑)
// lh-adapter 가 coverPhotoLocal 을 이 매핑으로 변환해서 production 에서도 이미지 노출.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { put } from "@vercel/blob";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const COVERS_DIR = path.join(ROOT, "public/lh-covers");
const MAPPING_PATH = path.join(ROOT, "lib/blob-covers.json");

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!TOKEN) { console.error("ERROR: BLOB_READ_WRITE_TOKEN 누락"); process.exit(1); }

const args = process.argv.slice(2);
const limit = (() => {
  const i = args.indexOf("--limit");
  return i >= 0 ? Number(args[i + 1]) : Infinity;
})();
const force = args.includes("--force");

// 기존 매핑 (재시작 시 skip 용)
let mapping = {};
try { mapping = JSON.parse(await fs.readFile(MAPPING_PATH, "utf8")); } catch {}

const files = (await fs.readdir(COVERS_DIR)).filter((f) => /\.(jpe?g|png)$/i.test(f));
console.log(`전체 이미지(jpg/png): ${files.length} / 이미 업로드: ${Object.keys(mapping).length}`);

const todo = files.filter((f) => force || !mapping[f]).slice(0, limit);
console.log(`처리 대상: ${todo.length}건\n`);

let ok = 0, err = 0;
const t0 = Date.now();
const BATCH = 6; // 동시 업로드 — 너무 높이면 throttle

async function uploadOne(filename) {
  const buf = await fs.readFile(path.join(COVERS_DIR, filename));
  const blob = await put(`lh-covers/${filename}`, buf, {
    access: "public",
    token: TOKEN,
    addRandomSuffix: false, // deterministic path — 같은 파일명 재업로드 가능
    contentType: /\.png$/i.test(filename) ? "image/png" : "image/jpeg",
    allowOverwrite: true,
  });
  return blob.url;
}

for (let i = 0; i < todo.length; i += BATCH) {
  const slice = todo.slice(i, i + BATCH);
  const results = await Promise.allSettled(slice.map((f) => uploadOne(f)));
  results.forEach((r, j) => {
    const f = slice[j];
    if (r.status === "fulfilled") {
      mapping[f] = r.value;
      ok++;
    } else {
      console.log(`  ERR ${f}: ${r.reason?.message?.slice(0, 100)}`);
      err++;
    }
  });
  // 매 batch 마다 매핑 save (crash 복구)
  await fs.writeFile(MAPPING_PATH, JSON.stringify(mapping, null, 2) + "\n");
  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`[${Math.min(i + BATCH, todo.length)}/${todo.length}]  ok=${ok} err=${err}  (${elapsed}s)`);
}

console.log(`\n완료: ok=${ok} err=${err}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
console.log(`매핑 → ${MAPPING_PATH} (${Object.keys(mapping).length} entries)`);
