// LH 공공데이터 API 통합 sync 스크립트.
//
// 입력: 환경변수 DATA_GO_KR_KEY, VWORLD_API_KEY (.env.local)
// 출력: lib/listings-api.json — 우리 Listing 타입으로 정규화된 list
//
// 단계:
//   Phase 1: API 3 (lhLeaseNoticeInfo1) — 전체 공고 fetch (UPP_AIS_TP_CD 05/06/13/39)
//   Phase 2: API 2 (getLeaseNoticeSplInfo1) — 공고별 주택형/보증금/월세/분양가
//   Phase 3: 주소 해결 — 기존 lh-notices-all 매칭 / 부족하면 DTL_URL scrape
//   Phase 4: VWorld Geocoder — 새 주소 좌표 변환
//   Phase 5: 사진 보존 + 최종 normalize → 출력

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recordSync } from "./sync-meta.mjs";
import { buildComplexIndex, findMatchingComplex } from "./lib/lh-complex-match.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = path.join(ROOT, "lib/listings-api.json");
const COMPLEXES_PATH = path.join(ROOT, "lib/lh-complexes.json"); // API 1 결과 캐시
const EXISTING_PATH = path.join(ROOT, "lib/lh-notices-all.json");
const MYHOME_PATH = path.join(ROOT, "lib/myhome-all-notices.json"); // 당첨자 발표일(winnerDate) 공급원
const ADMIN_CODES_PATH = path.join(ROOT, "lib/admin-codes.json");
const ENV_PATH = path.join(ROOT, ".env.local");

// .env.local 로드
try {
  const txt = fs.readFileSync(ENV_PATH, "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {}

const DATA_GO_KR_KEY = process.env.DATA_GO_KR_KEY;
const VWORLD_API_KEY = process.env.VWORLD_API_KEY;
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY; // VWorld 폴백(헤더 인증 → CI IP 제한 없음)
if (!DATA_GO_KR_KEY) { console.error("DATA_GO_KR_KEY missing"); process.exit(1); }
if (!VWORLD_API_KEY && !KAKAO_REST_API_KEY) console.warn("VWORLD/KAKAO 키 모두 없음 — geocoding 건너뜀");

const UA = "daum-public-housing-app/1.0 (LH API sync)";
const PG_SZ = 100;
const DELAY = 250;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 공공데이터 서버는 간헐적 connect timeout(UND_ERR_CONNECT_TIMEOUT)·5xx 가 잦다.
// 재시도가 없으면 블립 한 번에 전체 sync 가 죽는다 (야간 파이프라인 연속 실패 원인).
// sync-myhome-all.mjs 의 fetchWithRetry 와 동일 규약 — 네트워크 throw / 5xx 는 지수
// 백오프 재시도, 4xx 는 호출 측 .ok 처리에 맡기고 그대로 반환.
async function fetchWithRetry(url, init, label) {
  const MAX = 4;
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.status >= 500 && attempt < MAX) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      if (attempt >= MAX) throw new Error(`${label}: ${attempt}회 시도 실패 — ${error.message}`);
      const wait = 1000 * 2 ** (attempt - 1); // 1s → 2s → 4s
      console.log(`  ${label} 재시도 ${attempt}/${MAX} (${error.message}) — ${wait}ms 대기`);
      await sleep(wait);
    }
  }
}

// 우리가 다루는 공고유형코드
//   05 분양주택, 06 임대주택, 13 주거복지 (매입/전세 등), 39 신혼희망타운
const NOTICE_TYPES = ["05", "06", "13", "39"];

// 시도명 → 우리 districtId
const SIDO_NAME_TO_ID = {
  "서울특별시": "seoul", "부산광역시": "busan", "대구광역시": "daegu",
  "인천광역시": "incheon", "광주광역시": "gwangju", "대전광역시": "daejeon",
  "울산광역시": "ulsan", "세종특별자치시": "sejong", "경기도": "gyeonggi",
  "강원특별자치도": "gangwon", "강원도": "gangwon",
  "충청북도": "chungbuk", "충청남도": "chungnam",
  "전북특별자치도": "jeonbuk", "전라북도": "jeonbuk",
  "전라남도": "jeonnam", "경상북도": "gyeongbuk", "경상남도": "gyeongnam",
  "제주특별자치도": "jeju",
};

