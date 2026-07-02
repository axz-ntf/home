#!/usr/bin/env node
// listings-api.json 에서 좌표(lat/lng) 없는 매물을 address 로 VWorld 지오코딩해 보강.
// 잔여세대·선착순·일반매각 등 상세 스크랩에서 좌표를 못 받은 활성 공고가 지도에서 빠지는 문제 해결.
// 증분: 이미 좌표 있는 건 skip. (CI 좌표 보강 단계에 붙일 수 있음.)
//
// 사용: node --env-file=.env.local scripts/geocode-missing-coords.mjs [--all] [--limit N]
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "lib/listings-api.json");
const KEY = process.env.VWORLD_API_KEY;
const KAKAO = process.env.KAKAO_REST_API_KEY; // VWorld 폴백(헤더 인증 → CI IP 제한 없음)
if (!KEY && !KAKAO) { console.error("ERROR: VWORLD_API_KEY / KAKAO_REST_API_KEY 둘 다 없음"); process.exit(1); }

const ALL = process.argv.includes("--all"); // 기본은 활성(모집중/예정)만, --all 이면 전체
const LIMIT = Number(process.argv.includes("--limit") ? process.argv[process.argv.indexOf("--limit") + 1] : 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const inKorea = (lat, lng) => lat > 33 && lat < 39 && lng > 124 && lng < 132;

async function vworld(addr) {
  if (!KEY) return null;
  for (const type of ["road", "parcel"]) {
    const u = `https://api.vworld.kr/req/address?service=address&request=getcoord&version=2.0&crs=epsg:4326&type=${type}&address=${encodeURIComponent(addr)}&format=json&key=${KEY}`;
    try {
      const j = await (await fetch(u)).json();
      const p = j.response?.result?.point;
      if (p) { const lat = +p.y, lng = +p.x; if (inKorea(lat, lng)) return { lat, lng, via: "vworld-addr" }; }
    } catch { /* 다음 type */ }
  }
  return null;
}

async function kakao(addr) {
  if (!KAKAO) return null;
  for (const ep of ["address", "keyword"]) {
    const u = `https://dapi.kakao.com/v2/local/search/${ep}.json?query=${encodeURIComponent(addr)}&size=1`;
    try {
      const j = await (await fetch(u, { headers: { Authorization: "KakaoAK " + KAKAO } })).json();
      const d = j.documents?.[0];
      if (d) { const lat = +d.y, lng = +d.x; if (inKorea(lat, lng)) return { lat, lng, via: "kakao-" + ep }; }
    } catch { /* 다음 ep */ }
  }
  return null;
}

// VWorld 우선 → 실패 시 Kakao 폴백 (CI에서 VWorld IP 거부돼도 좌표 확보).
async function geocode(addr) {
  return (await vworld(addr)) || (await kakao(addr));
}

const listings = JSON.parse(await fs.readFile(FILE, "utf8"));
let pool = listings.filter((l) => !(l.lat && l.lng) && l.address && l.address.length > 4);
// 활성(모집중/예정)만 — status 로만 판단. deadline 형식·누락에 의존하던 필터는 활성건을 빠뜨려 제거.
if (!ALL) pool = pool.filter((l) => l.status === "upcoming" || l.status === "open");
if (LIMIT > 0) pool = pool.slice(0, LIMIT);
console.log(`좌표 보강 대상: ${pool.length}건 (${ALL ? "전체 좌표없음" : "활성만"}) | VWorld:${KEY ? "on" : "off"} Kakao:${KAKAO ? "on" : "off"}`);

let ok = 0, fail = 0;
for (const l of pool) {
  const r = await geocode(l.address);
  if (r) { l.lat = r.lat; l.lng = r.lng; l.geocoded = r.via; ok++; }
  else { fail++; console.log(`  ✗ ${(l.title || "").slice(0, 28)} | ${l.address}`); }
  await sleep(120);
}
await fs.writeFile(FILE, JSON.stringify(listings, null, 2) + "\n", "utf8");
console.log(`완료 — 보강 ${ok} / 실패 ${fail} / 대상 ${pool.length}`);

// 조용한 실패 방지: 대상이 있는데 한 건도 못 살리면 비정상(대개 키 IP거부/누락) → CI 로그에 빨갛게 노출.
if (pool.length > 0 && ok === 0) {
  console.error(`⚠️ 지오코딩 전면 실패: 대상 ${pool.length}건 중 0건 보강. VWorld 키 IP제한/누락 또는 Kakao 키 누락 의심 — 확인 필요.`);
  process.exit(1);
}
