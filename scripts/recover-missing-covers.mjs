// 로컬에 없는 커버(=과거 Vercel Blob 전용) 를 LH 원본(coverPhotoUrl)에서 재다운로드.
// → public/lh-covers/{coverPhotoLocal 파일명} 으로 리사이즈·압축 저장. Blob/Supabase 불필요.
// 실행: node scripts/recover-missing-covers.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COVERS = path.join(ROOT, "public/lh-covers");

const api = JSON.parse(fs.readFileSync(path.join(ROOT, "lib/listings-api.json"), "utf8"));
const arr = Array.isArray(api) ? api : api.listings ?? [];
const local = new Set(fs.readdirSync(COVERS));

const targets = [];
for (const l of arr) {
  const cl = l.coverPhotoLocal || "";
  if (!cl) continue;
  const file = cl.split("/").pop();
  if (local.has(file)) continue; // 이미 로컬에 있음
  const url = l.coverPhotoUrl || "";
  if (!url.startsWith("https://apply.lh.or.kr")) continue;
  targets.push({ file, url });
}
console.log(`복구 대상: ${targets.length}`);

let ok = 0, fail = 0;
for (const { file, url } of targets) {
  try {
    const r = await fetch(url, { headers: { Referer: "https://apply.lh.or.kr/", "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    await sharp(buf).resize(900, null, { withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(path.join(COVERS, file));
    ok++;
    if (ok % 10 === 0) console.log(`  ${ok}/${targets.length}`);
  } catch (e) {
    fail++;
    console.log(`  FAIL ${file}: ${e.message}`);
  }
}
console.log(`완료: 성공 ${ok}, 실패 ${fail}`);