// ─────────────────────────────────────────────────────────────
// Phase 1: API 3 — 공고 목록
// ─────────────────────────────────────────────────────────────
async function fetchNoticePage(uppAisTpCd, page) {
  const url = new URL("http://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1");
  url.searchParams.set("serviceKey", DATA_GO_KR_KEY);
  url.searchParams.set("PG_SZ", String(PG_SZ));
  url.searchParams.set("PAGE", String(page));
  url.searchParams.set("UPP_AIS_TP_CD", uppAisTpCd);
  const label = `API3 ${uppAisTpCd} ${page}p`;
  // 공공데이터 게이트웨이가 점검·과부하 때 200 + HTML 에러 페이지를 주는 경우가 있어
  // (2026-08-22 run 전체 사망 원인) JSON 파싱 실패도 재시도 대상.
  for (let attempt = 1; ; attempt++) {
    const res = await fetchWithRetry(url, { headers: { "User-Agent": UA } }, label);
    if (!res.ok) throw new Error(`API3 HTTP ${res.status}`);
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      if (!Array.isArray(json)) return [];
      return json[1]?.dsList || [];
    } catch {
      if (attempt >= 3) throw new Error(`${label}: 3회 모두 non-JSON 응답 — ${text.slice(0, 80)}`);
      const wait = 2000 * attempt;
      console.log(`  ${label} non-JSON 응답 재시도 ${attempt}/3 — ${wait}ms 대기`);
      await sleep(wait);
    }
  }
}

async function fetchAllNotices() {
  const all = [];
  const seen = new Set();
  for (const tp of NOTICE_TYPES) {
    let page = 1;
    let total = 0;
    while (true) {
      const items = await fetchNoticePage(tp, page);
      if (!items.length) break;
      for (const it of items) {
        if (!it.PAN_ID || seen.has(it.PAN_ID)) continue;
        seen.add(it.PAN_ID);
        all.push(it);
        total++;
      }
      console.log(`  API3 type=${tp} page=${page} +${items.length}`);
      if (items.length < PG_SZ) break;
      page++;
      await sleep(DELAY);
    }
    console.log(`  → type=${tp} 누적: ${total}`);
  }
  return all;
}

// ─────────────────────────────────────────────────────────────
// Phase 2: API 2 — 공고별 공급정보 (주택형/보증금/월세/분양가)
// ─────────────────────────────────────────────────────────────
async function fetchSupply(notice) {
  const url = new URL("https://apis.data.go.kr/B552555/lhLeaseNoticeSplInfo1/getLeaseNoticeSplInfo1");
  url.searchParams.set("serviceKey", DATA_GO_KR_KEY);
  url.searchParams.set("SPL_INF_TP_CD", notice.SPL_INF_TP_CD || "");
  url.searchParams.set("CCR_CNNT_SYS_DS_CD", notice.CCR_CNNT_SYS_DS_CD || "");
  url.searchParams.set("PAN_ID", notice.PAN_ID || "");
  url.searchParams.set("UPP_AIS_TP_CD", notice.UPP_AIS_TP_CD || "");
  if (notice.AIS_TP_CD) url.searchParams.set("AIS_TP_CD", notice.AIS_TP_CD);
  // 공고 1건당 1회 호출 — 400건 넘게 도니 블립 확률이 높다. 실패해도 sync 전체는 살린다.
  let res;
  try {
    res = await fetchWithRetry(url, { headers: { "User-Agent": UA } }, `API2 ${notice.PAN_ID ?? ""}`);
  } catch (e) {
    console.log(`  API2 포기 (${e.message}) — 이 공고 공급정보 없이 진행`);
    return null;
  }
  if (!res.ok) return null;
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { return null; }
  if (!Array.isArray(json)) return null;
  return json[1] || null;
}

