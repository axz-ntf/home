// 소스별 sync 기록 (어드민 P4) — 각 sync 스크립트가 끝에서 호출.
// lib/_sync-meta.json: { [source]: { at: ISO, count } } — 대시보드 헬스 스트립이 읽는다.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const META_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../lib/_sync-meta.json");

export async function recordSync(source, count) {
  let meta = {};
  try { meta = JSON.parse(await fs.readFile(META_PATH, "utf8")); } catch { /* 첫 기록 */ }
  meta[source] = { at: new Date().toISOString(), count };
  await fs.writeFile(META_PATH, JSON.stringify(meta, null, 2) + "\n", "utf8");
  console.log(`sync-meta: ${source} = ${count}건`);
}
