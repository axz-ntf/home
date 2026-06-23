#!/usr/bin/env node
// markdown (lib/notice-texts/{id}.md) 에서 모집세대수 + 임대조건 표를 정형 파싱.
// LH 50년임대·국민임대 표는 컬럼 구조가 표준. LLM 환각 회피 위해 결정론적 추출.
//
// 산출:
//   - lib/notice-supply/{id}.json — 주택형별 상세 (면적·보증금·월세)
//   - lib/listings-api.json 의 supplyUnits / deposit / rent / area 보강
//
// 사용:
//   node scripts/extract-supply-from-md.mjs [--limit N] [--force] [--id LISTING_ID]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TEXTS_DIR = path.join(ROOT, "lib/notice-texts");
const SUPPLY_DIR = path.join(ROOT, "lib/notice-supply");
const LISTINGS_PATH = path.join(ROOT, "lib/listings-api.json");

const args = process.argv.slice(2);
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  return i >= 0 ? Number(args[i + 1]) : Infinity;
})();
const FORCE = args.includes("--force");
const ONLY_ID = (() => {
  const i = args.indexOf("--id");
  return i >= 0 ? args[i + 1] : null;
})();

// "12,345,000" → 12345000.  실패 시 null.
function parseInt2(s) {
  if (!s) return null;
  const n = Number(String(s).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// markdown 표 한 줄 → 셀 배열. "| a | b | c |" → ["a", "b", "c"].
function splitRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((s) => s.trim());
}

// 표 본문 (header 다음, --- 다음) 의 데이터 행만 추출.
// markdown 의 표는 같은 헤더가 여러 줄 반복되는 경우 있어 (병합 셀 효과) 데이터로 보이지만 헤더인 행을 제외.
function isHeaderLikeRow(cells) {
  // 셀 중 하나라도 표 헤더 키워드 포함하면 헤더로 간주.
  const headerKeywords = [
    "주택형", "단지명", "임대보증금", "월임대료", "주거 전용", "전환가능", "보증금",
    "모집할", "예비자수", "구조", "비고", "최대전환", "주거공용",
  ];
  return cells.some((c) => headerKeywords.some((k) => c.includes(k)));
}

// 모집대상 표 추출 — 컬럼: 단지명/주택형/면적(여러)/건설호수/대기예비자/모집할예비자수
// 핵심: "모집할 예비자수" 헤더에 (XX) 형태로 통합 값 명시되면 그 값을 supplyTotal 로.
// 헤더 키워드: "모집할 예비자수" + "주택형"
function parseSupplyTable(md) {
  const lines = md.split("\n");
  const result = { supplyTotal: null, units: [], integrated: false };

  // "모집할 예비자수 (100)" 같이 헤더에 통합 숫자 박힌 케이스
  const integratedMatch = md.match(/모집할\s*예비자수\s*\(\s*([\d,]+)\s*\)/);
  if (integratedMatch) {
    result.supplyTotal = parseInt2(integratedMatch[1]);
    result.integrated = true;
  }

  // 표 영역 찾기 — 헤더에 (주택형/공급형별) + 모집 키워드.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("|")) continue;
    const cells = splitRow(line);
    if (!cells.some((c) => TYPE_HEADER_RE.test(c.trim()))) continue;
    if (!cells.some((c) => /모집/.test(c))) continue;

    // 헤더 발견. 컬럼 인덱스 매핑.
    const idx = {
      type: cells.findIndex((c) => TYPE_HEADER_RE.test(c.trim())),
      area: cells.findIndex((c) => c.includes("주거 전용") || c.includes("전용면적") || c.includes("주거전용") || c.includes("전용")),
      supply: cells.findIndex((c) => /모집할|모집세대|금회\s*모집|모집\s*호수/.test(c)),
    };

    // 하위 헤더 행 (병합셀의 두 번째 줄) 가 있을 수 있어 데이터까지 진행
    for (let j = i + 1; j < lines.length && lines[j].startsWith("|"); j++) {
      const row = splitRow(lines[j]);
      if (row.every((c) => c === "---" || c === "")) continue;
      if (isHeaderLikeRow(row)) {
        // 하위 헤더 — area 인덱스가 헤더 키워드로 더 정확히 잡힐 수도 있음
        const areaIdx = row.findIndex((c) => c.includes("주거 전용") || c === "주거전용");
        if (areaIdx >= 0 && idx.area < 0) idx.area = areaIdx;
        continue;
      }
      // 데이터 행
      const type = idx.type >= 0 ? row[idx.type] : null;
      const area = idx.area >= 0 ? Number(row[idx.area]) : null;
      const supply = idx.supply >= 0 ? parseInt2(row[idx.supply]) : null;
      if (type && /[\dA-Z]/i.test(type) && supply != null) {
        result.units.push({ type, area: Number.isFinite(area) ? area : null, supply });
      }
    }
    break; // 첫 표만 처리
  }

  // 통합 모집 표시 없고 행 단위 supply 있으면 합산
  if (result.supplyTotal == null && result.units.length > 0) {
    // 모든 행 supply 가 같으면 그게 통합 (LH 50년임대 패턴)
    const uniq = new Set(result.units.map((u) => u.supply));
    if (uniq.size === 1) {
      result.supplyTotal = result.units[0].supply;
      result.integrated = true;
    } else {
      result.supplyTotal = result.units.reduce((a, u) => a + u.supply, 0);
    }
  }

  return result;
}

