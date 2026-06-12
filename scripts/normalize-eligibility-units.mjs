#!/usr/bin/env node
// lib/notice-eligibility/*.json 소득·자산 단위 일괄 정규화 (1회성 정정 + 재검수용).
//
// 추출 LLM 이 LH 표의 원 단위 값을 천원 단위로 저장한 파일이 섞여 있다 (예: 266.9만원 → 2669).
// 판정 기준 — 같은 계층 소득표는 단위가 같다는 전제로 표의 "최솟값" 사용:
//   · 만원 단위 표 최솟값 상한 ≈ 1인 150% ≈ 690만
//   · 천원 단위 표 최솟값 하한 ≈ 1인 50% ≈ 1,750
//   → 최솟값 1500 이상이면 천원 단위로 보고 전체 ÷10.
// 자산 total 은 LH 한도가 2~4억(2만~4만 만원대)이므로 100,000 초과면 천원 단위 → ÷10.
//
// 실행: node scripts/normalize-eligibility-units.mjs [--dry]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "lib/notice-eligibility");
const DRY = process.argv.includes("--dry");

// 교차검증용 — 2026 도시근로자 1인 가구 월평균 소득 100% 근사치 (만원).
const BASE_1P_100 = 458;

let changedFiles = 0, changedTables = 0, changedAssets = 0;
const warnings = [];

for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  const id = f.replace(/\.json$/, "");
  const file = path.join(DIR, f);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  let changed = false;

  for (const tier of data.tiers ?? []) {
    const table = tier.income?.byHousehold;
    if (table) {
      const vals = Object.values(table).filter((v) => v != null);
      const min = Math.min(...vals);
      if (vals.length && min >= 1500) {
        for (const k of Object.keys(table)) {
          if (table[k] != null) table[k] = Math.round(table[k] / 10);
        }
        changed = true;
        changedTables++;
      } else if (vals.length && min >= 1000) {
        warnings.push(`${id} "${tier.name}" 소득표 최솟값 ${min} — 단위 애매, 미수정`);
      }
      // percent 와 교차검증 — 정규화 후에도 1인 값이 기대치에서 ±40% 넘게 벗어나면 경고
      const p = tier.income?.percent;
      const one = table["1"];
      if (p != null && one != null) {
        const expected = (BASE_1P_100 * p) / 100;
        if (one < expected * 0.6 || one > expected * 1.4) {
          warnings.push(`${id} "${tier.name}" 1인=${one}만 vs 기대 ${Math.round(expected)}만 (${p}%)`);
        }
      }
    }
    if (tier.asset?.total != null && tier.asset.total > 100000) {
      tier.asset.total = Math.round(tier.asset.total / 10);
      changed = true;
      changedAssets++;
    }
    // car 한도는 3~5천만원대 — 10000 초과면 천원 단위 (예: 45420 = 45,420천원 = 4,542만).
    if (tier.asset?.car != null && tier.asset.car > 10000) {
      tier.asset.car = Math.round(tier.asset.car / 10);
      changed = true;
      changedAssets++;
    }
    // car=454 는 원문 "4,542만원"의 자릿수 누락으로 확인됨 (notice-texts 대조) → 4542 로 정정.
    if (tier.asset?.car === 454) {
      tier.asset.car = 4542;
      changed = true;
      changedAssets++;
    } else if (tier.asset?.car != null && tier.asset.car > 0 && tier.asset.car < 1000) {
      warnings.push(`${id} "${tier.name}" car=${tier.asset.car}만 — 한도치고 비정상, 수동 확인 필요`);
    }
  }

  if (changed) {
    changedFiles++;
    console.log(`정규화: ${id}`);
    if (!DRY) fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  }
}

console.log(`\n${DRY ? "[dry-run] " : ""}파일 ${changedFiles}개 수정 (소득표 ${changedTables}개, 자산 ${changedAssets}개)`);
if (warnings.length) {
  console.log(`\n경고 ${warnings.length}건:`);
  for (const w of warnings) console.log("  " + w);
}
