#!/usr/bin/env node
// SH 다지점(메가)공고 단지별 분리 — 행복주택 1차·장기전세·미리내집처럼 한 공고에
// 전 자치구 단지가 묶인 SH 공고를 단지별 핀으로. LH 의 extract-mapped-regional 과
// 같은 패턴(md → AI 단지목록 → VWorld 지오코딩)이되, 출력은 lib/sh-mapped.json 으로
// 분리해 sh-adapter 가 SH_PUBLIC_LISTINGS 에 전개한다.
//
// 사용: node --env-file=.env.local scripts/extract-sh-mapped.mjs [--ids seq1,seq2] [--force]
// 기본 대상: sh-notices.json 의 모집중 + 좌표없음(산재형·시단위) 공고.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AKEY = process.env.ANTHROPIC_API_KEY?.trim();
const VKEY = process.env.VWORLD_API_KEY;
const SKEY = (process.env.SOLAR_API_KEY ?? "").trim();
if (!AKEY || !VKEY || !SKEY) { console.error("ERROR: ANTHROPIC_API_KEY / VWORLD_API_KEY / SOLAR_API_KEY 필요"); process.exit(1); }

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36";
const DOC_PARSE_URL = "https://api.upstage.ai/v1/document-ai/document-parse";
const OUT_PATH = path.join(ROOT, "lib/sh-mapped.json");
const MD_DIR = path.join(ROOT, "lib/notice-texts");

const args = process.argv.slice(2);
const idArg = (args.find((a) => a.startsWith("--ids=")) || "").split("=")[1];
const FORCE = args.includes("--force");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const notices = JSON.parse(await fs.readFile(path.join(ROOT, "lib/sh-notices.json"), "utf8"));
let mapped = {};
try { mapped = JSON.parse(await fs.readFile(OUT_PATH, "utf8")); } catch { /* 첫 실행 */ }

// 대상: 모집중 + 제목 지오코딩 안 된(산재형·시단위) 공고. PDF 필수.
let pool = notices.filter((n) => !n.status.includes("마감") && !n.geocoded && n.pdfUrl);
if (idArg) { const ids = new Set(idArg.split(",")); pool = pool.filter((n) => ids.has(n.seq)); }
if (!FORCE) pool = pool.filter((n) => !(n.seq in mapped));

async function ensureMarkdown(n) {
  const mdPath = path.join(MD_DIR, `sh-${n.seq}.md`);
  try { return await fs.readFile(mdPath, "utf8"); } catch { /* 캐시 없음 — 파싱 */ }
  const pdfRes = await fetch(n.pdfUrl, { headers: { "User-Agent": UA, Referer: n.detailUrl ?? "https://www.i-sh.co.kr/" } });
  if (!pdfRes.ok) throw new Error(`PDF HTTP ${pdfRes.status}`);
  const buf = Buffer.from(await pdfRes.arrayBuffer());
  const form = new FormData();
  form.append("document", new Blob([buf], { type: "application/pdf" }), n.pdfName ?? "sh.pdf");
  form.append("output_formats", '["markdown"]');
  const r = await fetch(DOC_PARSE_URL, { method: "POST", headers: { Authorization: `Bearer ${SKEY}` }, body: form });
  if (!r.ok) throw new Error(`Doc Parse HTTP ${r.status}: ${(await r.text()).slice(0, 150)}`);
  const parsed = await r.json();
  const els = parsed.elements ?? [];
  const md = els
    .map((e) => e.content?.markdown || (e.content?.html ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
  await fs.writeFile(mdPath, md, "utf8");
  return md;
}

const SYSTEM = `한국 SH(서울주택도시공사) 모집공고문에서 "공급 대상 주택단지 목록"을 추출하는 전문가.
공급 단지(주택) 개요 표에서 각 단지의 이름·주소(자치구+동+번지 또는 도로명)·공급(모집) 세대수를 뽑아라.
임대조건 표가 있으면 단지별 대표(가장 작은 주택형) 임대보증금·월임대료를 원(KRW) 숫자 그대로 — 단, SH 표가 천원 단위면 원으로 환산(×1000)해서.
- 소득기준 예시·사무소·신청장소 주소는 제외. 실제 공급 단지만.
- 주소는 "서울특별시"부터 시작하게 보정.
- 단지가 매우 많으면 전부 나열 (생략 금지).
JSON만: {"complexes":[{"name":"단지명","address":"주소","units":<정수|null>,"depositWon":<원|null>,"rentWon":<원|null>}]}`;

async function aiComplexes(md) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": AKEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content: `공급 단지 목록 추출, JSON만:\n\n${md.slice(0, 120000)}` }],
    }),
  });
  if (!r.ok) throw new Error(`AI HTTP ${r.status}`);
  const j = await r.json();
  let t = j.content.map((c) => c.text || "").join("");
  const f = t.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (f) t = f[1];
  const o = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
  return Array.isArray(o.complexes) ? o.complexes : [];
}