function extractPriceArea(supply) {
  // API 2 응답은 SPL_INF_TP_CD 별 dsList01/02/03 로 들어옴. 모든 dsList* 의 row 합쳐서 처리.
  if (!supply) return null;
  const rows = [];
  for (const [k, v] of Object.entries(supply)) {
    if (!k.startsWith("dsList") || k.endsWith("Nm")) continue;
    if (Array.isArray(v)) rows.push(...v);
  }
  if (!rows.length) return null;

  const areas = [];
  const deposits = [];
  const rents = [];
  const sales = [];
  for (const r of rows) {
    // 전용면적 (DDO_AR)
    const a = Number(r.DDO_AR);
    if (Number.isFinite(a) && a > 0) areas.push(a);
    // 임대보증금 (LS_GMY) — 단위 원
    const g = Number(String(r.LS_GMY || "").replace(/[^0-9]/g, ""));
    if (Number.isFinite(g) && g > 0) deposits.push(g);
    // 월임대료 (MM_RFE)
    const m = Number(String(r.MM_RFE || "").replace(/[^0-9]/g, ""));
    if (Number.isFinite(m) && m > 0) rents.push(m);
    // 분양가 (SIL_AMT) — 공공분양
    const s = Number(String(r.SIL_AMT || "").replace(/[^0-9]/g, ""));
    if (Number.isFinite(s) && s > 0) sales.push(s);
  }

  return {
    areaMin: areas.length ? Math.min(...areas) : null,
    areaMax: areas.length ? Math.max(...areas) : null,
    depositMin: deposits.length ? Math.min(...deposits) : 0,
    rentMin: rents.length ? Math.min(...rents) : 0,
    saleAvg: sales.length ? Math.round(sales.reduce((a, b) => a + b, 0) / sales.length) : null,
    units: rows.length,
  };
}

// ─────────────────────────────────────────────────────────────
// Phase 2.5: API 1 — 단지 정보 (rentalHouseList)
// 시도×시군구 단위로 페이징 호출하여 모든 단지 메타 수집.
// 결과를 시군구별 인덱스 + 단지명 토큰 인덱스로 변환.
// ─────────────────────────────────────────────────────────────
async function fetchComplexPage(brtcCode, signguCode, pageNo, numOfRows = 1000) {
  const url = new URL("https://data.myhome.go.kr/rentalHouseList");
  url.searchParams.set("ServiceKey", DATA_GO_KR_KEY);
  url.searchParams.set("brtcCode", brtcCode);
  url.searchParams.set("signguCode", signguCode);
  url.searchParams.set("numOfRows", String(numOfRows));
  url.searchParams.set("pageNo", String(pageNo));
  let res;
  for (let attempt = 1; ; attempt++) {
    try {
      res = await fetch(url, { headers: { "User-Agent": UA } });
      break;
    } catch (e) {
      if (attempt >= 3) throw e;
      console.log(`  API1 재시도 ${attempt}/2 (${e.message ?? e}) — ${attempt}초 대기`);
      await sleep(attempt * 1000);
    }
  }
  if (!res.ok) return { items: [], totalCount: 0 };
  const json = await res.json();
  if (json?.code !== "000") return { items: [], totalCount: 0 };
  return { items: json.hsmpList || [], totalCount: Number(json.hsmpList?.[0]?.totalCount || 0) };
}

async function fetchAllComplexes() {
  // 캐시 사용 — 이미 받은 적 있으면 재사용 (1000회/일 한도 절약)
  try {
    const cached = JSON.parse(fs.readFileSync(COMPLEXES_PATH, "utf8"));
    if (Array.isArray(cached) && cached.length > 0) {
      console.log(`  단지정보 캐시 사용: ${cached.length}건`);
      return cached;
    }
  } catch {}

  const admin = JSON.parse(fs.readFileSync(ADMIN_CODES_PATH, "utf8"));
  const all = [];
  try {
    for (const [sidoCode, sido] of Object.entries(admin)) {
      let sidoTotal = 0;
      for (const sg of sido.sigungu) {
        let page = 1;
        while (true) {
          const { items, totalCount } = await fetchComplexPage(sidoCode, sg.code, page);
          if (!items.length) break;
          all.push(...items);
          sidoTotal += items.length;
          if (all.length >= page * 1000 || items.length < 1000 || all.length >= totalCount) break;
          page++;
          await sleep(DELAY);
        }
        await sleep(DELAY);
      }
      console.log(`  API1 ${sidoCode} ${sido.name}: ${sidoTotal}건`);
    }
  } catch (e) {
    // data.myhome.go.kr 이 GH 러너(해외 IP)에서 간헐 불통 — 단지정보 없이도 sync 는 계속.
    // (좌표는 Phase 7.1 지오코딩이 보강. 성공 run 이 캐시를 만들면 이후엔 API 호출 자체를 안 함.)
    console.log(`⚠️ 단지정보 수집 실패 — 확보분 ${all.length}건으로 계속: ${e.message ?? e}`);
    return all;
  }
  fs.writeFileSync(COMPLEXES_PATH, JSON.stringify(all, null, 2));
  console.log(`  단지정보 저장: ${COMPLEXES_PATH} (${all.length}건)`);
  return all;
}

