#!/usr/bin/env node
// 매입임대·든든전세 등 광역 공고의 "주택목록" 별첨(xlsx 우선, 없으면 PDF) → 단지 단위 지도 핀 + 실보증금.
// 공고 첨부 중 주소 열이 있는 xlsx 를 zip 직접 파싱(의존성 0). xlsx 없으면 주택목록 PDF 를 Solar 로 파싱.
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
const SOLAR = process.env.SOLAR_API_KEY?.replace(/^"|"$/g, ""); // 주택목록 PDF 파싱용(없으면 PDF 폴백 skip)
const DOC_PARSE_URL = "https://api.upstage.ai/v1/document-ai/document-parse";
if (!process.argv.includes("--data-only") && !KAKAO && !VKEY) { console.error("ERROR: KAKAO_REST_API_KEY/VWORLD_API_KEY 중 하나 필요"); process.exit(1); }

const args = process.argv.slice(2);
const ACTIVE = args.includes("--active");
const FORCE = args.includes("--force");
// --data-only: 지오코딩·지도 핀 생성 없이 주택목록 집계(housing-groups.json)만 갱신.
// 상세 패널 "공급 주택" 표시용 — 지도 매물 수에 영향 없음 (T-004 1단계).
const DATA_ONLY = args.includes("--data-only");
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
      // 각 셀을 </c> 또는 self-close(/>) 경계로 정확히 끊음 — 빈 셀 뒤 값 셀을 삼키는 버그 방지.
      for (const c of m[2].matchAll(/<c r="([A-Z]+)\d+"(?:[^>]*?t="([^"]+)")?[^>]*?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const inner = c[3] || "";
        const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        cells[c[1]] = v == null ? "" : (c[2] === "s" ? (strings[+v] ?? "") : v);
      }
      return cells;
    });
  } finally { try { fsSync.unlinkSync(tmp); } catch {} }
}

// 헤더 행에서 컬럼 위치 탐지 → 데이터 행을 {addr, dep, rent}로
// 보증금: 원 단위(1억1520만=115200000)면 만원으로, 이미 만원 단위면 그대로.
const toManwon = (v) => { const n = +String(v).replace(/[^\d.]/g, ""); if (!n) return null; return n >= 1e6 ? Math.round(n / 1e4) : Math.round(n); };
// 월세: 원 단위(예 126,660원)면 만원으로. 1,000 미만이면 이미 만원 단위로 간주(월세 현실 범위 1~300만).
const toRentManwon = (v) => { const n = +String(v).replace(/[^\d.]/g, ""); if (!n) return null; return n >= 1000 ? Math.round(n / 1e4) : Math.round(n); };
const looksAddr = (s) => typeof s === "string" && s.length > 8 && /(특별시|광역시|특별자치|[가-힣]+(시|군|구))/.test(s) && /[로길]\s*\d/.test(s);

function extractUnits(rows) {
  let addrCol = null, depCol = null, rentCol = null, headerIdx = -1;
  rows.forEach((r, i) => {
    if (addrCol) return;
    for (const [col, v] of Object.entries(r)) {
      if (typeof v === "string" && /주소/.test(v) && !/주소지분/.test(v)) { addrCol = col; headerIdx = i; }
    }
  });
  if (!addrCol) return [];
  // 보증금/월세 헤더는 병합 셀 때문에 주소 헤더와 다른 행에 있을 수 있음
  // (예: 든든전세 주택목록 — 1행 "임대보증금", 2행 "주소") → 헤더 영역 전체에서 탐지.
  for (const r of rows.slice(0, headerIdx + 2)) {
    for (const [col, v] of Object.entries(r)) {
      if (typeof v !== "string") continue;
      if (!depCol && /보증금/.test(v)) depCol = col;
      else if (!rentCol && /임대료|월세/.test(v)) rentCol = col;
    }
  }
  return rows.slice(headerIdx + 1)
    .filter((r) => r[addrCol] && String(r[addrCol]).trim().length > 8)
    .map((r) => ({ addr: String(r[addrCol]).replace(/\s+/g, " ").trim(), dep: depCol ? toManwon(r[depCol]) : null, rent: rentCol ? toRentManwon(r[rentCol]) : null }));
}