// "주택형" / "공급형별" / "공급 형별" / "공급형별 (m2)" / "단지명(신청단위)" (매입임대) 매칭.
const TYPE_HEADER_RE = /^\s*(주택\s*형|공급\s*형별?|주택\s*유형|단지명)/;
// "월 임대료" / "월임대료" 공백 변형 매칭.
const RENT_HEADER_RE = /^월\s*임대료/;

// 임대조건 표 추출 — 헤더 두 줄 분석으로 컬럼 인덱스 동적 매핑.
// 표 변형: 컬럼 앞에 "번호" 추가, 단지명 생략, "(천원)" 단위, 가/나군 두 블록 등.
function parseRentTable(md) {
  const lines = md.split("\n");
  const result = []; // [{type, deposit, rent}]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("|")) continue;
    const cells = splitRow(line);
    const hasDeposit = cells.some((c) => c.includes("임대보증금"));
    const hasRent = cells.some((c) => RENT_HEADER_RE.test(c));
    if (!hasDeposit || !hasRent) continue;
    // type 헤더는 header1 또는 header2 어디든 OK (매입임대는 header2 의 "단지명").

    // 헤더 두 줄 수집 (상위 + 하위) — 같은 인덱스로 의미 매핑.
    const header1 = cells;
    // 다음 비-구분자(---) 헤더 라인 찾기
    let header2 = null;
    let dataStart = i + 1;
    for (let k = i + 1; k < lines.length && lines[k].startsWith("|"); k++) {
      const r = splitRow(lines[k]);
      if (r.every((c) => c === "---" || c === "")) continue;
      if (isHeaderLikeRow(r)) {
        header2 = r;
        dataStart = k + 1;
      } else {
        dataStart = k;
        break;
      }
    }

    // 단위 감지 — "(천원)" 명시 시 1000배 (천원→원).
    const unitMultiplier = (header1.some((c) => /\(천원\)/.test(c)) || (header2 || []).some((c) => /\(천원\)/.test(c))) ? 1000 : 1;

    // 컬럼 인덱스 찾기.
    // 주택형 / 공급형별 / 공급 형별 등 — header1 우선 (영구임대는 header1 에만 있음), 없으면 header2.
    const typeIdx = (() => {
      const i1 = header1.findIndex((c) => TYPE_HEADER_RE.test(c.trim()));
      if (i1 >= 0) return i1;
      return header2 ? header2.findIndex((c) => TYPE_HEADER_RE.test(c.trim())) : -1;
    })();

    // 월임대료: 첫 "월임대료" 셀 (가/나군 표는 가군이 첫 번째).
    const rentIdx = (() => {
      const h = header2 || header1;
      const i = h.findIndex((c) => RENT_HEADER_RE.test(c.trim()));
      if (i >= 0) return i;
      return header1.findIndex((c) => RENT_HEADER_RE.test(c.trim()));
    })();

    // 보증금-계: header2 에서 "계" 또는 "합계" 단독 셀. header1 의 같은 인덱스가 "임대보증금" 또는 "임대조건".
    const isTotalCell = (c) => /^(계|합계)$/.test(c.trim());
    const depositIdx = (() => {
      if (!header2) {
        return header1.findIndex((c) => isTotalCell(c) || c.includes("임대보증금"));
      }
      // header2 에서 "계"/"합계" 위치 + header1 의 같은 자리가 임대보증금/임대조건
      for (let idx = 0; idx < header2.length; idx++) {
        if (isTotalCell(header2[idx])) {
          const h1 = header1[idx] || "";
          if (h1.includes("임대보증금") || h1.includes("임대조건")) return idx;
        }
      }
      // fallback: 첫 "계"/"합계"
      return header2.findIndex(isTotalCell);
    })();

    if (typeIdx < 0 || depositIdx < 0 || rentIdx < 0) {
      break; // 헤더 못 잡으면 종료
    }

    // 데이터 행 파싱.
    for (let j = dataStart; j < lines.length && lines[j].startsWith("|"); j++) {
      const row = splitRow(lines[j]);
      if (row.every((c) => c === "---" || c === "")) continue;
      if (isHeaderLikeRow(row)) continue;
      const type = row[typeIdx];
      const deposit = parseInt2(row[depositIdx]);
      const rent = parseInt2(row[rentIdx]);
      // type 컬럼이 비어있지 않으면 데이터 행 (헤더는 isHeaderLikeRow 가 걸름).
      // 매입임대 단지명("일동미라주") / 일반 주택형("37A") 모두 허용.
      if (type && type.trim() && deposit != null && rent != null) {
        result.push({ type: type.trim(), deposit: deposit * unitMultiplier, rent: rent * unitMultiplier });
      }
    }
    break;
  }

  return result;
}

