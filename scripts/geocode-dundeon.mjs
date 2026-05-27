#!/usr/bin/env node
// 서울 든든전세 주택목록 (lib/dundeon-seoul-raw.json) 의 주소를 VWorld geocoding →
// 좌표 채워서 lib/dundeon-seoul.json 으로 저장. 개별 주택을 지도에 띄우기 위함.
//
// 사용: node --env-file=.env.local scripts/geocode-dundeon.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "lib/dundeon-seoul-raw.json");
const OUT = path.join(ROOT, "lib/dundeon-seoul.json");

const KEY = process.env.VWORLD_API_KEY;
if (!KEY) { console.error("ERROR: VWORLD_API_KEY 누락"); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocode(addr, type = "ROAD") {
  const url = `https://api.vworld.kr/req/address?service=address&request=getcoord&version=2.0&crs=EPSG:4326&type=${type}&address=${encodeURIComponent(addr)}&key=${KEY}`;
  const r = await fetch(url);
  const d = await r.json();
  if (d.response?.status === "OK" && d.response.result?.point) {
    const p = d.response.result.point;
    return { lat: Number(p.y), lng: Number(p.x) };
  }
  return null;
}

const units = JSON.parse(fs.readFileSync(RAW, "utf8"));
const uniqAddrs = [...new Set(units.map((u) => u.address))];
console.log(`${units.length} units / ${uniqAddrs.length} unique 주소 geocoding...`);

const coordMap = new Map();
let ok = 0, fail = 0;
for (const addr of uniqAddrs) {
  let c = await geocode(addr, "ROAD");
  if (!c) { await sleep(150); c = await geocode(addr, "PARCEL"); } // 도로명 실패 시 지번
  if (c) { coordMap.set(addr, c); ok++; }
  else { fail++; console.log("  ✗ geocode 실패:", addr); }
  await sleep(150);
}
console.log(`geocoding 완료: 성공 ${ok} / 실패 ${fail}`);

const out = units.map((u) => {
  const c = coordMap.get(u.address);
  return { ...u, lat: c?.lat ?? null, lng: c?.lng ?? null };
});
const withCoord = out.filter((u) => u.lat != null).length;
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`저장: lib/dundeon-seoul.json (${withCoord}/${out.length} 좌표 보유)`);
