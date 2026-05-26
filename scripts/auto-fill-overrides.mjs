#!/usr/bin/env node
/**
 * 검수 큐 (미검수 + supplyUnits null/1) 매물 중 lib/notice-texts/ 에 마크다운이
 * 있는 것들을 regex 로 추출해서 manual-overrides.json 에 자동 patch.
 *
 * 보수적 접근:
 *  - 공급호수 명확히 잡히면 supplyUnits 채움
 *  - 분양 매물: 표 행의 분양가(원) 평균 → salePriceManwon (만원)
 *  - 임대 매물: 표 행의 보증금/월세 (만원, 또는 원)
 *  - 패턴 매칭 실패 시 그 매물은 skip (사용자 수동 검수)
 *  - 기존 entry 있으면 덮어쓰지 않음 (이미 검수한 매물 보호)
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LISTINGS_PATH = path.join(ROOT, "lib", "listings-api.json");
const OVERRIDES_PATH = path.join(ROOT, "lib", "manual-overrides.json");
const TEXTS_DIR = path.join(ROOT, "lib", "notice-texts");

const listings = JSON.parse(fs.readFileSync(LISTINGS_PATH, "utf8"));
const overrides = JSON.parse(fs.readFileSync(OVERRIDES_PATH, "utf8"));

const queue = listings.filter(
  (l) => !(l.id in overrides) && (l.supplyUnits == null || l.supplyUnits === 1),
);
console.log(`전체 검수 큐: ${queue.length}건`);

const candidates = queue.filter((l) => fs.existsSync(path.join(TEXTS_DIR, `${l.id}.md`)));
console.log(`마크다운 있는 매물: ${candidates.length}건`);
console.log("─".repeat(60));

const results = { success: 0, partial: 0, skipped: 0, details: [] };

for (const listing of candidates) {
  const md = fs.readFileSync(path.join(TEXTS_DIR, `${listing.id}.md`), "utf8");
  const ext = extract(md, listing);
  const id = listing.id;
  const title = listing.title.slice(0, 30);
  const type = listing.type;

  if (!ext || (!ext.supplyUnits && !ext.salePriceManwon && !ext.deposit && !ext.rent)) {
    results.skipped++;
    results.details.push({ id, type, title, status: "skip", reason: "패턴 매칭 실패" });
    continue;
  }

  // override 빌드 — 추출된 값만 포함
  const today = new Date().toISOString().slice(0, 10);
  const override = { _reviewedAt: today, _note: "자동 추출 (PDF 마크다운 regex)" };
  if (ext.supplyUnits != null) override.supplyUnits = ext.supplyUnits;
  if (ext.area) override.area = ext.area;
  if (type === "sale") {
    if (ext.salePriceManwon != null) override.salePriceManwon = ext.salePriceManwon;
  } else {
    if (ext.deposit != null) override.deposit = ext.deposit;
    if (ext.rent != null) override.rent = ext.rent;
  }

  overrides[id] = override;
  if (ext.confidence === "high") results.success++;
  else results.partial++;
  results.details.push({ id, type, title, status: ext.confidence, ...ext });
}

// JSON 안정 정렬 저장
const sorted = Object.keys(overrides).sort().reduce((acc, k) => {
  acc[k] = overrides[k];
  return acc;
}, {});
fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(sorted, null, 2) + "\n", "utf8");

console.log("─".repeat(60));
console.log(`✓ 완전 추출: ${results.success}건`);
console.log(`△ 부분 추출: ${results.partial}건`);
console.log(`× 패턴 매칭 실패 (수동 필요): ${results.skipped}건`);
console.log("");
console.log("상세 (성공/부분):");
for (const d of results.details) {
  if (d.status === "skip") continue;
  const summary = [
    d.supplyUnits != null && `세대 ${d.supplyUnits}`,
    d.salePriceManwon != null && `분양가 ${d.salePriceManwon.toLocaleString()}만`,
    d.deposit != null && `보증금 ${d.deposit.toLocaleString()}만`,
    d.rent != null && `월세 ${d.rent.toLocaleString()}만`,
    d.area && `${d.area}`,
  ].filter(Boolean).join(" · ");
  console.log(`  [${d.status}] ${d.id} (${d.type}) ${d.title}`);
  console.log(`         ${summary}`);
}
console.log("");
console.log("스킵 (수동 검수 필요):");
for (const d of results.details) {
  if (d.status !== "skip") continue;
  console.log(`  - ${d.id} (${d.type}) ${d.title}`);
}

// ─── 추출 로직 ──────────────────────────────────────────────────────
function extract(md, listing) {
  const isSale = listing.type === "sale";

  // 1) 공급호수 — "■ 공급호수 : 13호" / "총 공급 686세대" / "공급세대수 : 13" 등
  let supplyUnits = null;
  const supplyPatterns = [
    /공급호수\s*[:：]?\s*([0-9,]+)\s*호/,
    /총\s*공급\s*세대수?\s*[:：]?\s*([0-9,]+)\s*세대/,
    /공급\s*세대수\s*[:：]?\s*([0-9,]+)/,
    /모집\s*세대수?\s*[:：]?\s*([0-9,]+)/,
    /■\s*공급호수\s*[:：]?\s*([0-9,]+)/,
  ];
  for (const p of supplyPatterns) {
    const m = md.match(p);
    if (m) {
      supplyUnits = Number(m[1].replace(/,/g, ""));
      if (Number.isFinite(supplyUnits) && supplyUnits > 0) break;
      supplyUnits = null;
    }
  }

  // 2) 표 행에서 가격 추출 (분양 / 임대)
  // 표 행 패턴: 숫자로 시작하는 | 행
  const rows = md.match(/^\| *[0-9].*\|.*\|.*\|.*$/gm) ?? [];
  // 너무 적으면 (1~2행) 표 데이터 의심
  if (rows.length === 0) {
    return supplyUnits != null
      ? { supplyUnits, confidence: "partial" }
      : null;
  }

  let salePriceManwon = null;
  let deposit = null;
  let rent = null;
  let area = null;

  if (isSale) {
    // 분양: 칼럼 중 가장 큰 값 (= 총 공급가격) 평균
    const prices = [];
    const areas = [];
    for (const r of rows) {
      const cells = r.split("|").map((s) => s.trim()).filter(Boolean);
      // 큰 숫자 (콤마 포함) = 분양가
      for (const c of cells) {
        if (/^[0-9]{1,3}(?:,[0-9]{3}){2,}$/.test(c)) {  // 천만원 이상 (콤마 2개 이상)
          const n = Number(c.replace(/,/g, ""));
          // 원 단위 — 5천만원 이상 5억 이하만 (분양가 합리적 범위)
          if (n >= 50_000_000 && n <= 5_000_000_000) {
            prices.push(n);
            break; // 한 행에서 첫 값만 (총계가 보통 먼저)
          }
        }
      }
      // 면적 (00.00 형태, 30~150 사이)
      for (const c of cells) {
        if (/^[0-9]{2,3}\.[0-9]{1,4}$/.test(c)) {
          const n = Number(c);
          if (n >= 25 && n <= 200) {
            areas.push(n);
            break;
          }
        }
      }
    }
    if (prices.length > 0) {
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length / 10000;
      salePriceManwon = Math.round(avg);
    }
    if (areas.length > 0) {
      const uniqueAreas = [...new Set(areas.map((a) => Math.round(a)))].sort((a, b) => a - b);
      area = uniqueAreas.length === 1
        ? `${uniqueAreas[0]}㎡`
        : `${uniqueAreas[0]}~${uniqueAreas[uniqueAreas.length - 1]}㎡`;
    }
  } else {
    // 임대: 보증금 / 월세 칼럼 추출
    const deposits = [];
    const rents = [];
    const areas = [];
    for (const r of rows) {
      const cells = r.split("|").map((s) => s.trim()).filter(Boolean);
      // 보증금: 큰 숫자 (만원 단위 표기, 보통 1천~5만 만원)
      const big = cells
        .filter((c) => /^[0-9]{1,3}(?:,[0-9]{3})+$/.test(c) || /^[0-9]{4,8}$/.test(c))
        .map((c) => Number(c.replace(/,/g, "")));
      // 월세: 1만 이하 작은 숫자
      const small = cells
        .filter((c) => /^[0-9]{1,4}$/.test(c) && Number(c) > 0)
        .map((c) => Number(c));
      // 표 컬럼 순서: 보통 [평형, 면적, 세대수, 보증금, 월세, ...] 또는 비슷
      // 휴리스틱: big 의 최대값 = 보증금 (만원), 다음 small = 월세 (만원)
      if (big.length > 0) {
        const dep = Math.max(...big);
        // 1억 이상이면 원 단위로 들어온 거 → 만원으로 변환
        if (dep >= 10_000_000) deposits.push(Math.round(dep / 10000));
        else if (dep >= 50 && dep <= 50_000) deposits.push(dep); // 50만~5억 (만원 단위 표기)
      }
      if (small.length > 0) {
        for (const n of small) {
          if (n >= 5 && n <= 500) {
            rents.push(n);
            break;
          }
        }
      }
      // 면적
      for (const c of cells) {
        if (/^[0-9]{2,3}\.[0-9]{1,4}$/.test(c)) {
          const n = Number(c);
          if (n >= 15 && n <= 200) {
            areas.push(n);
            break;
          }
        }
      }
    }
    if (deposits.length > 0) deposit = Math.round(deposits.reduce((a, b) => a + b, 0) / deposits.length);
    if (rents.length > 0) rent = Math.round(rents.reduce((a, b) => a + b, 0) / rents.length);
    if (areas.length > 0) {
      const uniqueAreas = [...new Set(areas.map((a) => Math.round(a)))].sort((a, b) => a - b);
      area = uniqueAreas.length === 1
        ? `${uniqueAreas[0]}㎡`
        : `${uniqueAreas[0]}~${uniqueAreas[uniqueAreas.length - 1]}㎡`;
    }
  }

  // 표 행 수가 supplyUnits 와 같으면 confidence high
  const tableRowCount = rows.length;
  let confidence = "partial";
  if (supplyUnits != null && tableRowCount === supplyUnits) confidence = "high";
  else if (supplyUnits != null && (salePriceManwon != null || deposit != null)) confidence = "high";

  return {
    supplyUnits,
    salePriceManwon,
    deposit,
    rent,
    area,
    confidence,
  };
}
