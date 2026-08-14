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
import { streamText } from "ai";
import { aiModel, hasAiKey } from "./lib/ai-provider.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VKEY = process.env.VWORLD_API_KEY;
const SKEY = (process.env.SOLAR_API_KEY ?? "").trim();  // 문서파싱(Upstage document-parse)용 — 추출 모델과 별개
// 최난도 경로: 입력 12만자 · 출력 48k 토큰 · 수백 단지 → Opus.
const MODEL = process.env.EXTRACT_MODEL ?? "claude-opus-5";
if (!hasAiKey(MODEL) || !VKEY || !SKEY) { console.error(`ERROR: SOLAR_API_KEY(문서파싱) / VWORLD_API_KEY / ${MODEL} 용 API 키 필요`); process.exit(1); }

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

// 대상: 모집중 + PDF 있는 모든 SH 공고. 단일 위치(제목 지오코딩된) 공고도 PDF 를 열어
// 주소·가격·면적·접수일정을 뽑는다 (이전엔 !geocoded 로 제목 지오코딩분을 빼서 9건이 샜음).
let pool = notices.filter((n) => !n.status.includes("마감") && n.pdfUrl);
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

const SYSTEM = `한국 SH(서울주택도시공사) 모집공고문에서 "공급 대상 주택단지 목록"과 "접수 일정"을 추출하는 전문가.
공급 단지(주택) 개요 표에서 각 단지의 이름·주소(자치구+동+번지 또는 도로명)·공급(모집) 세대수를 뽑아라.
임대조건 표가 있으면 단지별 임대보증금·월임대료의 **최소·최대**(여러 주택형 중 가장 싼 것·비싼 것)를 원(KRW) 숫자로 — 단, SH 표가 천원 단위면 원으로 환산(×1000)해서. 주택형이 하나뿐이면 min=max.
전용면적(㎡)도 단지별 **최소·최대**를 숫자로 (㎡ 단위, 소수 1자리까지. 평이면 ×3.3058 환산). 하나뿐이면 min=max.
★중요★ 각 단지의 **주택형 목록(types)은 반드시 채워라** — SH 매입임대는 주택형(예: 25B·27B·30A·35A) 단위로 신청하므로 상세화면 드롭다운에 쓴다. 공급대상주택 개요표는 같은 단지(같은 단지명/주소)가 주택형마다 여러 행으로 나뉘어 있다 — 그 행들을 단지별로 묶어 types 배열을 만들어라. 단지가 125개든 200개든 전부, 빠짐없이.
types 각 항목: name(주택형 코드 그대로, 예 "25B" — 표의 '주택형' 칸 값), units(그 행의 '공급호수' 정수. 없으면 null), areaM2(주택형 코드 앞 숫자가 곧 대략 전용면적이다. "25B"→25, "30A"→30. 명시 면적이 따로 있으면 그 값. 없으면 null), depositWon(주택형별 보증금 원. 없으면 null), rentWon(주택형별 월임대료 원. 없으면 null).
한 단지에 주택형이 하나뿐이면 types 도 1개. 주택형 칸이 아예 없는 공고만 빈 배열 [].
접수(청약) 기간은 공고 전체 공통이므로 최상위에 applyBegin(접수 시작일)·applyEnd(접수 마감일)로 한 번만 — "YYYY.MM.DD" 형식. 못 찾으면 null.
당첨자(서류제출대상자/예비입주자) 발표일도 공고 공통이므로 최상위에 winnerAt 으로 — "YYYY.MM.DD" 형식. 순위·차수별로 여러 발표일이 있으면 가장 빠른(첫) 발표일. 못 찾으면 null.
임대 조건은 "핵심만" 최상위 rentTerms 객체로 추출한다 (보일러플레이트 금지 — 전환율 수치·재계약 할증·신청횟수·부가세 등 세부는 넣지 않는다):
- residence: 최대 거주기간을 짧은 한 줄로 ("최대 10년", "최대 20년", "최대 6년", "만 39세까지" 등). 못 찾으면 null.
- depositBasis: 보증금이 고정 금액이 아니라 감정평가액 등으로 호실별로 정해지는 경우 그 기준만 짧게 ("호실별 감정평가액의 30~50%"). 고정 보증금(표에 금액이 박혀있음)이면 null.
- convertible: 보증금↔월임대료 상호전환이 가능하면 true, 불가/언급없음이면 false.
- 소득기준 예시·사무소·신청장소 주소는 제외. 실제 공급 단지만.
- 주소는 "서울특별시"부터 시작하게 보정.
- 단지가 매우 많으면 전부 나열 (생략 금지).
JSON만: {"applyBegin":"YYYY.MM.DD|null","applyEnd":"YYYY.MM.DD|null","winnerAt":"YYYY.MM.DD|null","rentTerms":{"residence":"…|null","depositBasis":"…|null","convertible":true|false},"complexes":[{"name":"단지명","address":"주소","units":<정수|null>,"depositMinWon":<원|null>,"depositMaxWon":<원|null>,"rentMinWon":<원|null>,"rentMaxWon":<원|null>,"areaMinM2":<수|null>,"areaMaxM2":<수|null>,"types":[{"name":"주택형","areaM2":<수|null>,"units":<정수|null>,"depositWon":<원|null>,"rentWon":<원|null>}]}]}`;