// 시도명 → districtId (지도 클러스터 소속). 주소 첫 토큰으로 판정.
const SIDO_ID = { 서울특별시: "seoul", 경기도: "gyeonggi", 인천광역시: "incheon", 부산광역시: "busan", 대구광역시: "daegu", 광주광역시: "gwangju", 대전광역시: "daejeon", 울산광역시: "ulsan", 세종특별자치시: "sejong", 강원특별자치도: "gangwon", 강원도: "gangwon", 충청북도: "chungbuk", 충청남도: "chungnam", 전북특별자치도: "jeonbuk", 전라북도: "jeonbuk", 전라남도: "jeonnam", 경상북도: "gyeongbuk", 경상남도: "gyeongnam", 제주특별자치도: "jeju" };
function sidoOf(addr) { const s = (addr || "").split(/\s+/)[0]; return SIDO_ID[s] ? { district: s, districtId: SIDO_ID[s] } : null; }

// 주소 → 시군구 키 ("충청북도 음성군", "광주광역시 광산구", "경기도 안양시 만안구")
function sigunguKey(addr) {
  const t = addr.split(/\s+/);
  const sido = t[0] || "";
  // 광역시/특별시: 시도 + 구/군, 도: 시/군 (+구 있으면 포함)
  const gu = t.find((x) => /[가-힣]구$/.test(x));
  const si = t.find((x) => /[가-힣](시|군)$/.test(x));
  if (/(특별시|광역시|특별자치시)/.test(sido)) return gu ? `${sido} ${gu}` : sido;
  if (si && gu) return `${sido} ${si} ${gu}`;
  if (si) return `${sido} ${si}`;
  return sido || null;
}

