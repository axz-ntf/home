#!/usr/bin/env node
// lib/notice-embeddings/vectors.bin → Vercel Blob.
// 결과 URL 을 lib/blob-vectors.json 에 저장 → notice-search.ts 가 runtime 에 fetch.
//
// 사용: node --env-file=.env.local scripts/upload-vectors-to-blob.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { put } from "@vercel/blob";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!TOKEN) { console.error("ERROR: BLOB_READ_WRITE_TOKEN 누락"); process.exit(1); }

async function uploadOne(localPath, blobPath, contentType) {
  const buf = await fs.readFile(localPath);
  const sizeMB = (buf.length / 1024 / 1024).toFixed(1);
  console.log(`[upload] ${blobPath}  ${sizeMB} MB`);
  const t0 = Date.now();
  const blob = await put(blobPath, buf, {
    access: "public",
    token: TOKEN,
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
    // 대용량(수백 MB~GB) 단일 PUT 은 BlobUnknownError 로 실패 → 청크 분할 업로드.
    multipart: true,
  });
  console.log(`  → ${((Date.now() - t0) / 1000).toFixed(1)}s  ${blob.url}`);
  return { url: blob.url, bytes: buf.length };
}

const vectors = await uploadOne(
  path.join(ROOT, "lib/notice-embeddings/vectors.bin"),
  "notice-embeddings/vectors.bin",
  "application/octet-stream",
);
const index = await uploadOne(
  path.join(ROOT, "lib/notice-embeddings/index.json"),
  "notice-embeddings/index.json",
  "application/json",
);

await fs.writeFile(
  path.join(ROOT, "lib/blob-vectors.json"),
  JSON.stringify({ vectors, index, uploadedAt: new Date().toISOString() }, null, 2) + "\n",
);
console.log(`\n저장: lib/blob-vectors.json`);
