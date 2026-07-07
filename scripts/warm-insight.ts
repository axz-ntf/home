// 주변입지 분석 사전 계산 — lib/insight-cache.json 을 증분 갱신.
// lib/insight.ts 의 computeInsight 를 직접 호출하므로 dev 서버가 필요 없다 (CI 야간 파이프라인용).
// 이미 캐시된 좌표는 skip → 매일 신규 공고 수만큼만 Claude 호출.
//
// 사용: npx tsx scripts/warm-insight.ts [--limit N] [--force]
//   --limit N  이번 실행에서 새로 계산할 최대 건수 (기본 9999)
//   --force    기존 캐시 무시하고 전체 재계산 (시세 텍스트 갱신 등 필요할 때 수동으로)
import fs from "node:fs";
import path from "node:path";
import { computeInsight, insightCacheKey, type InsightResult } from "../lib/insight";
import type { HousingTypeId } from "../lib/types";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "lib/insight-cache.json");
const CONCURRENCY = 5;

const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : 9999;
const FORCE = process.argv.includes("--force");

const api = JSON.parse(fs.readFileSync(path.join(ROOT, "lib/listings-api.json"), "utf8"));
const arr: {
  lat?: number; lng?: number; type?: HousingTypeId;
  title?: string; complexName?: string; address?: string;
}[] = Array.isArray(api) ? api : (api.listings ?? []);

const cache: Record<string, InsightResult> = fs.existsSync(OUT)
  ? JSON.parse(fs.readFileSync(OUT, "utf8"))
  : {};

// 좌표+유형 중복 제거 후, 캐시에 없는 키만 대상 (--force 면 전부).
const tasks = new Map<string, { key: string; lat: number; lng: number; type?: HousingTypeId; name: string; address: string }>();
for (const l of arr) {
  if (!l.lat || !l.lng) continue;
  const key = insightCacheKey(l.lat, l.lng, l.type);
  if (tasks.has(key)) continue;
  if (!FORCE && cache[key]) continue;
  tasks.set(key, { key, lat: l.lat, lng: l.lng, type: l.type, name: l.title || l.complexName || "", address: l.address || "" });
}
const list = [...tasks.values()].slice(0, LIMIT);
console.log(`캐시 ${Object.keys(cache).length}건 보유 · 신규 ${list.length}건 계산 시작 (동시 ${CONCURRENCY}${FORCE ? " · force" : ""})`);

let ok = 0, fail = 0, done = 0;

async function one(t: (typeof list)[number]) {
  try {
    cache[t.key] = await computeInsight(t.lat, t.lng, t.name, t.address, t.type);
    ok++;
  } catch (e) {
    fail++;
    console.error(`  ✗ ${t.name}: ${e instanceof Error ? e.message : e}`);
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

async function main() {
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (list.length > 0) fs.writeFileSync(OUT, JSON.stringify(cache, null, 0));
  console.log(`완료: ok ${ok}, fail ${fail} → ${path.relative(ROOT, OUT)} (${Object.keys(cache).length}건)`);
  if (fail > 0 && ok === 0 && list.length > 0) process.exit(1); // 전부 실패면 CI 에 알림 (키 누락 등)
}

main();
