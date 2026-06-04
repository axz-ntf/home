// 다지점(여러 단지/지역) 공고를 자동 분리 — .md에서 단지 목록 AI 추출 → VWorld 지오코딩 →
// lib/mapped-regional.json 병합. 지오코딩 성공 ≥2곳이면 "다지점"으로 분리(단일/실패는 스킵).
// 사용: node --env-file=.env.local scripts/extract-mapped-regional.mjs [--ids pid1,pid2] [--active] [--limit N]
// 자격/조감도처럼 daily-sync 단계로도 사용 가능.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KEY = process.env.ANTHROPIC_API_KEY?.trim();
const VKEY = process.env.VWORLD_API_KEY;
if (!KEY || !VKEY) { console.error("ERROR: ANTHROPIC_API_KEY / VWORLD_API_KEY 필요"); process.exit(1); }

const args = process.argv.slice(2);
const idArg = (args.find((a) => a.startsWith("--ids=")) || "").split("=")[1];
const ACTIVE = args.includes("--active");
const LIMIT = Number((args.find((a) => a.startsWith("--limit=")) || "").split("=")[1] || 9999);

const listings = JSON.parse(await fs.readFile(path.join(ROOT, "lib/listings-api.json"), "utf8"));
const mappedPath = path.join(ROOT, "lib/mapped-regional.json");
const mapped = JSON.parse(await fs.readFile(mappedPath, "utf8"));
const DONE = new Set([...Object.keys(mapped), "2015122300019992"]); // 이미 분리됨 + 든든전세

const SIDO_ID = { 서울: "seoul", 부산: "busan", 대구: "daegu", 인천: "incheon", 광주: "gwangju", 대전: "daejeon", 울산: "ulsan", 세종: "sejong", 경기: "gyeonggi", 강원: "gangwon", 충북: "chungbuk", 충청북: "chungbuk", 충남: "chungnam", 충청남: "chungnam", 전북: "jeonbuk", 전라북: "jeonbuk", 전남: "jeonnam", 전라남: "jeonnam", 경북: "gyeongbuk", 경상북: "gyeongbuk", 경남: "gyeongnam", 경상남: "gyeongnam", 제주: "jeju" };
function districtIdOf(addr) {
  const m = (addr || "").match(/^([가-힣]{2})/);
  return (m && SIDO_ID[m[1]]) || null;
}

const SYSTEM = `한국 LH 공고문에서 "공급 주택단지 목록"을 추출하는 전문가.
주택단지 개요/모집대상 표에서 각 단지의 이름과 도로명 주소(시·도부터 번지까지)를 뽑아라.
소득기준 예시주소·관할 사무소 주소·신청 안내 주소는 제외. 실제 공급되는 단지만.
단지가 1개뿐이면 1개만. JSON만: {"complexes":[{"name":"단지명","address":"전체 도로명주소"}]}`;

async function aiComplexes(md) {
  const region = md.slice(0, 14000);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 1500, system: SYSTEM, messages: [{ role: "user", content: `공급 단지 목록 추출, JSON만:\n\n${region}` }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`AI HTTP ${r.status}`);
  let t = j.content.map((c) => c.text || "").join("");
  const f = t.match(/```(?:json)?\s*\n([\s\S]*?)\n```/); if (f) t = f[1];
  const o = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
  return Array.isArray(o.complexes) ? o.complexes : [];
}

async function geocode(addr) {
  for (const type of ["ROAD", "PARCEL"]) {
    const u = `https://api.vworld.kr/req/address?service=address&request=getcoord&version=2.0&crs=EPSG:4326&type=${type}&address=${encodeURIComponent(addr)}&key=${VKEY}`;
    try { const j = await (await fetch(u)).json(); const p = j?.response?.result?.point; if (p) return { lat: +p.y, lng: +p.x }; } catch {}
  }
  return null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 다지점 가능성 있는 제목인지 (AI 호출 비용 절감용 사전필터).
function multiLocTitle(t) {
  t = t || "";
  if (/(특별시|광역시|특별자치시|특별자치도|도)\s*(국민|영구|행복|통합).{0,4}임대/.test(t)) return true; // 광역단위
  const par = t.match(/\(([^()]*,[^()]*)\)/);
  if (par && !/소득|자격|평형|면적|블록|BL\b|상시|유주택|무주택/.test(par[1])) return true; // 괄호 단지목록
  const regs = [...t.matchAll(/([가-힣]{2,4}(?:시|군|구))[\s,]/g)].map((m) => m[1]);
  return new Set(regs).size >= 2; // 2개 이상 시군구
}

// 대상 선정
let pool = listings.filter((l) => !DONE.has(l.pblancId) && l.sourceUrl?.includes("selectWrtancInfo.do"));
if (ACTIVE) pool = pool.filter((l) => ["open", "upcoming", "closing"].includes(l.status));
if (idArg) { const ids = new Set(idArg.split(",")); pool = pool.filter((l) => ids.has(l.pblancId)); }
// --ids 직접 지정이 아니면 제목 사전필터로 후보만 (매일 전수 AI 호출 방지)
else pool = pool.filter((l) => multiLocTitle(l.title));
// pblancId 중복(정정공고) dedupe
const byPid = new Map(); for (const l of pool) if (!byPid.has(l.pblancId)) byPid.set(l.pblancId, l);
pool = [...byPid.values()].slice(0, LIMIT);

console.log(`대상 공고: ${pool.length}건\n`);
const stats = { split: 0, single: 0, none: 0, err: 0 };
for (const l of pool) {
  const mdPath = path.join(ROOT, `lib/notice-texts/${l.id}.md`);
  let md; try { md = await fs.readFile(mdPath, "utf8"); } catch { stats.none++; continue; }
  let complexes;
  try { complexes = await aiComplexes(md); } catch (e) { stats.err++; console.log(`✗ ${l.id} AI실패`); continue; }
  const points = [];
  const seen = new Set();
  for (const c of complexes) {
    if (!c.address) continue;
    const co = await geocode(c.address); await sleep(120);
    if (!co) continue;
    const key = co.lat.toFixed(5) + "," + co.lng.toFixed(5);
    if (seen.has(key)) continue; seen.add(key);
    points.push({ lat: co.lat, lng: co.lng, label: c.name ? `${c.name}` : undefined, address: c.address });
  }
  if (points.length >= 2) {
    const did = districtIdOf(points[0].address);
    mapped[l.pblancId] = { ...(did ? { districtId: did } : {}), points };
    stats.split++;
    console.log(`✓ ${l.id} 다지점 ${points.length}곳 — ${(l.title || "").slice(0, 30)}`);
  } else { stats.single++; }
}
await fs.writeFile(mappedPath, JSON.stringify(mapped, null, 2) + "\n");
console.log(`\n완료: 분리 ${stats.split} / 단일 ${stats.single} / md없음 ${stats.none} / 에러 ${stats.err}`);
console.log(`mapped-regional.json: ${Object.keys(mapped).length} entries`);
