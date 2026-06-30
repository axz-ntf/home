#!/usr/bin/env node
// 좌표 재지오코딩 — Nominatim(OpenStreetMap) 으로 도로명주소 → 위경도 변환
// 사용: node scripts/fix-coords.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_PATH = path.join(ROOT, "lib/lh-data.json");

const HEADERS = {
  "User-Agent": "daum-public-housing-lh-app/1.0 (one-shot geocoding)",
};

function hav(a, b) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const A =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(A));
}

function cleanAddress(addr) {
  // "서울특별시 강서구 허준로 209(가양동,가양7단지아파트)" → "서울특별시 강서구 허준로 209"
  return addr.replace(/\([^)]*\)/g, "").trim();
}

async function geocode(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("countrycodes", "kr");
  url.searchParams.set("limit", "1");
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) return null;
  const arr = await r.json();
  if (!arr.length) return null;
  return { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const data = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
  const changes = [];
  let ok = 0,
    fail = 0;
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const cleaned = cleanAddress(item.address);
    let geo = await geocode(cleaned);
    await sleep(1100);
    if (!geo) {
      // 도로명 안 나오면 단지명으로 한 번 더
      const fallback = item.title + " " + item.district;
      geo = await geocode(fallback);
      await sleep(1100);
    }
    if (!geo) {
      console.log(`✗ [${i + 1}/${data.length}] ${item.title}: 실패 — ${cleaned}`);
      fail++;
      continue;
    }
    const dist = hav({ lat: item.lat, lng: item.lng }, geo);
    if (dist > 80) {
      changes.push({
        title: item.title,
        addr: cleaned,
        oldLat: item.lat,
        oldLng: item.lng,
        newLat: geo.lat,
        newLng: geo.lng,
        dist,
      });
      item.lat = geo.lat;
      item.lng = geo.lng;
    }
    console.log(
      `[${i + 1}/${data.length}] ${item.title}  ${dist > 80 ? "갱신" : "유지"}  Δ${dist.toFixed(0)}m`,
    );
    ok++;
  }
  console.log(
    `\n갱신 ${changes.length}건 / 성공 ${ok} / 실패 ${fail} / 총 ${data.length}`,
  );
  if (changes.length) {
    console.log("\n변경된 단지:");
    changes
      .sort((a, b) => b.dist - a.dist)
      .forEach((c) =>
        console.log(
          `  ${c.title.padEnd(20)} (${c.oldLat.toFixed(4)},${c.oldLng.toFixed(4)}) → (${c.newLat.toFixed(4)},${c.newLng.toFixed(4)})  Δ${c.dist.toFixed(0)}m  ${c.addr}`,
        ),
      );
  }
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2) + "\n");
  console.log(`\n저장: ${DATA_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
