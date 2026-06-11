#!/usr/bin/env node
// SH 공고 제목의 동/구 → VWorld 지오코딩 → lib/sh-notices.json 에 lat/lng 추가.
// 단일 위치가 제목에 드러난 SH 만 좌표를 얻는다(산재형·시단위는 위치 없음 → 그대로 둠).
// 사용: node --env-file=.env.local scripts/geocode-sh.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "lib/sh-notices.json");
const KEY = process.env.VWORLD_API_KEY;
if (!KEY) { console.error("VWORLD_API_KEY 없음"); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 서울 대략 경계 — 지오코딩 결과 검증(노이즈 필터: "인가구", "보호종료아동" 등은 결과 없음/범위밖).
const inSeoul = (lat, lng) => lat > 37.42 && lat < 37.71 && lng > 126.76 && lng < 127.19;

// 제목에서 위치(구 우선, 없으면 동). 동은 4자 이하 + "동"으로 끝(오탐 "인가구" 등은 구 패턴서 걸러짐).
function placeFromTitle(title) {
  const gu = title.match(/([가-힣]{2,3}구)/);
  if (gu && !/인가구/.test(gu[1])) return gu[1];
  const dong = title.match(/([가-힣]{2,3}동)/);
  if (dong) return dong[1];
  return null;
}

async function vworld(address, type) {
  const u = `https://api.vworld.kr/req/address?service=address&request=getcoord&version=2.0&crs=epsg:4326&type=${type}&address=${encodeURIComponent(address)}&format=json&key=${KEY}`;
  const j = await (await fetch(u)).json();
  const p = j.response?.result?.point;
  return p ? { lat: Number(p.y), lng: Number(p.x) } : null;
}

async function geocode(place) {
  const q = `서울특별시 ${place}`;
  for (const type of ["road", "parcel"]) {
    try {
      const r = await vworld(q, type);
      if (r && inSeoul(r.lat, r.lng)) return r;
    } catch { /* 다음 type */ }
  }
  return null;
}

async function main() {
  const notices = JSON.parse(await fs.readFile(FILE, "utf8"));
  let ok = 0, skip = 0;
  for (const n of notices) {
    const place = placeFromTitle(n.title);
    if (!place) { skip++; continue; }
    const r = await geocode(place);
    if (r) {
      n.lat = r.lat; n.lng = r.lng; n.geoPlace = place; n.geocoded = true;
      ok++;
      console.log(`✓ ${place.padEnd(5)} ${r.lat.toFixed(4)},${r.lng.toFixed(4)} | ${n.title.slice(0, 30)}`);
    } else {
      console.log(`✗ ${place} (서울 결과 없음) | ${n.title.slice(0, 30)}`);
    }
    await sleep(200);
  }
  await fs.writeFile(FILE, JSON.stringify(notices, null, 2) + "\n", "utf8");
  console.log(`\n지오코딩 ${ok}건 성공 | 위치없음 ${skip}건(시단위/산재형) | 저장: ${FILE}`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