// 공고→단지 매칭 순수 함수는 scripts/lib/lh-complex-match.mjs 로 분리 (테스트 공유·오매칭 수정).

// 시도명 → 시도코드
const SIDO_NAME_TO_CODE = {
  "서울특별시": "11", "부산광역시": "26", "대구광역시": "27", "인천광역시": "28",
  "광주광역시": "29", "대전광역시": "30", "울산광역시": "31", "세종특별자치시": "36",
  "경기도": "41", "충청북도": "43", "충청남도": "44", "전라남도": "46",
  "경상북도": "47", "경상남도": "48", "제주특별자치도": "50",
  "강원특별자치도": "51", "강원도": "51", "전북특별자치도": "52", "전라북도": "52",
};

// ─────────────────────────────────────────────────────────────
// Phase 3+4: 주소 / 좌표 — 기존 데이터 매칭 우선, 부족 시 LH 페이지 scrape + VWorld
// ─────────────────────────────────────────────────────────────
const ADDR_RE = /<strong>\s*소재지\s*<\/strong>\s*([^<]+?)(?:<|$)/;
const COORD_RE = /var\s+lat_0\s*=\s*"([\d.]+)"[\s\S]{0,200}?var\s+lng_0\s*=\s*"([\d.]+)"/;

async function scrapeAddress(dtlUrl) {
  try {
    const res = await fetch(dtlUrl, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const html = await res.text();
    // 우선: 페이지 자체에 lat_0/lng_0 박혀있으면 그걸 직접
    const cm = html.match(COORD_RE);
    if (cm) {
      const lat = Number(cm[1]), lng = Number(cm[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        // 주소도 함께
        const am = html.match(ADDR_RE);
        return { lat, lng, address: am ? am[1].trim() : "", source: "page-coords" };
      }
    }
    // 좌표 없으면 주소만
    const am = html.match(ADDR_RE);
    if (am) return { address: am[1].trim(), source: "page-addr-only" };
    return null;
  } catch {
    return null;
  }
}

// Kakao 로컬 API 지오코딩 (헤더 인증 → CI에서도 안정적, VWorld IP 제한 회피).
async function kakaoGeocode(clean) {
  if (!KAKAO_REST_API_KEY) return null;
  for (const ep of ["address", "keyword"]) {
    const url = `https://dapi.kakao.com/v2/local/search/${ep}.json?query=${encodeURIComponent(clean)}&size=1`;
    try {
      const res = await fetch(url, { headers: { Authorization: "KakaoAK " + KAKAO_REST_API_KEY } });
      if (!res.ok) continue;
      const j = await res.json();
      const d = j.documents?.[0];
      if (d) {
        const lat = Number(d.y), lng = Number(d.x);
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng, source: "kakao-" + ep };
      }
    } catch {}
    await sleep(120);
  }
  return null;
}

async function vworldGeocode(addr) {
  const clean = addr.replace(/\s+/g, " ").replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (!VWORLD_API_KEY) return await kakaoGeocode(clean);
  for (const type of ["ROAD", "PARCEL"]) {
    const url = new URL("https://api.vworld.kr/req/address");
    url.searchParams.set("service", "address");
    url.searchParams.set("request", "getCoord");
    url.searchParams.set("version", "2.0");
    url.searchParams.set("crs", "epsg:4326");
    url.searchParams.set("type", type);
    url.searchParams.set("format", "json");
    url.searchParams.set("address", clean);
    url.searchParams.set("key", VWORLD_API_KEY);
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) continue;
      const json = await res.json();
      if (json?.response?.status === "OK") {
        const p = json.response.result?.point;
        if (p) {
          const lat = Number(p.y), lng = Number(p.x);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            return { lat, lng, source: type === "ROAD" ? "vworld-road" : "vworld-parcel" };
          }
        }
      }
    } catch {}
    await sleep(120);
  }
  return await kakaoGeocode(clean); // VWorld 실패 시 Kakao 폴백
}

