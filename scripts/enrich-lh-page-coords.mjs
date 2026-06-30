// LH 공고 상세 페이지 → 주소 추출 → VWorld Geocoder 로 좌표 변환.
// 대상: lib/lh-notices-all.json 의 geocoded === "sido-center" + selectWrtancInfo.do URL.
//
// VWORLD_API_KEY 환경변수 필수 (.env.local 또는 인라인).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = path.join(ROOT, "lib/lh-notices-all.json");
const ENV_PATH = path.join(ROOT, ".env.local");

// .env.local 파일에서 환경변수 로드 (없으면 process.env 그대로)
try {
  const txt = fs.readFileSync(ENV_PATH, "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  /* ignore */
}

const VWORLD_KEY = process.env.VWORLD_API_KEY;
if (!VWORLD_KEY) {
  console.error("VWORLD_API_KEY 가 없습니다 (.env.local 또는 인라인 환경변수로 지정)");
  process.exit(1);
}

const UA = "daum-public-housing-app/1.0 (LH page-coords enricher)";
const COORD_RE = /var\s+lat_0\s*=\s*"([\d.]+)"[\s\S]{0,200}?var\s+lng_0\s*=\s*"([\d.]+)"/;
const ADDR_RE = /<strong>\s*소재지\s*<\/strong>\s*([^<]+?)(?:<|$)/;
const REQ_DELAY_MS = 400; // LH 페이지 fetch 사이 폴라이트 딜레이
const VWORLD_DELAY_MS = 200; // VWorld 4만건/일 충분, 빠르게 가능

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cleanAddress(raw) {
  return raw.replace(/\s+/g, " ").trim();
}

function addressForGeocode(addr) {
  // 괄호 안 단지명/동 정보 제거: "...반야월북로 221(신서동,신서화성파크드림)" → "...반야월북로 221"
  return cleanAddress(addr).replace(/\s*\([^)]*\)\s*$/, "").trim();
}

async function vworldGeocode(addr, type = "ROAD") {
  const url = new URL("https://api.vworld.kr/req/address");
  url.searchParams.set("service", "address");
  url.searchParams.set("request", "getCoord");
  url.searchParams.set("version", "2.0");
  url.searchParams.set("crs", "epsg:4326");
  url.searchParams.set("type", type);
  url.searchParams.set("format", "json");
  url.searchParams.set("address", addr);
  url.searchParams.set("key", VWORLD_KEY);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`vworld HTTP ${res.status}`);
  const json = await res.json();
  const r = json?.response;
  if (r?.status !== "OK") return null;
  const p = r.result?.point;
  if (!p) return null;
  const lat = Number(p.y);
  const lng = Number(p.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

async function geocodeWithFallback(addr) {
  // 1차: 도로명
  let coords = await vworldGeocode(addr, "ROAD");
  if (coords) return { coords, source: "ROAD" };
  await sleep(VWORLD_DELAY_MS);
  // 2차: 지번
  coords = await vworldGeocode(addr, "PARCEL");
  if (coords) return { coords, source: "PARCEL" };
  return null;
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const targets = data.filter(
    (r) =>
      r.geocoded === "sido-center" &&
      typeof r.sourceUrl === "string" &&
      r.sourceUrl.includes("selectWrtancInfo.do"),
  );
  console.log(`targets: ${targets.length}`);

  let updatedPage = 0;
  let updatedRoad = 0;
  let updatedParcel = 0;
  let noAddr = 0;
  let geocodeFail = 0;
  let httpFail = 0;

  for (const [i, r] of targets.entries()) {
    const prefix = `[${i + 1}/${targets.length}] ${r.id}`;
    try {
      const res = await fetch(r.sourceUrl, { headers: { "User-Agent": UA } });
      if (!res.ok) {
        httpFail++;
        console.warn(`${prefix} HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();

      // 1) page 내 lat_0/lng_0 우선
      const cm = html.match(COORD_RE);
      if (cm) {
        const lat = Number(cm[1]);
        const lng = Number(cm[2]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          r.lat = lat;
          r.lng = lng;
          r.geocoded = "page-coords";
          updatedPage++;
          console.log(`${prefix} page-coords: ${lat}, ${lng}`);
          await sleep(REQ_DELAY_MS);
          continue;
        }
      }

      // 2) 소재지 주소 추출 → VWorld
      const am = html.match(ADDR_RE);
      if (!am) {
        noAddr++;
        if (noAddr < 5) console.warn(`${prefix} no 소재지 in page`);
        await sleep(REQ_DELAY_MS);
        continue;
      }
      const rawAddr = cleanAddress(am[1]);
      const queryAddr = addressForGeocode(rawAddr);
      const result = await geocodeWithFallback(queryAddr);
      if (!result) {
        geocodeFail++;
        if (geocodeFail < 15) console.warn(`${prefix} geocode failed for: ${queryAddr}`);
        await sleep(REQ_DELAY_MS);
        continue;
      }
      r.lat = result.coords.lat;
      r.lng = result.coords.lng;
      r.address = rawAddr;
      r.geocoded = result.source === "ROAD" ? "vworld-road" : "vworld-parcel";
      if (result.source === "ROAD") updatedRoad++;
      else updatedParcel++;
      console.log(
        `${prefix} ${result.source.toLowerCase()}: ${result.coords.lat}, ${result.coords.lng} (${queryAddr.slice(0, 40)})`,
      );
    } catch (e) {
      console.warn(`${prefix} error: ${e.message}`);
    }
    await sleep(REQ_DELAY_MS);
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  console.log("---");
  console.log({
    updatedPage,
    updatedRoad,
    updatedParcel,
    totalUpdated: updatedPage + updatedRoad + updatedParcel,
    noAddr,
    geocodeFail,
    httpFail,
    total: targets.length,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
