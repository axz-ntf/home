// 모든 매물의 AI 입지 분석을 미리 계산해 lib/insight-cache.json 생성.
// dev 서버(localhost:3000)가 떠 있어야 함. 키: `${lat.4f},${lng.4f},${type}`
// 실행: node scripts/warm-insight.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "lib/insight-cache.json");
const BASE = "http://localhost:3000/api/insight";
const CONCURRENCY = 5;

const api = JSON.parse(fs.readFileSync(path.join(ROOT, "lib/listings-api.json"), "utf8"));
const arr = Array.isArray(api) ? api : api.listings ?? [];

// 좌표+유형 중복 제거
const tasks = new Map();
for (const l of arr) {
  if (!l.lat || !l.lng) continue;
  const key = `${l.lat.toFixed(4)},${l.lng.toFixed(4)},${l.type ?? ""}`;
  if (!tasks.has(key)) tasks.set(key, { key, lat: l.lat, lng: l.lng, type: l.type, name: l.title || l.complexName || "", address: l.address || "" });
}
const list = [...tasks.values()];
console.log(`고유 매물 ${list.length}개 계산 시작 (동시 ${CONCURRENCY})`);

const cache = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
let ok = 0, fail = 0, done = 0;

async function one(t) {
  try {
    const r = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: t.lat, lng: t.lng, type: t.type, name: t.name, address: t.address }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    cache[t.key] = j;
    ok++;
  } catch (e) {
    fail++;
    console.error(`  ✗ ${t.name}: ${e.message}`);
  } finally {
    done++;
    if (done % 20 === 0) {
      fs.writeFileSync(OUT, JSON.stringify(cache));
      console.log(`  ${done}/${list.length} (ok ${ok}, fail ${fail}) — 중간 저장`);
    }
  }
}

// 동시성 풀
let idx = 0;
async function worker() {
  while (idx < list.length) {
    const t = list[idx++];
    await one(t);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

fs.writeFileSync(OUT, JSON.stringify(cache, null, 0));
console.log(`완료: ok ${ok}, fail ${fail} → ${path.relative(ROOT, OUT)} (${Object.keys(cache).length}건)`);