// ─────────────────────────────────────────────────────────────
// Phase 5: 정규화
// ─────────────────────────────────────────────────────────────
function mapType(notice) {
  const tp = notice.UPP_AIS_TP_CD;
  const sub = notice.AIS_TP_CD_NM || "";
  const name = notice.PAN_NM || "";
  if (tp === "05" || tp === "39") return "sale";
  // 06/13 임대 계열 — 세부 매핑
  const blob = sub + " " + name;
  if (blob.includes("행복")) return "happy";
  if (blob.includes("국민임대")) return "nation";
  if (blob.includes("영구임대")) return "perm";
  if (blob.includes("매입임대")) return "buy";
  if (blob.includes("전세임대")) return "jeonse";
  if (blob.includes("50년")) return "fifty";
  if (blob.includes("통합공공임대") || blob.includes("든든")) return "integ";
  return "nation";
}

function mapStatus(panSs) {
  if (panSs === "공고중") return "upcoming";
  if (panSs === "접수중" || panSs === "정정공고중" || panSs === "상담요청") return "open";
  if (panSs === "접수마감" || panSs === "모집중지") return "closed";
  return "open";
}

// 상세 페이지에서 직접 추출한 "공고상태" 우선 사용. detail status 없으면 PAN_SS fallback.
// PAN_SS 는 API sync 시점의 값이라 stale 일 수 있는 반면, 페이지 status 는 사용자가 보는 실시간 값.
function resolveStatus(panSs, detailStatus) {
  if (detailStatus) return mapStatus(detailStatus);
  return mapStatus(panSs);
}

