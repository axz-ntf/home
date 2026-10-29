// 공개 지도와 동일한 공고의 입지 분석을 사전 계산한다.
// node --import tsx scripts/warm-insight.ts [--limit N] [--force]
// 버전이 다르거나 유효기간이 지난 시드도 다시 수집한다. --limit 0은 비용 없이 대상 수만 확인한다.
import fs from "node:fs";
import path from "node:path";
import { computeInsight, insightCacheKey, isFreshInsight, type InsightResult } from "../lib/insight";
import { LH_LISTINGS } from "../lib/lh-adapter";
import { SH_PUBLIC_LISTINGS } from "../lib/sh-adapter";
import { YOUTH_PUBLIC_LISTINGS } from "../lib/youth-adapter";
import { dedupeCorrections } from "../lib/dedupe-corrections";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "lib/insight-cache.json");
const CONCURRENCY = 5;
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : 9999;
const FORCE = process.argv.includes("--force");
if (!Number.isSafeInteger(LIMIT) || LIMIT < 0) throw new Error("--limit은 0 이상의 정수여야 합니다.");

const cache: Record<string, InsightResult> = fs.existsSync(OUT)
  ? JSON.parse(fs.readFileSync(OUT, "utf8"))
  : {};
const listings = dedupeCorrections([...LH_LISTINGS, ...YOUTH_PUBLIC_LISTINGS, ...SH_PUBLIC_LISTINGS]);
const tasks = new Map<string, { key: string; lat: number; lng: number; type: (typeof listings)[number]["type"]; name: string; address: string }>();
for (const listing of listings) {
  if (listing.coordApprox || !Number.isFinite(listing.lat) || !Number.isFinite(listing.lng) || !listing.lat || !listing.lng) continue;
  if (Math.abs(listing.lat) > 90 || Math.abs(listing.lng) > 180) continue;
  const key = insightCacheKey(listing.lat, listing.lng, listing.type);
  if (tasks.has(key) || (!FORCE && isFreshInsight(cache[key]))) continue;
  tasks.set(key, { key, lat: listing.lat, lng: listing.lng, type: listing.type, name: listing.title || listing.complexName || "", address: listing.address || "" });
}
const list = [...tasks.values()].slice(0, LIMIT);
console.log(`갱신 대상 ${tasks.size}건 · 이번 실행 ${list.length}건 (동시 ${CONCURRENCY}${FORCE ? " · force" : ""})`);
let ai = 0, data = 0, fail = 0, done = 0;

async function one(task: (typeof list)[number]) {
  try {
    const result = await computeInsight(task.lat, task.lng, task.name, task.address, task.type);
    cache[task.key] = result;
    if (result.summarySource === "ai") ai++;
    else data++;
  } catch {
    fail++;
    console.error(`입지 수집 실패: ${task.name}`);
  } finally {
    done++;
    if (done % 20 === 0) {
      fs.writeFileSync(OUT, JSON.stringify(cache));
      console.log(`${done}/${list.length} (AI ${ai}, 데이터 대체 ${data}, 실패 ${fail}) — 중간 저장`);
    }
  }
}

let index = 0;
async function worker() {
  while (index < list.length) await one(list[index++]);
}

async function main() {
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (list.length > 0) fs.writeFileSync(OUT, JSON.stringify(cache));
  console.log(`완료: AI ${ai}, 데이터 대체 ${data}, 실패 ${fail} → ${path.relative(ROOT, OUT)} (${Object.keys(cache).length}건)`);
  // 데이터는 저장하되 모든 AI 요약 실패를 야간 작업에서 감지할 수 있게 한다.
  if (list.length > 0 && ai === 0) process.exitCode = 1;
}

void main();