// 주소 → {base(도로명까지), name(건물명, 동번호 제거)}
function splitAddr(addr) {
  // "…로 12" / "…길 37" / "…로12번길 37" / "…로14길 42" 까지 도로명+번호를 base 로, 나머지를 건물명으로.
  const m = addr.match(/^(.+?[로길]\s*[\d-]+(?:\s*번?길\s*[\d-]+)?)\s*(.*)$/);
  const base = m ? m[1].trim() : addr.replace(/\s*\d+동\s*$/, "").trim();
  let name = (m ? m[2] : "").replace(/\s*\d+동\s*$/, "").replace(/[(){}[\]]/g, "").trim();
  // 건물명 정리: "괴전동,안심역아이센스 괴전동 660번지" → "안심역아이센스" (콤마 뒤 채택 + 지번 꼬리 제거)
  if (name.includes(",")) name = name.split(",").pop().trim();
  name = name.replace(/\s*[가-힣]+\s*\d+(-\d+)?번지\s*$/, "").trim();
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

// ── 주택목록 PDF 파싱 (Solar Document Parse → 마크다운 표 → units) ──
async function pdfToUnits(buf, filename) {
  if (!SOLAR) return [];
  const form = new FormData();
  form.append("document", new Blob([buf], { type: "application/pdf" }), filename);
  form.append("output_formats", '["markdown"]');
  const r = await fetch(DOC_PARSE_URL, { method: "POST", headers: { Authorization: `Bearer ${SOLAR}` }, body: form });
  if (!r.ok) throw new Error(`Solar HTTP ${r.status}`);
  const j = await r.json();
  const md = j.content?.markdown || j.markdown || "";
  return mdToUnits(md);
}
// 마크다운 표 행에서 주소/보증금/월세 추출. 헤더에 "주소"가 없으면 주소처럼 생긴 열을 자동 선택.
function mdToUnits(md) {
  const rowsRaw = md.split("\n").filter((l) => /^\s*\|.*\|\s*$/.test(l) && !/^\s*\|[\s|:-]+\|\s*$/.test(l));
  const cells = (l) => l.split("|").slice(1, -1).map((c) => c.trim());
  const table = rowsRaw.map(cells).filter((c) => c.length >= 2);
  if (!table.length) return [];
  const ncol = Math.max(...table.map((c) => c.length));
  // 헤더 기반 열 탐지
  let addrI = -1, depI = -1, rentI = -1, headerRow = -1;
  table.forEach((c, i) => {
    if (addrI >= 0) return;
    c.forEach((v, j) => { if (/주소/.test(v) && !/지분/.test(v)) { addrI = j; headerRow = i; } });
    if (addrI >= 0) c.forEach((v, j) => { if (/보증금/.test(v)) depI = j; else if (/임대료|월세/.test(v)) rentI = j; });
  });
  // 헤더에 주소 없으면: 열별로 주소처럼 생긴 셀 비율이 가장 높은 열 채택
  if (addrI < 0) {
    let best = -1, bestScore = 0;
    for (let j = 0; j < ncol; j++) {
      const score = table.filter((c) => looksAddr(c[j])).length;
      if (score > bestScore) { bestScore = score; best = j; }
    }
    if (bestScore < 2) return [];
    addrI = best; headerRow = -1;
  }
  const out = [];
  table.slice(headerRow + 1).forEach((c) => {
    const addr = c[addrI] || "";
    if (!looksAddr(addr)) return;
    out.push({ addr: addr.replace(/\s+/g, " ").trim(), dep: depI >= 0 ? toManwon(c[depI]) : null, rent: rentI >= 0 ? toRentManwon(c[rentI]) : null });
  });
  return out;
}

// ── 메인 ──
const HOUSING_FILE = path.join(ROOT, "lib/housing-groups.json");
const listings = JSON.parse(await fs.readFile(API_FILE, "utf8"));
const mapped = JSON.parse(await fs.readFile(MAPPED_FILE, "utf8"));
let housing = {};
try { housing = JSON.parse(await fs.readFile(HOUSING_FILE, "utf8")); } catch {}
let pool = listings.filter((l) => l.scope === "regional" && l.sourceUrl?.includes("selectWrtancInfo.do"));
if (ACTIVE) pool = pool.filter((l) => ["open", "upcoming", "closing"].includes(l.status));
if (IDS) pool = pool.filter((l) => IDS.has(l.pblancId));
if (!FORCE) {
  pool = DATA_ONLY
    ? pool.filter((l) => !(l.pblancId in housing)) // 집계 이미 있으면 스킵 (증분)
    : pool.filter((l) => {
        // 이미 "단지 수준" 핀(label 보유)이 있으면 스킵. 시군 중심 근사 핀(label 없음)뿐이면 업그레이드 대상.
        const ex = mapped[l.pblancId];
        return !ex || !(ex.points || []).some((p) => p.label);
      });
}
if (LIMIT > 0) pool = pool.slice(0, LIMIT);
console.log(`대상 공고: ${pool.length}건`);

const stats = { done: 0, noXlsx: 0, xlsOld: 0, parseFail: 0, geoFail: 0 };
for (const l of pool) {
  try {
    const html = await (await fetch(l.sourceUrl, { headers: { "User-Agent": UA } })).text();
    // 첨부 전체 수집(xlsx/xls/pdf). 주소 열 있는 파일만 내용으로 채택 — 파일명 휴리스틱에 의존하지 않음.
    const atts = [...html.matchAll(/fileDownLoad\(\s*'(\d+)'\s*\)\s*[^>]*>([^<]+\.(xlsx|xls|pdf))/gi)]
      .map((m) => ({ id: m[1], name: m[2].trim(), ext: m[3].toLowerCase() }));
    if (!atts.length) { stats.noXlsx++; continue; }
    const units = [];
    // 1순위: xlsx (정형, 무료·빠름·의존성0)
    for (const att of atts.filter((a) => a.ext === "xlsx").slice(0, 6)) {
      try {
        const buf = Buffer.from(await (await fetch(PDF_BASE + att.id, { headers: { "User-Agent": UA } })).arrayBuffer());
        const got = parseXlsx(buf) ? extractUnits(parseXlsx(buf)) : [];
        if (got.length) { units.push(...got); console.log(`    · [xlsx] ${att.name} → ${got.length}호`); }
      } catch {}
      await sleep(150);
    }
    // 2순위: xlsx 로 못 얻었으면 주택목록 PDF 를 Solar 로 파싱 (공고문/QnA 제외)
    const tryPdfs = async (cands, tag) => {
      for (const att of cands) {
        try {
          const buf = Buffer.from(await (await fetch(PDF_BASE + att.id, { headers: { "User-Agent": UA } })).arrayBuffer());
          const got = await pdfToUnits(buf, att.name);
          if (got.length) { units.push(...got); console.log(`    · [${tag}] ${att.name} → ${got.length}호`); }
        } catch (e) { console.log(`    · [${tag}] ${att.name} 파싱 실패: ${String(e.message).slice(0, 40)}`); }
        await sleep(200);
      }
    };
    if (!units.length && SOLAR) {
      const pdfs = atts.filter((a) => a.ext === "pdf" && /(주택\s*목록|주택리스트|공급대상|공급주택)/.test(a.name.replace(/\s/g, "")) && !/공고문|QnA|Q&A|양식|서식/i.test(a.name));
      await tryPdfs(pdfs.slice(0, 4), "pdf");
    }
    // 3순위(최후): 별도 주택목록 첨부가 없는 공고(매입임대 예비입주자 등)는 공고문 PDF
    // 본문에 주택목록 표가 들어 있음 → 공고문 자체를 파싱 (팜플렛·양식류 제외).
    if (!units.length && SOLAR) {
      const rest = atts.filter((a) => a.ext === "pdf" && !/팜플렛|양식|서식|동의|안내문|QnA|Q&A|체크리스트/i.test(a.name));
      await tryPdfs(rest.slice(0, 2), "공고문");
    }
    if (!units.length) { stats.parseFail++; console.log(`  ✗ ${l.pblancId} 주택목록 추출 실패 (첨부 ${atts.length}개)`); continue; }
    // 주소(도로명) 기준 그룹
    const addrGroups = {};
    for (const u of units) {
      const { base, name } = splitAddr(u.addr);
      if (!addrGroups[base]) addrGroups[base] = { name, n: 0, deps: [], rents: [] };
      addrGroups[base].n++;
      if (!addrGroups[base].name && name) addrGroups[base].name = name;
      // 현실 범위만 채택 — 원↔만원 단위 혼재/PDF 컬럼 오정렬로 튄 값 방어(보증금 10만~5억, 월세 0~300만)
      if (u.dep && u.dep >= 10 && u.dep <= 50000) addrGroups[base].deps.push(u.dep);
      if (u.rent && u.rent > 0 && u.rent <= 300) addrGroups[base].rents.push(u.rent);
    }
    // 흩어진 매입임대(빌라 수백 채)는 주소별로 쪼개면 매물 수가 폭증 → 시군구 단위로 묶음.
    // 소수 단지(아파트 등, 12곳 이하)만 주소별 정밀 핀 유지.
    let groups;
    if (Object.keys(addrGroups).length > 12) {
      groups = {};
      for (const [addr, g] of Object.entries(addrGroups)) {
        const sgg = sigunguKey(addr); // "충청북도 음성군" / "광주광역시 광산구"
        const key = sgg || addr;
        if (!groups[key]) groups[key] = { name: "", n: 0, deps: [], rents: [], sigungu: true };
        groups[key].n += g.n;
        groups[key].deps.push(...g.deps);
        groups[key].rents.push(...g.rents);
      }
    } else {
      groups = addrGroups;
    }
    // 공고 유형별 라벨 접미어 (제목 기반).
    const kind = /든든전세/.test(l.title || "") ? "든든전세"
      : /기숙사/.test(l.title || "") ? "기숙사"
      : "매입임대";
    // 주택목록 집계 저장 — 상세 패널 "공급 주택" 표 + 카드 보증금 범위용 (지도와 무관).
    housing[l.pblancId] = {
      kind,
      unitsTotal: units.length,
      groups: Object.entries(groups).map(([key, g]) => ({
        label: g.sigungu ? key : (g.name || key),
        units: g.n,
        depMin: g.deps.length ? Math.min(...g.deps) : null,
        depMax: g.deps.length ? Math.max(...g.deps) : null,
        rentMin: g.rents.length ? Math.min(...g.rents) : null,
        rentMax: g.rents.length ? Math.max(...g.rents) : null,
      })),
    };
    if (DATA_ONLY) {
      stats.done++;
      console.log(`  ✓ ${l.pblancId} 집계 ${Object.keys(groups).length}그룹 (호실 ${units.length}) — ${(l.title || "").slice(0, 36)}`);
      continue;
    }
    const points = [];
    for (const [key, g] of Object.entries(groups)) {
      const co = await geocode(key);
      await sleep(130);
      if (!co) { console.log(`    ✗ 지오코딩 실패: ${key}`); continue; }
      // 시군구 묶음이면 "○○구 든든전세 · N호", 단지면 "건물명 · N호"
      const label = g.sigungu ? `${key.split(" ").pop()} ${kind} · ${g.n}호` : `${g.name || kind + " 주택"} · ${g.n}호`;
      const pt = { lat: co.lat, lng: co.lng, label, address: key };
      const sd = sidoOf(key); // 핀별 실제 시도 (모 공고의 '대구경북 외' 상속 방지)
      if (sd) { pt.district = sd.district; pt.districtId = sd.districtId; }
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
await fs.writeFile(HOUSING_FILE, JSON.stringify(housing, null, 1) + "\n", "utf8");
console.log(`housing-groups.json: ${Object.keys(housing).length} entries`);
if (!DATA_ONLY) {
  await fs.writeFile(MAPPED_FILE, JSON.stringify(mapped, null, 1) + "\n", "utf8");
  console.log(`mapped-regional.json: ${Object.keys(mapped).length} entries`);
}
console.log(`\n완료 — 처리 ${stats.done} / 주택목록 없음 ${stats.noXlsx} / 구형xls ${stats.xlsOld} / 파싱실패 ${stats.parseFail} / 지오코딩실패 ${stats.geoFail}`);
