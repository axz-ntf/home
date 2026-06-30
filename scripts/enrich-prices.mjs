// LH 공고 페이지의 HTML 본문에서 "주택형 안내" 표를 파싱하여 매물의
// 보증금 / 월임대료 / 분양가 / 면적 / 세대수 / 주택형 정보를 채운다.
//
// 적용 우선순위: HTML 표 값 > 기존 API 값. HTML 에 "공고문 확인" 으로 마스킹된 경우는 변경 안 함.
//
// 옵션 (env):
//   FORCE_REENRICH=1   → 가격 있는 매물도 재추출
//   SKIP_REGIONAL=0    → 광역 공고도 처리

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = path.join(ROOT, "lib/listings-api.json");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 daum-public-housing-app/1.0";
const DELAY_MS = 350;
const FORCE = process.env.FORCE_REENRICH === "1";
const SKIP_REGIONAL = process.env.SKIP_REGIONAL !== "0";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// HTML 의 "주택형 안내" 표 추출. 한 공고에 여러 단지/표가 있을 수 있어 모두 모음.
function extractTables(html) {
  const tables = [];
  const re = /<h4[^>]*>\s*주택형\s*안내\s*<\/h4>[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/g;
  let m;
  while ((m = re.exec(html))) {
    const tbl = m[1];
    const rows = [...tbl.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
      .map((r) =>
        [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) =>
          c[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
        )
      )
      .filter((arr) => arr.length >= 5);
    if (rows.length) tables.push(rows);
  }
  return tables;
}

// 표 1행에서 의미있는 값 추출.
// 컬럼 예시: [주택형, 전용면적(㎡), 세대수, 금회공급, 임대보증금, 월임대료, 청약, 안내]
// 또는 분양 공고: [주택형, 전용면적, 세대수, 금회공급, 분양가, 청약, 안내]
function parseRow(row) {
  // 첫 컬럼이 주택형(숫자/문자열). 두번째가 전용면적(숫자). 그 뒤 숫자열.
  if (row.length < 5) return null;
  const houseType = row[0];
  const area = Number(row[1]);
  if (!Number.isFinite(area) || area <= 0) return null;
  // 숫자 컬럼만 (콤마 제거)
  const nums = row.slice(2).map((s) => {
    const n = Number(String(s).replace(/[^0-9]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  // [세대수, 금회공급, 보증금, 월세 ...] 또는 [세대수, 금회공급, 분양가 ...]
  return { houseType, area, nums };
}

// 한 공고 페이지의 모든 표 행을 종합하여 대표 가격/면적 산출.
function aggregateTables(tables) {
  const areas = [];
  const deposits = []; // 원
  const rents = [];
  const sales = [];
  const supplyTotals = [];
  let houseTypes = [];
  for (const tbl of tables) {
    for (const row of tbl) {
      const p = parseRow(row);
      if (!p) continue;
      houseTypes.push(p.houseType);
      areas.push(p.area);
      // 휴리스틱: nums = [세대수?, 금회공급?, 가격1, 가격2]
      // 임대: 가격1=보증금, 가격2=월세. 분양: 가격1=분양가 (큰 수, 수천만원 단위 = 수억 원)
      const numericPrices = p.nums.filter((n) => n !== null);
      if (numericPrices.length >= 2) {
        const last = numericPrices[numericPrices.length - 1];
        const last2 = numericPrices[numericPrices.length - 2];
        // 분양 vs 임대 판단: last2 가 매우 크고(>1억) last 도 크면 분양가 후보로 last2
        if (last2 > 100000000) {
          sales.push(last2);
        } else if (last2 > 0 && last < last2) {
          deposits.push(last2);
          rents.push(last);
        }
        // 세대수
        if (numericPrices.length >= 3) supplyTotals.push(numericPrices[0]);
      } else if (numericPrices.length === 1) {
        if (numericPrices[0] > 100000000) sales.push(numericPrices[0]);
      }
    }
  }
  if (!areas.length) return null;
  houseTypes = [...new Set(houseTypes)];
  const areaMin = Math.min(...areas);
  const areaMax = Math.max(...areas);
  return {
    houseTypes,
    areaMin, areaMax,
    depositMin: deposits.length ? Math.min(...deposits) : null,
    rentMin: rents.length ? Math.min(...rents) : null,
    saleAvg: sales.length ? Math.round(sales.reduce((a, b) => a + b, 0) / sales.length) : null,
    supplyUnits: supplyTotals.length ? supplyTotals.reduce((a, b) => a + b, 0) : null,
    tableRowCount: tables.reduce((s, t) => s + t.length, 0),
  };
}

async function main() {
  const listings = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));

  let targets = listings.filter((l) =>
    l.sourceUrl &&
    l.sourceUrl.includes("selectWrtancInfo.do")
  );
  if (SKIP_REGIONAL) targets = targets.filter((l) => l.scope !== "regional");
  if (!FORCE) {
    targets = targets.filter((l) =>
      !l.depositManwon && !l.monthlyRentManwon && !l.salePriceManwon
    );
  }
  console.log(`mode: FORCE=${FORCE} SKIP_REGIONAL=${SKIP_REGIONAL}`);
  console.log(`targets: ${targets.length} / total ${listings.length}`);

  let updated = 0, noTable = 0, masked = 0, fail = 0;
  for (const [i, l] of targets.entries()) {
    const tag = `[${i + 1}/${targets.length}] ${l.id}`;
    try {
      const res = await fetch(l.sourceUrl, { headers: { "User-Agent": UA } });
      if (!res.ok) { fail++; continue; }
      const html = await res.text();
      const tables = extractTables(html);
      if (!tables.length) { noTable++; continue; }
      const agg = aggregateTables(tables);
      if (!agg) { masked++; continue; }

      // 표에 가격이 다 마스킹("공고문 확인") 이면 agg.depositMin/rentMin/saleAvg 모두 null
      if (agg.depositMin === null && agg.rentMin === null && agg.saleAvg === null) {
        masked++;
        continue;
      }

      // 만원 단위 변환 + 매물에 반영
      if (agg.depositMin !== null) l.depositManwon = Math.round(agg.depositMin / 10000);
      if (agg.rentMin !== null) l.monthlyRentManwon = Math.round(agg.rentMin / 10000);
      if (agg.saleAvg !== null) l.salePriceManwon = Math.round(agg.saleAvg / 10000);
      if (agg.areaMin && agg.areaMax) {
        l.area = agg.areaMin === agg.areaMax ? `${agg.areaMin}` : `${agg.areaMin}~${agg.areaMax}`;
      }
      if (agg.supplyUnits) l.supplyUnits = agg.supplyUnits;
      if (agg.houseTypes.length && !l.houseType) l.houseType = agg.houseTypes.join(", ");
      updated++;
      if (updated % 10 === 0) {
        console.log(`${tag} ✓ d=${l.depositManwon} r=${l.monthlyRentManwon} sale=${l.salePriceManwon}`);
      }
    } catch (e) {
      fail++;
      if (fail < 5) console.warn(`${tag} error: ${e.message}`);
    }
    await sleep(DELAY_MS);
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(listings, null, 2));
  console.log("---");
  console.log({ updated, noTable, masked, fail, total: targets.length });
  console.log(`saved → ${DATA_PATH}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
