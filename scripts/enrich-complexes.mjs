// LH 공고 페이지에서 단지별 "주택형 안내" 표를 추출해 매물에 complexes[] 로 저장.
// 한 공고에 여러 단지가 포함된 케이스 (시흥시 10년 공공임대 = 시흥목감 A-3 + A-4) 까지 분리.
// 단일 단지 매물도 같은 구조 (complexes 길이 1) 라 일관된 디테일 노출.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = path.join(ROOT, "lib/listings-api.json");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 daum-public-housing-app/1.0";
const DELAY_MS = 300;
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 5);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 페이지에서 단지 단위로 (제목 h4.tit2 + 직후 주택형 안내 표) 추출.
// 구조 예:
//   <h4 class="tit2 mgt0">시흥목감A-3(공임리츠) A-3</h4>
//   ...
//   <h4 class="tit2">주택형 안내(공공임대)</h4>
//   <table>...</table>
//   <h4 class="tit2 mgt0">시흥목감A-4(공임리츠) 1</h4>
//   <h4 class="tit2">주택형 안내(공공임대)</h4>
//   <table>...</table>
// 페이지 안의 lat_N / lng_N 변수를 인덱스 → 좌표 맵으로 모음.
function extractCoordMap(html) {
  const map = new Map();
  const re = /var\s+lat_(\d+)\s*=\s*"([\d.]+)"[\s\S]{0,200}?var\s+lng_\1\s*=\s*"([\d.]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const i = Number(m[1]);
    const lat = Number(m[2]);
    const lng = Number(m[3]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) map.set(i, { lat, lng });
  }
  return map;
}

function extractComplexTables(html) {
  const coords = extractCoordMap(html);
  const result = [];
  const splitRe = /<h4[^>]*class=["'][^"']*tit2[^"']*mgt0[^"']*["'][^>]*>([\s\S]*?)<\/h4>/g;
  const matches = [...html.matchAll(splitRe)];
  if (!matches.length) {
    const tbls = extractTablesFrom(html);
    if (tbls.length) {
      const c0 = coords.get(0);
      result.push({ name: null, rows: tbls.flat(), lat: c0?.lat ?? null, lng: c0?.lng ?? null });
    }
    return result;
  }
  for (let i = 0; i < matches.length; i++) {
    const name = matches[i][1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : html.length;
    const segment = html.slice(start, end);
    const tbls = extractTablesFrom(segment);
    if (tbls.length) {
      const c = coords.get(i);
      result.push({ name, rows: tbls.flat(), lat: c?.lat ?? null, lng: c?.lng ?? null });
    }
  }
  return result;
}

function extractTablesFrom(html) {
  const out = [];
  const re = /<h4[^>]*>\s*주택형\s*안내[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/g;
  let m;
  while ((m = re.exec(html))) {
    const tbl = m[1];
    // 분양 표는 "임대보증금/월임대료" 대신 "분양가격" 컬럼 → 보증금/월세 매핑 비활성.
    const isSale = /분양\s*가/.test(tbl) && !/임대보증금/.test(tbl);
    const rows = [...tbl.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
      .map((r) =>
        [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) =>
          c[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
        )
      )
      .map((cells) => parseRow(cells, isSale))
      .filter(Boolean);
    if (rows.length) out.push(rows);
  }
  return out;
}

// LH 주택형 안내 표 데이터행 실제 컬럼:
//   [전용면적(주택형), 세대수, 금회공급 세대수, (임대보증금|분양가)(원), 월임대료(원), 인터넷청약, 링크]
// 주택형 라벨 컬럼과 전용면적 컬럼은 데이터행에서 한 셀로 합쳐져 cells[0] 이 곧 전용면적.
function parseRow(cells, isSale = false) {
  if (cells.length < 4) return null;
  const area = Number(cells[0]);
  if (!Number.isFinite(area) || area <= 0) return null;
  const supply = parseNum(cells[1]);
  const supplyNow = parseNum(cells[2]);
  // 분양 표는 cells[3] 이 분양가 → 임대 보증금/월세로 쓰면 안 됨(null).
  const deposit = isSale ? null : parseNum(cells[3]); // 마스킹 시 "공고문 확인" → null
  const rent = isSale ? null : parseNum(cells[4]);
  return {
    houseType: cells[0],
    area,
    supplyTotal: supply,
    supplyThisRound: supplyNow,
    deposit,
    rent,
  };
}

function parseNum(s) {
  if (!s) return null;
  const n = Number(String(s).replace(/[^0-9]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function main() {
  const listings = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  // --active: 모집중/예정(마감 안 지난) 공고만. 마감건은 단지표 채워도 노출 안 돼 무의미.
  const ACTIVE = process.argv.includes("--active");
  const TODAY = new Date().toISOString().slice(0, 10).replace(/-/g, ".");
  const targets = listings.filter(
    (l) =>
      l.scope !== "regional" &&
      l.sourceUrl &&
      l.sourceUrl.includes("selectWrtancInfo.do") &&
      (!ACTIVE || ((l.status === "open" || l.status === "upcoming") && (l.deadline || "") >= TODAY))
  );
  console.log(`targets: ${targets.length} / total ${listings.length}`);

  let ok = 0, empty = 0, multi = 0, fail = 0;
  let nextIdx = 0;
  async function worker(wid) {
    while (true) {
      const i = nextIdx++;
      if (i >= targets.length) return;
      const l = targets[i];
      try {
        const res = await fetch(l.sourceUrl, { headers: { "User-Agent": UA } });
        if (!res.ok) { fail++; continue; }
        const html = await res.text();
        const complexes = extractComplexTables(html);
        if (!complexes.length) { empty++; continue; }
        l.complexes = complexes;
        ok++;
        if (complexes.length > 1) multi++;
        if (ok % 20 === 0) console.log(`[${i + 1}/${targets.length}] w${wid} ${l.id} ✓ ${complexes.length}개`);
      } catch (e) {
        fail++;
        if (fail < 5) console.warn(`[${i + 1}] w${wid} ${l.id} error: ${e.message}`);
      }
      await sleep(DELAY_MS);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, w) => worker(w + 1)));

  fs.writeFileSync(DATA_PATH, JSON.stringify(listings, null, 2));
  console.log("---");
  console.log({ ok, empty, multi, fail, total: targets.length });
}

main().catch((e) => { console.error(e); process.exit(1); });
