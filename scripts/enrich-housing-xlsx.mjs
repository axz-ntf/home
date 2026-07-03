#!/usr/bin/env node
// 매입임대·든든전세 등 광역 공고의 "주택목록" xlsx 별첨 → 단지(주소) 단위 지도 핀 + 정확한 보증금.
// 공고 페이지에서 *주택목록*.xlsx 첨부를 찾아 다운로드 → zip 직접 파싱(의존성 0, unzip CLI 사용)
// → 주소 그룹핑 → Kakao/VWorld 지오코딩 → lib/mapped-regional.json 병합 (어댑터가 자동 렌더).
//
// 사용: node --env-file=.env.local scripts/enrich-housing-xlsx.mjs [--active] [--ids pid1,pid2] [--limit N] [--force]
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_FILE = path.join(ROOT, "lib/listings-api.json");
const MAPPED_FILE = path.join(ROOT, "lib/mapped-regional.json");
const PDF_BASE = "https://apply.lh.or.kr/lhapply/lhFile.do?fileid=";
const UA = "daum-public-housing-app/1.0 (housing-list sync)";
const KAKAO = process.env.KAKAO_REST_API_KEY?.replace(/^"|"$/g, "");
const VKEY = process.env.VWORLD_API_KEY?.replace(/^"|"$/g, "");
if (!KAKAO && !VKEY) { console.error("ERROR: KAKAO_REST_API_KEY/VWORLD_API_KEY 중 하나 필요"); process.exit(1); }

const args = process.argv.slice(2);
const ACTIVE = args.includes("--active");
const FORCE = args.includes("--force");
const LIMIT = Number(args.includes("--limit") ? args[args.indexOf("--limit") + 1] : 0);
const IDS = args.includes("--ids") ? new Set(args[args.indexOf("--ids") + 1].split(",")) : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const inKorea = (lat, lng) => lat > 33 && lat < 39 && lng > 124 && lng < 132;

// ── xlsx 파싱 (zip → sharedStrings/sheet1 XML, 의존성 0) ──
function parseXlsx(buf) {
  const tmp = path.join(os.tmpdir(), `hl-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
  try {
    fsSync.writeFileSync(tmp, buf);
    const read = (entry) => { try { return execSync(`unzip -p "${tmp}" "${entry}"`, { maxBuffer: 64 * 1024 * 1024 }).toString(); } catch { return ""; } };
    const ss = read("xl/sharedStrings.xml");
    const sheet = read("xl/worksheets/sheet*.xml"); // 모든 시트 이어붙여 파싱
    if (!sheet) return null;
    const strings = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
      [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"'));
    return [...sheet.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)].map((m) => {
      const cells = {};
      for (const c of m[2].matchAll(/<c r="([A-Z]+)\d+"(?:[^>]*t="(\w+)")?[^>]*>(?:[\s\S]*?<v>([\s\S]*?)<\/v>)?/g)) {
        cells[c[1]] = c[2] === "s" ? (strings[+c[3]] ?? "") : (c[3] ?? "");
      }
      return cells;
    });
  } finally { try { fsSync.unlinkSync(tmp); } catch {} }
}

// 헤더 행에서 컬럼 위치 탐지 → 데이터 행을 {addr, dep, rent}로
function extractUnits(rows) {
  let addrCol = null, depCol = null, rentCol = null, headerIdx = -1;
  rows.forEach((r, i) => {
    if (addrCol) return;
    for (const [col, v] of Object.entries(r)) {
      if (typeof v === "string" && /주소/.test(v) && !/주소지분/.test(v)) { addrCol = col; headerIdx = i; }
    }
    if (addrCol) for (const [col, v] of Object.entries(r)) {
      if (typeof v !== "string") continue;
      if (/보증금/.test(v)) depCol = col;
      else if (/임대료|월세/.test(v)) rentCol = col;
    }
  });
  if (!addrCol) return [];
  const toManwon = (v) => { const n = +String(v).replace(/[^\d.]/g, ""); if (!n) return null; return n >= 1e6 ? Math.round(n / 1e4) : Math.round(n); };
  return rows.slice(headerIdx + 1)
    .filter((r) => r[addrCol] && String(r[addrCol]).trim().length > 8)
    .map((r) => ({ addr: String(r[addrCol]).replace(/\s+/g, " ").trim(), dep: depCol ? toManwon(r[depCol]) : null, rent: rentCol ? toManwon(r[rentCol]) : null }));
}

// 주소 → {base(도로명까지), name(건물명, 동번호 제거)}
function splitAddr(addr) {
  const m = addr.match(/^(.+?(?:로|길|번길)\s*[\d-]+)\s*(.*)$/);
  const base = m ? m[1].trim() : addr.replace(/\s*\d+동\s*$/, "").trim();
  let name = (m ? m[2] : "").replace(/\s*\d+동\s*$/, "").replace(/[(){}[\]]/g, "").trim();
  return { base, name };
}

async function geocode(addr) {
  if (KAKAO) {
    try {
      const j = await (await fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(addr)}&size=1`, { headers: { Authorization: "KakaoAK " + KAKAO } })).json();
      const d = j.documents?.[0];
      if (d) { const lat = +d.y, lng = +d.x; if (inKorea(lat, lng)) return { lat, lng }; }
    } catch {}
  }
  if (VKEY) for (const type of ["ROAD", "PARCEL"]) {
    try {
      const j = await (await fetch(`https://api.vworld.kr/req/address?service=address&request=getcoord&version=2.0&crs=EPSG:4326&type=${type}&address=${encodeURIComponent(addr)}&key=${VKEY}`)).json();
      const p = j?.response?.result?.point;
      if (p && inKorea(+p.y, +p.x)) return { lat: +p.y, lng: +p.x };
    } catch {}
  }
  return null;
}