async function main() {
  await fs.mkdir(SUPPLY_DIR, { recursive: true });
  const listings = JSON.parse(await fs.readFile(LISTINGS_PATH, "utf8"));

  // active 한 매물만 (closed 도 데이터 보강 의미 있지만 우선 active)
  const targets = listings.filter((l) => {
    if (ONLY_ID && l.id !== ONLY_ID) return false;
    return l.status !== "closed";
  });

  let ok = 0, skip = 0, miss = 0, err = 0;
  const updates = [];

  for (let i = 0; i < Math.min(targets.length, LIMIT); i++) {
    const l = targets[i];
    const mdPath = path.join(TEXTS_DIR, `${l.id}.md`);
    try {
      await fs.access(mdPath);
    } catch {
      miss++;
      continue;
    }

    try {
      const md = await fs.readFile(mdPath, "utf8");
      const supply = parseSupplyTable(md);
      const rents = parseRentTable(md);

      // 어느 것도 못 뽑으면 skip
      if (supply.supplyTotal == null && rents.length === 0) {
        skip++;
        continue;
      }

      // 주택형별 결합 — supply 정보 (area, supply) + rent 정보 (deposit, rent).
      const byType = {};
      for (const u of supply.units) byType[u.type] = { type: u.type, area: u.area, supply: u.supply };
      for (const r of rents) byType[r.type] = { ...(byType[r.type] || { type: r.type }), deposit: r.deposit, rent: r.rent };
      const units = Object.values(byType);

      const detail = {
        id: l.id,
        supplyTotal: supply.supplyTotal,
        integrated: supply.integrated,
        units,
      };

      const outPath = path.join(SUPPLY_DIR, `${l.id}.json`);
      await fs.writeFile(outPath, JSON.stringify(detail, null, 2) + "\n", "utf8");

      // 최소 평형 기준 대표값 — LH 공고문 표시 관례 (가장 작은 평수의 임대조건이 기준선).
      // 타당성 가드: 병합셀·면적 숫자를 가격으로 오인한 비정상값(예: 월세 678조원) 차단.
      // 보증금 ≤20억, 월세 ≤500만 (공공임대 현실 범위) 벗어나면 제외.
      const WON_DEP_MAX = 2_000_000_000; // 20억
      const WON_RENT_MAX = 5_000_000; // 월 500만
      const sorted = units
        .filter((u) => u.deposit != null && u.rent != null)
        .filter((u) => u.deposit > 0 && u.deposit <= WON_DEP_MAX && u.rent >= 0 && u.rent <= WON_RENT_MAX)
        .sort((a, b) => (a.area ?? Infinity) - (b.area ?? Infinity));
      const rep = sorted[0];
      const depositManwon = rep ? Math.round(rep.deposit / 10000) : null;
      const rentManwon = rep ? Math.round(rep.rent / 10000) : null;

      // 유형별 보증금/월세 min~max (만원) — min≠max 면 카드·상세에 범위로 표시.
      const depVals = sorted.map((u) => Math.round(u.deposit / 10000));
      const rentVals = sorted.map((u) => Math.round(u.rent / 10000));
      const depositRange = depVals.length ? [Math.min(...depVals), Math.max(...depVals)] : null;
      const rentRange = rentVals.length ? [Math.min(...rentVals), Math.max(...rentVals)] : null;

      // 세대수 가드: 면적(소수)·병합셀 합산으로 깨진 값 차단. 정수 1~10만만 허용.
      const supplyUnitsSafe =
        Number.isInteger(supply.supplyTotal) && supply.supplyTotal >= 1 && supply.supplyTotal <= 100000
          ? supply.supplyTotal
          : null;

      updates.push({
        id: l.id,
        supplyUnits: supplyUnitsSafe,
        deposit: depositManwon,
        rent: rentManwon,
        depositRange,
        rentRange,
        units, // detail-panel 의 단지별 공급 정보 표용
      });
      ok++;
    } catch (e) {
      err++;
      console.error(`  ERR ${l.id}: ${e.message}`);
    }
  }

  // listings-api 보강 — markdown(PDF) 값이 ground truth. 기본은 빈 값만 채우되,
  // --force 면 기존 값 덮어씀 (정렬·파싱 로직 개선 시 재정정 위함).
  let patched = 0;
  for (const u of updates) {
    const item = listings.find((l) => l.id === u.id);
    if (!item) continue;
    let changed = false;
    if (u.supplyUnits != null && (FORCE || item.supplyUnits == null || item.supplyUnits === 1)) {
      if (item.supplyUnits !== u.supplyUnits) { item.supplyUnits = u.supplyUnits; changed = true; }
    }
    if (item.type !== "sale") {
      if (u.deposit != null && (FORCE || item.deposit == null || item.deposit === 0)) {
        if (item.deposit !== u.deposit) { item.deposit = u.deposit; changed = true; }
      }
      if (u.rent != null && (FORCE || item.rent == null || item.rent === 0)) {
        if (item.rent !== u.rent) { item.rent = u.rent; changed = true; }
      }
      // 가격 범위 — min≠max 면 저장(카드·상세 범위 표시용), 단일이면 제거.
      const dr = u.depositRange && u.depositRange[0] !== u.depositRange[1] ? u.depositRange : null;
      const rr = u.rentRange && u.rentRange[0] !== u.rentRange[1] ? u.rentRange : null;
      if (JSON.stringify(item.depositRange ?? null) !== JSON.stringify(dr)) { if (dr) item.depositRange = dr; else delete item.depositRange; changed = true; }
      if (JSON.stringify(item.rentRange ?? null) !== JSON.stringify(rr)) { if (rr) item.rentRange = rr; else delete item.rentRange; changed = true; }
    }
    // complexes 비어있고 units 있으면 detail-panel 의 단지별 공급 정보 표용으로 채움.
    if ((!item.complexes || item.complexes.length === 0) && u.units && u.units.length > 0) {
      item.complexes = [{
        name: null,
        rows: u.units
          .slice()
          .sort((a, b) => (a.area ?? Infinity) - (b.area ?? Infinity))
          .map((un) => ({
            houseType: String(un.area ?? un.type),
            supplyTotal: un.supply ?? null,
            deposit: un.deposit ?? null,
            rent: un.rent ?? null,
          })),
      }];
      changed = true;
    } else if (item.complexes && item.complexes.length > 0 && u.units && u.units.length > 0) {
      // complexes 이미 있고 rows 채워져 있는데 deposit/rent 만 null 인 경우 — 보강.
      // 매칭: houseType (= 면적 string) ↔ unit.area. 같은 면적이 여러 개면 순서대로.
      for (const c of item.complexes) {
        if (!c.rows) continue;
        for (const r of c.rows) {
          if (r.deposit != null && r.rent != null) continue;
          // 같은 area 의 unit 찾기 (먼저 안 매칭된 것 우선)
          const targetArea = parseFloat(r.houseType);
          const match = u.units.find((un) => un._consumed !== true && Math.abs((un.area ?? -1) - targetArea) < 0.01 && un.deposit != null);
          if (match) {
            if (r.deposit == null && match.deposit != null) { r.deposit = match.deposit; changed = true; }
            if (r.rent == null && match.rent != null) { r.rent = match.rent; changed = true; }
            match._consumed = true;
          }
        }
      }
    }
    if (changed) patched++;
  }

  await fs.writeFile(LISTINGS_PATH, JSON.stringify(listings, null, 2) + "\n", "utf8");

  console.log(`\n완료: ok=${ok} patched=${patched} skip=${skip} miss=${miss} err=${err} / 대상 ${targets.length}건`);
}

main().catch((e) => { console.error(e); process.exit(1); });