// 대형 공고(수백 단지)는 출력 JSON 이 수만 토큰이라 생성에 수 분 걸려 비스트리밍은
// HTTP body 타임아웃(~300s)에 걸려 끊긴다 → streamText 로 소켓을 유지하고 전체 텍스트만 수집.
// 3회까지 재시도(백오프), 4xx 등 영구 오류는 즉시 중단. 누적 텍스트를 반환.
async function aiText({ model, maxTokens, system, prompt }) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = streamText({ model: aiModel(model), system, prompt, maxOutputTokens: maxTokens });
      const text = await result.text;
      if (!text) throw new Error("AI 빈 응답 (재시도)");
      return text;
    } catch (e) {
      lastErr = e;
      const status = e?.statusCode ?? e?.status;
      if (status >= 400 && status < 500 && status !== 429) throw e; // 영구 오류는 즉시 중단
      if (attempt < 3) await sleep(2000 * attempt);
    }
  }
  throw lastErr;
}

async function aiComplexes(md) {
  let t = await aiText({
    model: MODEL,
    maxTokens: 48000, // 단지 수십~수백개 공고는 JSON 이 길어 16k 로는 잘림 → 확장
    system: SYSTEM,
    prompt: `공급 단지 목록 추출, JSON만:\n\n${md.slice(0, 120000)}`,
  });
  const f = t.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (f) t = f[1];
  const o = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
  const rt = o.rentTerms && typeof o.rentTerms === "object" ? o.rentTerms : {};
  const str = (v) => (typeof v === "string" && v.trim() && v.trim() !== "null" ? v.trim() : undefined);
  const rentTerms = {
    ...(str(rt.residence) && { residence: str(rt.residence) }),
    ...(str(rt.depositBasis) && { depositBasis: str(rt.depositBasis) }),
    ...(rt.convertible === true && { convertible: true }),
  };
  return {
    applyBegin: typeof o.applyBegin === "string" ? o.applyBegin : "",
    applyEnd: typeof o.applyEnd === "string" ? o.applyEnd : "",
    winnerAt: typeof o.winnerAt === "string" ? o.winnerAt : "",
    rentTerms,
    complexes: Array.isArray(o.complexes) ? o.complexes : [],
  };
}

// 서울 + 근교(의정부·하남 등 SH 장기전세 범위) 경계. SH 는 서울권이라 이 밖이면
// 동명이지(同名異地) 오지오코딩 → 거부. (이전 inKorea 는 너무 넓어 천안·수원도 통과시켰음)
const inSeoul = (lat, lng) => lat >= 37.38 && lat <= 37.80 && lng >= 126.74 && lng <= 127.25;

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
    if (hit?.point && inSeoul(+hit.point.y, +hit.point.x)) return { lat: +hit.point.y, lng: +hit.point.x };
  } catch { /* fallthrough */ }
  return null;
}

async function addrGeocode(addr) {
  for (const type of ["ROAD", "PARCEL"]) {
    const u = `https://api.vworld.kr/req/address?service=address&request=getcoord&version=2.0&crs=EPSG:4326&type=${type}&address=${encodeURIComponent(addr)}&key=${VKEY}`;
    try {
      const j = await (await fetch(u)).json();
      const p = j?.response?.result?.point;
      if (p && inSeoul(+p.y, +p.x)) return { lat: +p.y, lng: +p.x };
    } catch { /* 다음 type */ }
  }
  return null;
}

// 주소 지오코딩(신뢰) → 단지명 POI 순. SH 공고문 주소는 "서울특별시…"로 정확하므로
// 주소를 우선해 동명이지 오류를 막는다. (이전엔 POI 이름 우선이라 천안 "한누리채" 등을 잘못 찍음)
async function geocode(name, addr) {
  const gu = (addr || "").match(/([가-힣]{1,4}구)\b/)?.[1] || (name || "").match(/([가-힣]{1,4}구)\b/)?.[1] || "";
  if (addr) { const r = await addrGeocode(addr); if (r) return r; }
  if (name) { const r = await poiSearch(name.replace(/\([^)]*\)/g, "").trim(), gu); if (r) return r; }
  return null;
}

// 원 → 만원 (타당 범위만). 보증금 50만~20억, 월세 0~150만.
const depManwon = (won) => {
  if (won == null) return null;
  const d = Math.round(won / 10000);
  return d >= 50 && d <= 200000 ? d : null;
};
const rentManwon = (won) => {
  if (won == null) return null;
  const r = Math.round(won / 10000);
  return r >= 0 && r <= 150 ? r : null;
};

