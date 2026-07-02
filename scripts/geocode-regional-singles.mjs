// "전국 모집"에 잘못 떨어진 단일 공고를 지역 단위 지도 핀으로 올린다.
// regional/좌표없음 활성 공고의 제목에서 시·군·구를 추출 → VWorld 지오코딩 →
// lib/mapped-regional.json 병합(든든전세/다지점과 같은 경로). 핀은 시/군/구 중심(지역 단위).
//
// 원칙: 시·군·구가 명확한 것만 옮긴다. 시/도 단위만 넓은 광역(든든전세·"OO 외"·상시모집 등)이나
//       지오코딩 실패 건은 손대지 않고 "전국 모집" 섹션에 잔류시킨다(검증 안 되면 비운다).
//
// 사용: node --env-file=.env.local scripts/geocode-regional-singles.mjs [--active] [--dry] [--limit N]
// daily-sync: extract-mapped-regional.mjs(다지점) 다음 단계로 실행 — 이미 분리된 pid 는 skip.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VKEY = process.env.VWORLD_API_KEY?.replace(/^"|"$/g, "");
const KAKAO = process.env.KAKAO_REST_API_KEY?.replace(/^"|"$/g, ""); // VWorld 폴백(CI IP 제한 회피)
if (!VKEY && !KAKAO) { console.error("ERROR: VWORLD_API_KEY/KAKAO_REST_API_KEY 중 하나 필요"); process.exit(1); }

const args = process.argv.slice(2);
const ACTIVE = args.includes("--active");
const DRY = args.includes("--dry");
const LIMIT = Number((args.find((a) => a.startsWith("--limit=")) || "").split("=")[1] || 9999);

// 시/도 약칭·정식명 → [정식명, districtId]. 긴 형태 먼저 매칭되도록 정렬해서 사용.
const SIDO = {
  서울특별시: ["서울특별시", "seoul"], 서울: ["서울특별시", "seoul"],
  부산광역시: ["부산광역시", "busan"], 부산: ["부산광역시", "busan"],
  대구광역시: ["대구광역시", "daegu"], 대구: ["대구광역시", "daegu"],
  인천광역시: ["인천광역시", "incheon"], 인천: ["인천광역시", "incheon"],
  광주광역시: ["광주광역시", "gwangju"], 광주: ["광주광역시", "gwangju"],
  대전광역시: ["대전광역시", "daejeon"], 대전: ["대전광역시", "daejeon"],
  울산광역시: ["울산광역시", "ulsan"], 울산: ["울산광역시", "ulsan"],
  세종특별자치시: ["세종특별자치시", "sejong"], 세종: ["세종특별자치시", "sejong"],
  경기도: ["경기도", "gyeonggi"], 경기: ["경기도", "gyeonggi"],
  강원특별자치도: ["강원특별자치도", "gangwon"], 강원: ["강원특별자치도", "gangwon"],
  충청북도: ["충청북도", "chungbuk"], 충청북: ["충청북도", "chungbuk"], 충북: ["충청북도", "chungbuk"],
  충청남도: ["충청남도", "chungnam"], 충청남: ["충청남도", "chungnam"], 충남: ["충청남도", "chungnam"],
  전북특별자치도: ["전북특별자치도", "jeonbuk"], 전라북도: ["전북특별자치도", "jeonbuk"], 전라북: ["전북특별자치도", "jeonbuk"], 전북: ["전북특별자치도", "jeonbuk"],
  전라남도: ["전라남도", "jeonnam"], 전라남: ["전라남도", "jeonnam"], 전남: ["전라남도", "jeonnam"],
  경상북도: ["경상북도", "gyeongbuk"], 경상북: ["경상북도", "gyeongbuk"], 경북: ["경상북도", "gyeongbuk"],
  경상남도: ["경상남도", "gyeongnam"], 경상남: ["경상남도", "gyeongnam"], 경남: ["경상남도", "gyeongnam"],
  제주특별자치도: ["제주특별자치도", "jeju"], 제주: ["제주특별자치도", "jeju"],
};
const SIDO_ALT = Object.keys(SIDO).sort((a, b) => b.length - a.length).join("|");
const PAIR_RE = new RegExp(`(${SIDO_ALT})\\s*([가-힣]{1,3}(?:시|군|구))`, "g");
const SGG_RE = /[가-힣]{1,3}(?:시|군|구)/g;

// district 필드("충청남도", "대구광역시 외" 등) → [정식명, id].
function sidoFromDistrict(d) {
  const key = (d || "").replace(/\s*외\s*$/, "").trim();
  return SIDO[key] || null;
}