// ── 메인 ──
const listings = JSON.parse(await fs.readFile(API_FILE, "utf8"));
const mapped = JSON.parse(await fs.readFile(MAPPED_FILE, "utf8"));
let pool = listings.filter((l) => l.scope === "regional" && l.sourceUrl?.includes("selectWrtancInfo.do"));
if (ACTIVE) pool = pool.filter((l) => ["open", "upcoming", "closing"].includes(l.status));
if (IDS) pool = pool.filter((l) => IDS.has(l.pblancId));
// 이미 "단지 수준" 핀(label 보유)이 있으면 스킵. 시군 중심 근사 핀(label 없음)뿐이면 업그레이드 대상.
if (!FORCE) pool = pool.filter((l) => {
  const ex = mapped[l.pblancId];
  return !ex || !(ex.points || []).some((p) => p.label);
});
if (LIMIT > 0) pool = pool.slice(0, LIMIT);
console.log(`대상 공고: ${pool.length}건`);

const stats = { done: 0, noXlsx: 0, xlsOld: 0, parseFail: 0, geoFail: 0 };
for (const l of pool) {
  try {
    const html = await (await fetch(l.sourceUrl, { headers: { "User-Agent": UA } })).text();
    // 모든 xlsx 첨부를 파싱해보고 "주소 열이 있는" 파일만 채택 (파일명 휴리스틱에 의존하지 않음).
    // 주택목록이 지역별로 여러 파일에 나뉜 공고도 있어 전부 합침. 구형 .xls(바이너리)만 스킵.
    const atts = [...html.matchAll(/fileDownLoad\(\s*'(\d+)'\s*\)\s*[^>]*>([^<]+\.(xlsx|xls))/gi)]
      .map((m) => ({ id: m[1], name: m[2].trim(), ext: m[3].toLowerCase() }));
    if (!atts.length) { stats.noXlsx++; continue; }
    const units = [];
    for (const att of atts.slice(0, 6)) {
      if (att.ext === "xls") { stats.xlsOld++; console.log(`  △ ${l.pblancId} 구형 .xls 스킵 — ${att.name}`); continue; }
      try {
        const buf = Buffer.from(await (await fetch(PDF_BASE + att.id, { headers: { "User-Agent": UA } })).arrayBuffer());
        const rows = parseXlsx(buf);
        const got = rows ? extractUnits(rows) : [];
        if (got.length) { units.push(...got); console.log(`    · ${att.name} → ${got.length}호`); }
      } catch {}
      await sleep(150);
    }
    if (!units.length) { stats.parseFail++; console.log(`  ✗ ${l.pblancId} 주소열 있는 xlsx 없음 (첨부 ${atts.length}개)`); continue; }
    // 주소(도로명) 기준 그룹
    const groups = {};
    for (const u of units) {
      const { base, name } = splitAddr(u.addr);
      if (!groups[base]) groups[base] = { name, n: 0, deps: [], rents: [] };
      groups[base].n++;
      if (!groups[base].name && name) groups[base].name = name;
      if (u.dep) groups[base].deps.push(u.dep);
      if (u.rent) groups[base].rents.push(u.rent);
    }
    const points = [];
    for (const [base, g] of Object.entries(groups)) {
      const co = await geocode(base);
      await sleep(130);
      if (!co) { console.log(`    ✗ 지오코딩 실패: ${base}`); continue; }
      // null 은 MappedPoint 타입(number|undefined)과 충돌 → 값 있을 때만 키 포함
      const pt = { lat: co.lat, lng: co.lng, label: `${g.name || "매입임대 주택"} · ${g.n}호`, address: base };
      if (g.deps.length) pt.depositManwon = Math.min(...g.deps);
      if (g.rents.length) pt.rentManwon = Math.min(...g.rents);
      points.push(pt);
    }
    if (!points.length) { stats.geoFail++; continue; }
    const entry = { points };
    if (l.districtId) entry.districtId = l.districtId; // null 이면 생략 (MappedCfg: string|undefined)
    if (l.district) entry.district = l.district;
    mapped[l.pblancId] = entry;
    stats.done++;
    console.log(`  ✓ ${l.pblancId} ${points.length}개 단지 핀 (호실 ${units.length}) — ${(l.title || "").slice(0, 36)}`);
  } catch (e) { stats.parseFail++; console.log(`  ✗ ${l.pblancId} 오류: ${String(e.message).slice(0, 60)}`); }
  await sleep(200);
}
await fs.writeFile(MAPPED_FILE, JSON.stringify(mapped, null, 1) + "\n", "utf8");
console.log(`\n완료 — 핀 생성 ${stats.done} / 주택목록 없음 ${stats.noXlsx} / 구형xls ${stats.xlsOld} / 파싱실패 ${stats.parseFail} / 지오코딩실패 ${stats.geoFail}`);
console.log(`mapped-regional.json: ${Object.keys(mapped).length} entries`);