// 단지별 보증금/월세 min~max 만원. 대표값(min) + 범위([min,max], min≠max 일 때).
function priceFields(c) {
  const dMin = depManwon(c.depositMinWon), dMax = depManwon(c.depositMaxWon);
  const rMin = rentManwon(c.rentMinWon), rMax = rentManwon(c.rentMaxWon);
  const out = {};
  if (dMin != null) {
    out.depositManwon = dMin;
    out.rentManwon = rMin ?? 0;
    if (dMax != null && dMax !== dMin) out.depositRange = [dMin, dMax];
    if (rMin != null && rMax != null && rMax !== rMin) out.rentRange = [rMin, rMax];
  }
  return out;
}

console.log(`대상 SH 공고: ${pool.length}건\n`);
const stats = { split: 0, single: 0, err: 0 };
for (const n of pool) {
  let md;
  try { md = await ensureMarkdown(n); } catch (e) { stats.err++; console.log(`✗ sh-${n.seq} md실패: ${e.message}`); continue; }
  let applyBegin, applyEnd, winnerAt, rentTerms, complexes;
  try { ({ applyBegin, applyEnd, winnerAt, rentTerms, complexes } = await aiComplexes(md)); } catch (e) { stats.err++; console.log(`✗ sh-${n.seq} AI실패: ${e.message}`); continue; }
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
    const areaMin = typeof c.areaMinM2 === "number" && c.areaMinM2 > 0 ? Math.round(c.areaMinM2 * 10) / 10 : null;
    const areaMax = typeof c.areaMaxM2 === "number" && c.areaMaxM2 > 0 ? Math.round(c.areaMaxM2 * 10) / 10 : null;
    // 주택형 목록 — 상세 드롭다운용. name 없는 행은 버리고, 가격은 만원 타당범위로 정규화.
    const types = (Array.isArray(c.types) ? c.types : [])
      .map((t) => {
        const name = typeof t?.name === "string" ? t.name.trim() : "";
        if (!name) return null;
        // 면적: AI 값 우선, 없으면 주택형 코드 앞 숫자(25B→25, 30A→30)로 보강.
        const codeNum = Number(name.match(/^(\d{2,3})/)?.[1]);
        const aM2 =
          typeof t.areaM2 === "number" && t.areaM2 > 0 ? Math.round(t.areaM2 * 10) / 10
          : codeNum >= 10 && codeNum <= 200 ? codeNum
          : null;
        const dep = depManwon(t.depositWon), rent = rentManwon(t.rentWon);
        return {
          name,
          ...(aM2 != null && { areaM2: aM2 }),
          ...(typeof t.units === "number" && t.units > 0 && { units: t.units }),
          ...(dep != null && { depositManwon: dep }),
          ...(rent != null && { rentManwon: rent }),
        };
      })
      .filter(Boolean);
    points.push({
      lat: co.lat, lng: co.lng,
      ...(c.name && { label: c.name }),
      address: c.address,
      ...(c.units != null && { units: c.units }),
      ...priceFields(c),
      ...(areaMin != null && { areaMin, areaMax: areaMax ?? areaMin }),
      ...(types.length > 0 && { types }),
    });
  }
  // 접수 시작/마감(공고 공통). 단일 단지도 저장 — 면적·가격·일정으로 기본 SH 를 보강.
  if (points.length >= 1) {
    const hasTerms = Object.keys(rentTerms).length > 0;
    mapped[n.seq] = { ...(applyBegin && { begin: applyBegin }), ...(applyEnd && { deadline: applyEnd }), ...(winnerAt && { winnerAt }), ...(hasTerms && { rentTerms }), points };
    if (points.length >= 2) stats.split++; else stats.single++;
    console.log(`✓ sh-${n.seq} ${points.length}곳 (추출 ${complexes.length}) 접수 ${applyBegin || "?"}~${applyEnd || "?"} 발표 ${winnerAt || "?"} 거주 ${rentTerms.residence || "?"}${rentTerms.depositBasis ? " · 감정가" : ""}${rentTerms.convertible ? " · 전환O" : ""} — ${n.title.slice(0, 28)}`);
  } else {
    stats.single++;
    console.log(`— sh-${n.seq} 좌표 0 (저장 안함) — ${n.title.slice(0, 34)}`);
  }
  // 공고 단위 증분 저장 — 도중 kill 돼도 완료분은 보존(재실행 시 skip).
  await fs.writeFile(OUT_PATH, JSON.stringify(mapped, null, 2) + "\n", "utf8");
}

await fs.writeFile(OUT_PATH, JSON.stringify(mapped, null, 2) + "\n", "utf8");
console.log(`\n완료: 분리 ${stats.split} / 미분리 ${stats.single} / 에러 ${stats.err} → ${OUT_PATH}`);