// 수도권 포함 한국 범위 (장기전세는 서울+의정부 등 — 서울로만 막으면 누락).
const inKorea = (lat, lng) => lat > 33 && lat < 39 && lng > 124 && lng < 132;

// 단지명 POI 검색 — 유명 아파트는 건물 단위 정확. 자치구로 결과 검증.
async function poiSearch(name, gu) {
  const u = `https://api.vworld.kr/req/search?service=search&request=search&version=2.0&crs=EPSG:4326&size=5&query=${encodeURIComponent(name)}&type=place&format=json&key=${VKEY}`;
  try {
    const j = await (await fetch(u)).json();
    const items = j?.response?.result?.items ?? [];
    const hit = items.find((it) => {
      const ad = it.address?.road || it.address?.parcel || "";
      return gu ? ad.includes(gu) : true;
    }) || (gu ? null : items[0]);
    if (hit?.point && inKorea(+hit.point.y, +hit.point.x)) return { lat: +hit.point.y, lng: +hit.point.x };
  } catch { /* fallthrough */ }
  return null;
}

async function addrGeocode(addr) {
  for (const type of ["ROAD", "PARCEL"]) {
    const u = `https://api.vworld.kr/req/address?service=address&request=getcoord&version=2.0&crs=EPSG:4326&type=${type}&address=${encodeURIComponent(addr)}&key=${VKEY}`;
    try {
      const j = await (await fetch(u)).json();
      const p = j?.response?.result?.point;
      if (p && inKorea(+p.y, +p.x)) return { lat: +p.y, lng: +p.x };
    } catch { /* 다음 type */ }
  }
  return null;
}

// 단지명 POI(정밀) → 주소 지오코딩 순. gu 는 주소에서 추출한 자치구(POI 검증용).
async function geocode(name, addr) {
  const gu = (addr || "").match(/([가-힣]{1,4}구)\b/)?.[1] || (name || "").match(/([가-힣]{1,4}구)\b/)?.[1] || "";
  if (name) { const r = await poiSearch(name.replace(/\([^)]*\)/g, "").trim(), gu); if (r) return r; }
  if (addr) { const r = await addrGeocode(addr); if (r) return r; }
  return null;
}

// 가격 타당성 (extract-mapped-regional 과 동일 게이트). 전세형(장기전세)은 월세 0 허용.
function saneManwon(depositWon, rentWon) {
  const d = depositWon != null ? Math.round(depositWon / 10000) : null;
  const r = rentWon != null ? Math.round(rentWon / 10000) : null;
  const okD = d != null && d >= 50 && d <= 200000;
  const okR = r == null || r === 0 || (r >= 1 && r <= 150);
  if (!okD || !okR || (r != null && r >= d)) return { deposit: null, rent: null };
  return { deposit: d, rent: r };
}

console.log(`대상 SH 공고: ${pool.length}건\n`);
const stats = { split: 0, single: 0, err: 0 };
for (const n of pool) {
  let md;
  try { md = await ensureMarkdown(n); } catch (e) { stats.err++; console.log(`✗ sh-${n.seq} md실패: ${e.message}`); continue; }
  let complexes;
  try { complexes = await aiComplexes(md); } catch (e) { stats.err++; console.log(`✗ sh-${n.seq} AI실패: ${e.message}`); continue; }
  const points = [];
  const seen = new Set();
  for (const c of complexes) {
    if (!c.address && !c.name) continue;
    const co = await geocode(c.name, c.address);
    await sleep(120);
    if (!co) continue;
    // 단지명 기준 dedup — 같은 좌표(구 중심 충돌)라도 다른 단지면 유지. 같은 단지명만 1회.
    const key = (c.name || c.address || "").replace(/\s+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    const { deposit, rent } = saneManwon(c.depositWon, c.rentWon);
    points.push({
      lat: co.lat, lng: co.lng,
      ...(c.name && { label: c.name }),
      address: c.address,
      ...(c.units != null && { units: c.units }),
      ...(deposit != null && { depositManwon: deposit, rentManwon: rent ?? 0 }),
    });
  }
  if (points.length >= 2) {
    mapped[n.seq] = { points };
    stats.split++;
    console.log(`✓ sh-${n.seq} 다지점 ${points.length}곳 (추출 ${complexes.length}) — ${n.title.slice(0, 34)}`);
  } else {
    stats.single++;
    console.log(`— sh-${n.seq} 단지 ${complexes.length}·좌표 ${points.length} (분리 안함) — ${n.title.slice(0, 34)}`);
  }
  // 공고 단위 증분 저장 — 도중 kill 돼도 완료분은 보존(재실행 시 skip).
  await fs.writeFile(OUT_PATH, JSON.stringify(mapped, null, 2) + "\n", "utf8");
}

await fs.writeFile(OUT_PATH, JSON.stringify(mapped, null, 2) + "\n", "utf8");
console.log(`\n완료: 분리 ${stats.split} / 미분리 ${stats.single} / 에러 ${stats.err} → ${OUT_PATH}`);