// 제목에서 (시/도, 시/군/구) 쌍을 추출. 시/도가 제목에 명시되면 그것을, 없으면 district 폴백.
function regionsFromTitle(title, district) {
  const t = title || "";
  const out = [];
  const seen = new Set();
  const push = (sido, sgg) => {
    const key = sido[1] + "|" + sgg;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ sido: sido[0], sidoId: sido[1], sigungu: sgg });
  };

  // 1) "{시도}{시군구}" 인접 쌍 (예: "대구 달성군, 경북 고령군", "충남천안시", "대전동구")
  let m;
  PAIR_RE.lastIndex = 0;
  while ((m = PAIR_RE.exec(t))) push(SIDO[m[1]], m[2]);

  // 2) 쌍이 하나도 없으면 단독 시/군/구 + district 시/도 (예: "양산시 …", district=경상남도)
  if (out.length === 0) {
    const fb = sidoFromDistrict(district);
    if (fb) for (const tok of t.match(SGG_RE) || []) push(fb, tok);
  }
  return out;
}

// 지오코딩 + 검증: VWorld 가 "상시"→"…상시목길"처럼 퍼지 매칭하므로, 매칭된 실제 주소
// (refined.text)의 행정구역 토큰에 요청한 시/군/구가 그대로 들어있을 때만 인정한다.
async function geocode(addr, sigungu) {
  if (VKEY) for (const type of ["ROAD", "PARCEL"]) {
    const u = `https://api.vworld.kr/req/address?service=address&request=getcoord&version=2.0&crs=EPSG:4326&type=${type}&address=${encodeURIComponent(addr)}&key=${VKEY}`;
    try {
      const j = await (await fetch(u)).json();
      const p = j?.response?.result?.point;
      const refined = j?.response?.refined?.text || "";
      if (p && refined.split(/\s+/).includes(sigungu)) return { lat: +p.y, lng: +p.x };
    } catch {}
  }
  if (KAKAO) for (const ep of ["address", "keyword"]) { // VWorld 실패/누락 시 Kakao 폴백 (시군구 일치 가드 유지)
    try {
      const j = await (await fetch(`https://dapi.kakao.com/v2/local/search/${ep}.json?query=${encodeURIComponent(addr)}&size=1`, { headers: { Authorization: "KakaoAK " + KAKAO } })).json();
      const d = j.documents?.[0];
      const an = d?.address_name || d?.road_address_name || "";
      if (d && an.split(/\s+/).includes(sigungu)) return { lat: +d.y, lng: +d.x };
    } catch {}
  }
  return null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const listings = JSON.parse(await fs.readFile(path.join(ROOT, "lib/listings-api.json"), "utf8"));
const mappedPath = path.join(ROOT, "lib/mapped-regional.json");
const mapped = JSON.parse(await fs.readFile(mappedPath, "utf8"));
const DONE = new Set([...Object.keys(mapped), "2015122300019992"]); // 이미 분리됨 + 든든전세

// 대상: regional 또는 좌표없음 + (옵션)활성 + 아직 미분리.
let pool = listings.filter((l) =>
  !DONE.has(l.pblancId) &&
  (l.scope === "regional" || !l.lat || !l.lng || !l.districtId),
);
if (ACTIVE) pool = pool.filter((l) => ["open", "upcoming", "closing"].includes(l.status));
const byPid = new Map(); for (const l of pool) if (!byPid.has(l.pblancId)) byPid.set(l.pblancId, l);
pool = [...byPid.values()].slice(0, LIMIT);

console.log(`대상 공고: ${pool.length}건${DRY ? " (dry-run)" : ""}\n`);
const stats = { mapped: 0, noRegion: 0, geocodeFail: 0 };
for (const l of pool) {
  const regions = regionsFromTitle(l.title, l.district);
  if (regions.length === 0) { stats.noRegion++; continue; }

  const points = [];
  const seen = new Set();
  for (const r of regions) {
    const co = await geocode(`${r.sido} ${r.sigungu}`, r.sigungu); await sleep(120);
    if (!co) continue;
    const key = co.lat.toFixed(4) + "," + co.lng.toFixed(4);
    if (seen.has(key)) continue; seen.add(key);
    points.push({ lat: co.lat, lng: co.lng, address: `${r.sido} ${r.sigungu}`, districtId: r.sidoId, district: r.sido });
  }
  if (points.length === 0) { stats.geocodeFail++; console.log(`✗ ${l.id} 지오코딩 실패 — ${(l.title || "").slice(0, 30)}`); continue; }

  mapped[l.pblancId] = { districtId: points[0].districtId, district: points[0].district, points };
  stats.mapped++;
  console.log(`✓ ${l.id} ${points.length}핀 [${points.map((p) => p.address).join(", ")}] — ${(l.title || "").slice(0, 30)}`);
}

if (!DRY) await fs.writeFile(mappedPath, JSON.stringify(mapped, null, 2) + "\n");
console.log(`\n완료: 지도이동 ${stats.mapped} / 지역없음(잔류) ${stats.noRegion} / 지오코딩실패(잔류) ${stats.geocodeFail}`);
console.log(`mapped-regional.json: ${Object.keys(mapped).length} entries${DRY ? " (미저장)" : ""}`);
