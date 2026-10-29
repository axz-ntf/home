import { parseNumber, summarizeRows } from "./lh-data-quality.mjs";
const clean = s => s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
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

export function extractComplexTables(html) {
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
      const address = clean(segment.match(/소재지\s*:\s*([^<]+)/)?.[1] ?? "");
      result.push({ name, address, rows: tbls.flat(), lat: c?.lat ?? null, lng: c?.lng ?? null });
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
    const headers = [...(tbl.match(/<thead[^>]*>([\s\S]*?)<\/thead>/)?.[1] ?? "").matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m => clean(m[1]).replace(/\s/g, ""));
    const body = tbl.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
    const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m => {
      // 주택형은 th, 나머지는 td. 헤더 기준으로 읽어 열 추가/순서 변경을 방어한다.
      const cells = [...m[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/g)].map(c => clean(c[1]));
      if (/rowspan|colspan/.test(m[1])) return null;
      const value = re => { const i = headers.findIndex(h => re.test(h)); return i >= 0 ? cells[i] : undefined; };
      const area = parseNumber(value(/^전용면적/));
      if (!area || area > 1000) return null;
      return {
        houseType: value(/^주택형$/) || String(area), area,
        supplyTotal: parseNumber(value(/^세대수$/)),
        supplyThisRound: parseNumber(value(/^금회공급/)),
        deposit: isSale ? null : parseNumber(value(/^임대보증금/)),
        rent: isSale ? null : parseNumber(value(/^월임대료/)),
      };
    }).filter(Boolean);
    if (rows.length) out.push(rows);
  }
  return out;
}


export function applyComplexTables(listing, html) {
  const complexes = extractComplexTables(html);
  if (!complexes.length) return false;
  listing.complexes = complexes;
  Object.assign(listing, summarizeRows(complexes.flatMap(c => c.rows), listing.title));
  listing.priceSource = "lh-official-table";
  listing.priceUnverified = !complexes.every(c => c.rows.every(r => r.deposit != null && r.rent != null));
  // 이전 API1 오매칭의 건물 메타를 공식 주소와 섞지 않는다.
  listing.houseType = null; listing.pnu = null; listing.parkngCo = null;
  listing.complexName = complexes.length === 1 ? complexes[0].name : null;
  if (complexes.length === 1) {
    const c = complexes[0];
    listing.address = c.address || "";
    listing.lat = c.lat; listing.lng = c.lng;
    listing.geocoded = c.lat && c.lng ? "official-page" : "none";
  } else {
    // 하나의 핀에 서로 다른 단지의 가격을 붙이지 않는다. 어댑터가 단지별로 분리한다.
    listing.address = "";
    listing.lat = null; listing.lng = null;
  }
  const schedule = html.match(/<caption[^>]*>[^<]*공급일정[\s\S]*?<\/table>/)?.[0];
  if (schedule) {
    const headers = [...(schedule.match(/<thead[^>]*>([\s\S]*?)<\/thead>/)?.[1] ?? "").matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m => clean(m[1]));
    const index = headers.findIndex(h => /신청\s*일시/.test(h));
    const dates = [...(schedule.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? "").matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].flatMap(m => {
      const cells = [...m[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/g)].map(c => clean(c[1]));
      return [...(cells[index] ?? "").matchAll(/20\d{2}[.-]\d{2}[.-]\d{2}/g)].map(d => d[0].replace(/-/g, "."));
    }).sort();
    if (dates.length >= 2) { listing.beginDate = dates[0]; listing.deadline = dates.at(-1); }
  }
  listing.detailFetchedAt = new Date().toISOString();
  return true;
}
