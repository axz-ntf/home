#!/usr/bin/env node
// mapped-regional.json 의 단지별 핀을 VWorld 장소검색(단지명)으로 재지오코딩.
// 장기전세·행복주택 등이 구 중심점에 찍혀 한 점에 겹치던 걸 실제 건물 좌표로 분리.
//
// 사용: node --env-file=.env.local scripts/regeocode-mapped-vworld.mjs [--apply]
//   (--apply 없으면 dry-run: 제안만 출력, 파일 수정 안 함)

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// 단지별 분리 핀(points) 좌표 소스 — 둘 다 같은 구조(label·address·lat·lng).
const FILES = [
  path.join(ROOT, "lib/mapped-regional.json"),
  path.join(ROOT, "lib/sh-mapped.json"),
];
const APPLY = process.argv.includes("--apply");
const KEY = process.env.VWORLD_API_KEY;
if (!KEY) { console.error("ERROR: VWORLD_API_KEY 누락"); process.exit(1); }

const apiListings = JSON.parse(await fs.readFile(path.join(ROOT, "lib/listings-api.json"), "utf8"));
const API = Array.isArray(apiListings) ? apiListings : apiListings.listings ?? Object.values(apiListings)[0];
const titleOf = (pid) => (API.find((r) => r.pblancId === pid)?.title || "").replace(/^\[.*?\]\s*/, "");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const haversineKm = (a, b) => {
  const R = 6371, d = (x) => (x * Math.PI) / 180;
  const dl = d(b.lat - a.lat), dn = d(b.lng - a.lng);
  const h = Math.sin(dl / 2) ** 2 + Math.cos(d(a.lat)) * Math.cos(d(b.lat)) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// 검색어 정리 — "내곡지구 (서초더샵포레, …)" 같은 지구설명/괄호 제거, 첫 단지명만.
function queryFrom(label, fallbackTitle) {
  let q = (label || fallbackTitle || "").trim();
  q = q.replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim();
  q = q.replace(/\s*(입주자|예비입주자|모집공고|모집|공고|추가모집).*$/, "").trim();
  return q.split(/[,/]/)[0].trim(); // 콤마/슬래시 앞 첫 항목
}

async function vworldSearch(query) {
  const url = `https://api.vworld.kr/req/search?service=search&request=search&version=2.0&crs=EPSG:4326&size=3&query=${encodeURIComponent(query)}&type=place&format=json&key=${KEY}`;
  const r = await fetch(url);
  const j = await r.json().catch(() => null);
  const it = j?.response?.result?.items?.[0];
  if (!it?.point) return null;
  return {
    lat: Number(it.point.y), lng: Number(it.point.x),
    title: it.title, address: it.address?.road || it.address?.parcel || "",
  };
}

// 시/군/구 추출 — 결과 주소가 같은 행정구역인지 검증용 (오매칭 방지).
const guOf = (addr) => (addr || "").match(/([가-힣]+(시|군|구))/g)?.slice(-1)[0] ?? "";

let updated = 0, skipped = 0, failed = 0;

for (const file of FILES) {
  const data = JSON.parse(await fs.readFile(file, "utf8"));
  // 겹치는 좌표만 — 같은 (소수5자리) 좌표를 2개 이상 point 가 공유.
  const all = [];
  for (const [pid, cfg] of Object.entries(data)) for (const p of cfg.points || []) all.push({ pid, p });
  const keyCount = new Map();
  for (const { p } of all) { const k = `${p.lat.toFixed(5)}|${p.lng.toFixed(5)}`; keyCount.set(k, (keyCount.get(k) ?? 0) + 1); }
  const colliding = all.filter(({ p }) => keyCount.get(`${p.lat.toFixed(5)}|${p.lng.toFixed(5)}`) > 1);
  console.log(`\n[${path.basename(file)}] 겹치는 point ${colliding.length}개`);

  let dirty = false;
  for (const { pid, p } of colliding) {
    const fallback = titleOf(pid);
    const q = queryFrom(p.label, fallback);
    const expectGu = guOf(p.address) || guOf(p.label) || guOf(fallback);
    if (!q || q.length < 2) { skipped++; continue; }
    try {
      let hit = await vworldSearch(q);
      await sleep(120);
      // 실패 시 구 이름 붙여 재시도 ("엘리프 미아역" → "강북구 엘리프 미아역")
      if (!hit && expectGu) { hit = await vworldSearch(`${expectGu} ${q}`); await sleep(120); }
      if (!hit) { failed++; console.log(`  ✗ 검색실패: "${q}"`); continue; }
      const dist = haversineKm({ lat: p.lat, lng: p.lng }, hit);
      if (expectGu && !hit.address.includes(expectGu)) {
        skipped++; console.log(`  ⚠ 구역불일치 스킵: "${q}" 기대 ${expectGu} ≠ ${hit.address}`); continue;
      }
      if (dist > 25) { skipped++; console.log(`  ⚠ 거리 ${dist.toFixed(0)}km 스킵: "${q}" (${hit.title})`); continue; }
      if (dist < 0.03) { skipped++; continue; }
      console.log(`  ✓ ${q}  Δ${dist.toFixed(2)}km → ${hit.address || hit.title}`);
      if (APPLY) { p.lat = hit.lat; p.lng = hit.lng; if (hit.address) p.address = hit.address; dirty = true; }
      updated++;
    } catch (e) {
      failed++; console.log(`  ✗ 오류 "${q}": ${e.message?.slice(0, 60)}`);
    }
  }
  if (APPLY && dirty) {
    await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n");
    console.log(`  → ${path.basename(file)} 저장`);
  }
}

console.log(`\n${APPLY ? "[적용]" : "[dry-run]"} 재지오코딩 ${updated} / 스킵 ${skipped} / 실패 ${failed}`);