// API 1 응답이 빈 객체(`{}`)로 직렬화돼 들어오는 필드가 있어서 string/number 만 살리고 나머진 null.
function strOrNull(v) {
  return typeof v === "string" && v.trim() ? v : null;
}
function numOrNull(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// 공고 scope 추론 — 매입/전세임대 같은 다지점 광역 공고는 단일 좌표 의미 없음.
// 시도 중앙에 잘못된 핀 찍는 대신 명시적으로 분류해서 UI에서 별도 처리.
// (주의: "예비입주자"는 단지 공고에서도 흔히 쓰이는 보일러플레이트라 키워드에서 제외)
function inferScope(notice, mappedType) {
  if (mappedType === "buy" || mappedType === "jeonse") return "regional";
  const t = notice.PAN_NM || "";
  const d = notice.CNP_CD_NM || "";
  if (d === "전국" || /외$/.test(d)) return "regional";
  if (/전국|상시모집|기숙사형|전세형|든든전세/.test(t)) return "regional";
  return "single";
}

// ─────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Phase 1: API 3 (공고 목록) ===");
  const notices = await fetchAllNotices();
  console.log(`총 공고: ${notices.length}\n`);

  console.log("=== Phase 2.5: API 1 (단지 정보) ===");
  const complexes = await fetchAllComplexes();
  const { byKey: complexesByKey } = buildComplexIndex(complexes);
  console.log(`총 단지: ${complexes.length}\n`);

  // 기존 데이터 인덱싱 (sourceUrl 의 panId 추출 → API 3 PAN_ID 와 매칭 + 사진 보존)
  let existing = [];
  try { existing = JSON.parse(fs.readFileSync(EXISTING_PATH, "utf8")); } catch {}
  const existingByPanId = new Map();
  for (const r of existing) {
    const m = (r.sourceUrl || "").match(/[?&]panId=(\d+)/i) ||
              (r.sourceUrl || "").match(/PAN_ID:(\d+)/);
    if (m) existingByPanId.set(m[1], r);
  }
  console.log(`기존 lh-notices-all.json: ${existing.length}건 (panId 인덱싱: ${existingByPanId.size})\n`);

  // 당첨자 발표일(winnerDate) — myhome API 캐시에 panId 별로 이미 수집됨. sourceUrl 의 panId 로 인덱싱.
  // (LH 청약플러스 API 에는 발표일이 없어 그동안 비어 있었음.)
  const winnerByPan = new Map();
  try {
    const myhome = JSON.parse(fs.readFileSync(MYHOME_PATH, "utf8"));
    for (const m of myhome) {
      const p = (m.sourceUrl || "").match(/[?&]panId=(\w+)/i)?.[1];
      if (p && m.winnerDate && /\d{4}/.test(m.winnerDate)) {
        winnerByPan.set(p, m.winnerDate);
        winnerByPan.set(p.replace(/^0+/, ""), m.winnerDate); // 0패딩 무시 매칭
      }
    }
    console.log(`myhome 당첨발표일 인덱스: ${winnerByPan.size}개 키\n`);
  } catch { console.warn("myhome-all-notices.json 없음 — winnerAt 건너뜀\n"); }

  const listings = [];
  let supplyOk = 0, supplyFail = 0;
  let complexMatched = 0;
  let coordExisting = 0, coordPage = 0, coordVworld = 0, coordNone = 0;

  for (const [i, n] of notices.entries()) {
    const id = String(n.PAN_ID);

    // Phase 2: API 2 공급정보 (가격/면적)
    const supply = await fetchSupply(n);
    const pa = extractPriceArea(supply);
    if (pa) supplyOk++; else supplyFail++;
    await sleep(DELAY);

    // Phase 2.5: API 1 단지정보 매칭 (시도 일치 + 단지명 keyword)
    const sidoCode = SIDO_NAME_TO_CODE[n.CNP_CD_NM];
    const matchedComplex = findMatchingComplex(n, complexesByKey, sidoCode);
    if (matchedComplex) complexMatched++;

    // Phase 3+4: 주소/좌표
    // 우선순위: 단지매칭(API 1)+VWorld > 기존 데이터 좌표 > 페이지 scrape > VWorld(페이지 주소)
    // VWorld 실패 / 키없음 시에도 ex 좌표 fallback 으로 가도록 — 옛 데이터 좌표 살림.
    const ex = existingByPanId.get(id);
    const hasExCoord = ex && ex.lat && ex.lng && ex.geocoded && ex.geocoded !== "sido-center";
    let lat = null, lng = null, address = "", geocoded = "none";

    if (matchedComplex?.rnAdres && (VWORLD_API_KEY || KAKAO_REST_API_KEY)) {
      address = matchedComplex.rnAdres;
      const gc = await vworldGeocode(address);
      if (gc) {
        lat = gc.lat; lng = gc.lng; geocoded = "api1-" + gc.source;
        coordVworld++;
      } else if (hasExCoord) {
        lat = ex.lat; lng = ex.lng; geocoded = ex.geocoded + "+api1-addr";
        coordExisting++;
      } else {
        geocoded = "api1-addr-only";
        coordNone++;
      }
      await sleep(DELAY);
    } else if (hasExCoord) {
      // VWorld 없거나 API1 매칭 안된 경우: ex 좌표 fallback
      lat = ex.lat; lng = ex.lng;
      address = matchedComplex?.rnAdres || ex.address || "";
      geocoded = ex.geocoded;
      coordExisting++;
    } else {
      // 페이지 scrape
      const sc = await scrapeAddress(n.DTL_URL);
      await sleep(DELAY);
      if (sc?.lat && sc?.lng) {
        lat = sc.lat; lng = sc.lng; address = sc.address || ""; geocoded = "page-coords";
        coordPage++;
      } else if (sc?.address && (VWORLD_API_KEY || KAKAO_REST_API_KEY)) {
        const gc = await vworldGeocode(sc.address);
        if (gc) {
          lat = gc.lat; lng = gc.lng; address = sc.address; geocoded = gc.source;
          coordVworld++;
        } else {
          address = sc.address; geocoded = "addr-only";
          coordNone++;
        }
        await sleep(DELAY);
      } else {
        coordNone++;
      }
    }

    // 보증금/월세: API 2 (공고별 공급정보) 우선, 없으면 API 1 (단지 기본금액) fallback
    const depositWon = pa?.depositMin || matchedComplex?.bassRentGtn || 0;
    const rentWon = pa?.rentMin || matchedComplex?.bassMtRntchrg || 0;
    const area = pa && pa.areaMin && pa.areaMax
      ? (pa.areaMin === pa.areaMax ? `${pa.areaMin}` : `${pa.areaMin}~${pa.areaMax}`)
      : (matchedComplex?.suplyPrvuseAr ? String(matchedComplex.suplyPrvuseAr) : "");

    // Phase 5: 정규화 → Listing 타입
    const type = mapType(n);
    const scope = inferScope(n, type);
    const listing = {
      id: `lh-${type === "sale" ? "sale" : "rental"}-${id}`,
      pblancId: id,
      title: n.PAN_NM,
      noticeTitle: n.PAN_NM,
      type,
      scope,
      agency: "LH",
      district: n.CNP_CD_NM || "",
      districtId: SIDO_NAME_TO_ID[n.CNP_CD_NM] || null,
      status: resolveStatus(n.PAN_SS, ex?.details?.noticeStatus),
      deadline: n.CLSG_DT || "",
      announceDate: n.PAN_NT_ST_DT || "",
      winnerAt: winnerByPan.get(id) || winnerByPan.get(String(id).replace(/^0+/, "")) || undefined,
      address,
      lat, lng, geocoded,
      // 가격/면적
      area,
      depositManwon: depositWon ? Math.round(depositWon / 10000) : 0,
      monthlyRentManwon: rentWon ? Math.round(rentWon / 10000) : 0,
      salePriceManwon: pa?.saleAvg ? Math.round(pa.saleAvg / 10000) : null,
      supplyUnits: pa?.units ?? matchedComplex?.hshldCo ?? null,
      // 단지 메타 (API 1 매칭된 경우) — 빈객체 응답 방어
      complexName: strOrNull(matchedComplex?.hsmpNm),
      pnu: strOrNull(matchedComplex?.pnu),
      houseType: strOrNull(matchedComplex?.houseTyNm),
      heatMethod: strOrNull(matchedComplex?.heatMthdDetailNm),
      parkngCo: numOrNull(matchedComplex?.parkngCo),
      // 사진 보존
      coverPhotoUrl: ex?.coverPhotoUrl ?? null,
      coverPhotoLocal: ex?.coverPhotoLocal ?? null,
      // LH 메타
      sourceUrl: n.DTL_URL || "",
      thumbSeed: i,
    };
    listings.push(listing);

    if ((i + 1) % 50 === 0) console.log(`  진행: ${i + 1}/${notices.length}`);
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(listings, null, 2));
  await recordSync("lh", listings.length);
  console.log(`\n저장: ${OUT_PATH}`);
  console.log(`  공급정보 추출: 성공 ${supplyOk} / 실패 ${supplyFail}`);
  console.log(`  단지 매칭 (API 1): ${complexMatched} / ${notices.length}`);
  console.log(`  좌표 출처: 기존 ${coordExisting} / 페이지 ${coordPage} / VWorld+API1 ${coordVworld} / 없음 ${coordNone}`);

  // 분포 요약
  const sBy = new Map(), tBy = new Map();
  for (const l of listings) {
    sBy.set(l.status, (sBy.get(l.status) || 0) + 1);
    tBy.set(l.type, (tBy.get(l.type) || 0) + 1);
  }
  console.log("\n--- status ---");
  [...sBy.entries()].forEach(([k, v]) => console.log(`  ${v.toString().padStart(4)} ${k}`));
  console.log("--- type ---");
  [...tBy.entries()].forEach(([k, v]) => console.log(`  ${v.toString().padStart(4)} ${k}`));

  // ── Phase 6: 단지조감도 보강 (enrich-photos-api 재사용) ──
  // 목록 저장(위) 후 실행 → listings-api.json 을 다시 읽어 coverPhotoUrl/Local 채움.
  console.log("\n=== Phase 6: 단지조감도 보강 ===");
  try {
    const { main: enrichPhotos } = await import("./enrich-photos-api.mjs");
    await enrichPhotos();
  } catch (e) {
    console.error("조감도 보강 실패 (목록은 저장됨):", e.message);
  }

  // ── Phase 7: 좌표 없는 활성 매물 지오코딩 자동 보강 (재발 방지) ──
  // sync 를 단독 실행(node scripts/sync-lh-api.mjs)해도 좌표 누락 없이 끝나도록 항상 실행.
  // 과거 sync 만 돌리고 geocode 를 빼먹어 LH 가 지도에서 축소돼 보이던 문제 원천 차단.
  console.log("\n=== Phase 7: 좌표 보강 (geocode-missing-coords) ===");
  if (!process.env.VWORLD_API_KEY) {
    console.warn("  VWORLD_API_KEY 없음 → 좌표 보강 스킵. `npm run sync:lh` 또는 --env-file 로 실행하세요.");
  } else {
    try {
      const { execSync } = await import("node:child_process");
      execSync(`node "${path.join(ROOT, "scripts/geocode-missing-coords.mjs")}"`, { stdio: "inherit", env: process.env });
    } catch (e) {
      console.error("좌표 보강 실패 (목록은 저장됨):", e.message);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
