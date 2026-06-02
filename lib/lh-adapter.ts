import type { District, HousingTypeId, Listing, StatusId } from "./types";
import apiListings from "./listings-api.json";
import BLOB_COVERS from "./blob-covers.json";
import allNotices from "./lh-notices-all.json";
import dundeonSeoul from "./dundeon-seoul.json";
import mappedRegional from "./mapped-regional.json";
import { applyOverride } from "./manual-overrides";

// lh-notices-all 에는 listings-api 에 없는 raw 상태 필드 (noticeStatus, progressStatus) 가 있음.
// pblancId 로 lookup 만들어 매칭. 빌드/서버 초기화 시 1회만 실행.
interface RawNotice {
  pblancId?: string;
  noticeStatus?: string;
  progressStatus?: string;
  announceDate?: string;
}
const RAW_BY_PANID: Map<string, RawNotice> = (() => {
  const arr = allNotices as unknown as RawNotice[];
  const m = new Map<string, RawNotice>();
  for (const n of arr) {
    if (n?.pblancId) m.set(String(n.pblancId), n);
  }
  return m;
})();

// LH 공공데이터 API 3종 + VWorld 통합 sync 결과 (scripts/sync-lh-api.mjs)
// 일부 메타 필드는 API1 응답이 빈 객체(`{}`)로 직렬화돼 들어오는 경우가 있어 unknown 으로 받고 런타임에 정규화.
interface ApiListing {
  id: string;
  pblancId: string;
  title: string;
  noticeTitle: string;
  type: string;
  agency: string;
  district: string;
  districtId: string | null;
  status: string;
  deadline: string;
  announceDate: string;
  address: string;
  lat: number | null;
  lng: number | null;
  geocoded: string;
  area: string;
  depositManwon: number;
  monthlyRentManwon: number;
  salePriceManwon: number | null;
  supplyUnits: number | null;
  complexName: string | null;
  pnu: string | null;
  houseType: unknown;
  heatMethod: unknown;
  parkngCo: number | null;
  coverPhotoUrl: string | null;
  coverPhotoLocal: string | null;
  sourceUrl: string;
  thumbSeed: number;
  scope?: "single" | "regional"; // sync v2+ 부터 채워짐 — 광역 공고는 지도에서 제외
  eligibilityKeys?: string[];    // enrich-eligibility 가 PDF 에서 추출한 매물별 자격 키
  complexes?: unknown;           // enrich-complexes 가 채우는 단지별 표 (Listing.complexes 로 그대로 전달)
}

function safeString(v: unknown): string {
  return typeof v === "string" && v.trim() ? v : "";
}

// "29.63~46.52" → "29~46㎡". 소수점 raw 노출이 부담스러워 반올림 + 단위.
function formatArea(area: string): string {
  if (!area) return "";
  const parts = area.split("~").map((s) => Number(s)).filter((n) => Number.isFinite(n) && n > 0);
  if (!parts.length) return "";
  const lo = Math.round(Math.min(...parts));
  const hi = Math.round(Math.max(...parts));
  return lo === hi ? `${lo}㎡` : `${lo}~${hi}㎡`;
}

// PDF 휴리스틱 추출 시 발생한 outlier 거르기 (만원 단위).
// 예: 국민임대 보증금이 2.28억 같은 경우는 PDF 표가 깨져 분양가가 들어간 케이스로 추정.
const PRICE_GUARD: Record<string, { deposit: number; rent: number }> = {
  happy:  { deposit: 10000, rent: 50 },   // 1억 / 50만
  nation: { deposit: 15000, rent: 80 },   // 1.5억 / 80만
  perm:   { deposit: 5000,  rent: 30 },   // 5천 / 30만
  fifty:  { deposit: 20000, rent: 80 },
  integ:  { deposit: 20000, rent: 80 },
  buy:    { deposit: 30000, rent: 100 },
  jeonse: { deposit: 30000, rent: 50 },
};

function guardPrice(type: string, deposit: number, rent: number): [number, number] {
  const g = PRICE_GUARD[type];
  if (!g) return [deposit, rent];
  const d = deposit > g.deposit ? 0 : deposit;
  const r = rent > g.rent ? 0 : rent;
  return [d, r];
}

// 매물 type 별 기본 자격 키 (ELIGIBILITY_LABELS 와 짝). 매물별 완화 조건 등은
// 공고문 확인이 필요하지만, 기본값은 LH 공식 안내 기준.
// 키 → ELIGIBILITY_LABELS 에서 풀어 표시.
const ELIGIBILITY_BY_TYPE: Record<string, string[]> = {
  happy:  ["청년", "신혼", "자녀", "고령", "대학생", "한부모", "무주택", "소득100", "자산", "거주10"],
  nation: ["무주택", "소득70", "자산", "자동차", "거주30"],
  perm:   ["수급", "차상위", "한부모", "장애", "국가유공", "북한이탈", "거주50"],
  fifty:  ["무주택", "소득70", "자산", "거주50"],
  integ:  ["무주택", "소득100", "소득150", "자산", "거주30"],
  buy:    ["청년", "신혼", "자녀", "무주택", "소득70", "자산"],
  jeonse: ["청년", "신혼", "무주택", "소득70"],
  sale:   ["무주택", "청약저축"],
};

// 자격 키 정렬 우선순위 — 계층 > 기본 조건 > 소득/자산. 카드 slice(0,2) 시 더 직관적인 라벨이 먼저.
const ELIGIBILITY_ORDER: string[] = [
  "청년", "신혼", "자녀", "고령", "대학생", "한부모",
  "수급", "차상위", "장애", "국가유공", "북한이탈",
  "무주택", "청약저축",
  "소득70", "소득100", "소득150", "자산", "자동차",
  "거주10", "거주30", "거주50",
];
function sortEligibility(keys: string[]): string[] {
  const idx = (k: string) => {
    const i = ELIGIBILITY_ORDER.indexOf(k);
    return i < 0 ? 999 : i;
  };
  return [...keys].sort((a, b) => idx(a) - idx(b));
}

interface SidoEntry {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

const SIDOS: SidoEntry[] = [
  { id: "seoul", name: "서울특별시", lat: 37.5665, lng: 126.978 },
  { id: "gyeonggi", name: "경기도", lat: 37.4138, lng: 127.5183 },
  { id: "incheon", name: "인천광역시", lat: 37.4563, lng: 126.7052 },
  { id: "busan", name: "부산광역시", lat: 35.1796, lng: 129.0756 },
  { id: "daegu", name: "대구광역시", lat: 35.8714, lng: 128.6014 },
  { id: "gwangju", name: "광주광역시", lat: 35.1595, lng: 126.8526 },
  { id: "daejeon", name: "대전광역시", lat: 36.3504, lng: 127.3845 },
  { id: "ulsan", name: "울산광역시", lat: 35.5384, lng: 129.3114 },
  { id: "sejong", name: "세종특별자치시", lat: 36.4801, lng: 127.289 },
  { id: "gangwon", name: "강원특별자치도", lat: 37.8228, lng: 128.1555 },
  { id: "chungbuk", name: "충청북도", lat: 36.6358, lng: 127.4914 },
  { id: "chungnam", name: "충청남도", lat: 36.5184, lng: 126.8 },
  { id: "jeonbuk", name: "전북특별자치도", lat: 35.7175, lng: 127.153 },
  { id: "jeonnam", name: "전라남도", lat: 34.8161, lng: 126.463 },
  { id: "gyeongbuk", name: "경상북도", lat: 36.576, lng: 128.5057 },
  { id: "gyeongnam", name: "경상남도", lat: 35.4606, lng: 128.2132 },
  { id: "jeju", name: "제주특별자치도", lat: 33.4996, lng: 126.5312 },
];

// loose=true 면 광역(regional)·좌표없는 매물도 adapt — "전국 모집" 섹션 / 어드민 검수용.
// 지도에 띄울 수 없으므로 메인 LH_LISTINGS 에는 안 들어가고 LH_REGIONAL_LISTINGS 로 분리.
function adaptApi(r: ApiListing, loose = false): Listing | null {
  if (!loose) {
    // 광역(매입임대/전세형 등 다지점) 공고는 단일 좌표 의미 없음 → 지도 노출 제외.
    if (r.scope === "regional") return null;
    if (!r.lat || !r.lng) return null;
    if (!r.districtId) return null;
  }
  const [deposit, rent] = guardPrice(r.type, r.depositManwon || 0, r.monthlyRentManwon || 0);
  const raw = RAW_BY_PANID.get(r.pblancId);
  return {
    id: r.id,
    pblancId: r.pblancId,
    title: r.title,
    noticeStatus: raw?.noticeStatus || undefined,
    progressStatus: raw?.progressStatus || undefined,
    announceDate: raw?.announceDate || r.announceDate || undefined,
    type: r.type as HousingTypeId,
    agency: "LH",
    districtId: r.districtId || "nationwide",
    district: r.district || "전국",
    lat: r.lat ?? 0,
    lng: r.lng ?? 0,
    address: r.address || "",
    pnu: r.pnu || undefined,
    deposit,
    rent,
    area: formatArea(r.area || ""),
    layout: "",
    totalUnits: r.supplyUnits ?? null,
    supplyUnits: r.supplyUnits ?? null,
    heatMethod: safeString(r.heatMethod),
    salePriceManwon: r.salePriceManwon,
    status: r.status as StatusId,
    deadline: r.deadline || "",
    beginDate: r.announceDate || "",
    // 매물별 PDF 에서 추출된 자격 키 우선 (정확). 없으면 type 기본값.
    eligible: sortEligibility(
      (Array.isArray(r.eligibilityKeys) && r.eligibilityKeys.length)
        ? r.eligibilityKeys
        : (ELIGIBILITY_BY_TYPE[r.type] || [])
    ),
    features: [],
    transit: "",
    competition: null,
    thumbSeed: r.thumbSeed,
    suplyTyNm: safeString(r.houseType) || undefined,
    complexes: Array.isArray(r.complexes) ? (r.complexes as Listing["complexes"]) : undefined,
    pblancNm: r.noticeTitle,
    sourceUrl: r.sourceUrl,
    coverPhotoUrl: resolveCoverPhoto(r.coverPhotoLocal, r.coverPhotoUrl),
  };
}

// 매핑: filename → Vercel Blob URL.
// 로컬 dev 에서도 Blob URL 우선 사용 (이미 업로드된 매물은 prod와 동일하게 표시).
// 매핑 없는 매물은 localPath fallback (public/lh-covers/).
function resolveCoverPhoto(localPath: string | null, urlFallback: string | null): string | undefined {
  if (localPath) {
    const filename = localPath.split("/").pop() ?? "";
    const blobUrl = (BLOB_COVERS as Record<string, string>)[filename];
    if (blobUrl) return blobUrl;
    return localPath;
  }
  return urlFallback || undefined;
}

// 다중 단지 매물 분리: 한 공고에 여러 단지가 묶인 경우 (시흥시 10년 공공임대 = 11 단지 등)
// 각 단지를 별도 Listing 으로 분리. 좌표는 단지별, 가격/면적은 원본 공유.
// (단지별 표 컬럼 매핑이 LH 페이지마다 달라 raw 값 신뢰 어려움 — 추후 보강)
function splitByComplex(base: Listing, raw: ApiListing): Listing[] {
  const complexes = Array.isArray(raw.complexes) ? (raw.complexes as Array<{
    name: string | null;
    rows: Array<{ houseType: string; area: number; supplyTotal: number | null; supplyThisRound: number | null; deposit: number | null; rent: number | null }>;
    lat: number | null;
    lng: number | null;
  }>) : [];
  const usable = complexes.filter((c) => c.lat && c.lng);
  if (usable.length < 2) return [base];

  return usable.map((c, idx) => ({
    ...base,
    id: `${base.id}-c${idx}`,
    title: c.name ? `${base.title} (${c.name})` : base.title,
    lat: c.lat!,
    lng: c.lng!,
    complexes: [{ name: c.name, rows: c.rows }], // 분리 후엔 그 단지 표만
  }));
}

const ALL: Listing[] = (apiListings as unknown as ApiListing[])
  .flatMap((r) => {
    const base = adaptApi(r);
    if (!base) return [];
    return splitByComplex(base, r);
  })
  .map(applyOverride);

// 같은 공고가 정정공고/재게시 형태로 여러 번 올라오는 경우 dedupe.
// title 에서 [정정공고]/[재게시] 같은 접두 라벨을 떼고 남는 본 title 로 그룹핑 → 그룹당 1건.
// 우선순위: 정정공고 > active(open/upcoming) > 최근 announceDate > pblancId desc
function groupKey(title: string): string {
  return (title || "").replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
}

function dedupeListings(items: Listing[]): Listing[] {
  const groups = new Map<string, Listing[]>();
  for (const it of items) {
    const k = groupKey(it.title);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(it);
  }
  const out: Listing[] = [];
  for (const arr of groups.values()) {
    if (arr.length === 1) { out.push(arr[0]); continue; }
    arr.sort((a, b) => {
      const aRev = /정정/.test(a.title) ? 1 : 0;
      const bRev = /정정/.test(b.title) ? 1 : 0;
      if (aRev !== bRev) return bRev - aRev;
      const aActive = a.status === "closed" ? 0 : 1;
      const bActive = b.status === "closed" ? 0 : 1;
      if (aActive !== bActive) return bActive - aActive;
      const aDate = a.beginDate || "";
      const bDate = b.beginDate || "";
      if (aDate !== bDate) return aDate < bDate ? 1 : -1;
      return (b.pblancId || "").localeCompare(a.pblancId || "");
    });
    out.push(arr[0]);
  }
  return out;
}

// ── 서울 든든전세 (광역 1건) 의 개별 주택 103건 — 지도 표시용으로 분리 ──
// xlsx 주택목록 → VWorld geocoding (scripts/geocode-dundeon.mjs) → lib/dundeon-seoul.json.
// 모 매물 메타(type/자격/일정)는 상속, 위치/면적/보증금만 주택별로.
const DUNDEON_SEOUL_PID = "2015122300019992";
interface DundeonUnit {
  seq: number; group: string; addressRaw: string; address: string;
  dong: string | null; ho: string | null; sizeType: string | null;
  areaExclusive: number | null; rooms: string | null; floor: string | null;
  houseType: string | null; depositManwon: number | null;
  lat: number | null; lng: number | null;
}
function buildDundeonSeoulListings(): Listing[] {
  const parent = (apiListings as unknown as ApiListing[]).find((r) => r.pblancId === DUNDEON_SEOUL_PID);
  if (!parent) return [];
  const base = adaptApi(parent, true);
  if (!base) return [];
  return (dundeonSeoul as DundeonUnit[])
    .filter((u) => u.lat != null && u.lng != null)
    .map((u) => ({
      ...base,
      id: `lh-rental-${DUNDEON_SEOUL_PID}-h${u.seq}`,
      title: `${u.group}${u.dong ? ` ${u.dong}동` : ""}${u.ho ? ` ${u.ho}호` : ""} · 든든전세`,
      districtId: "seoul",
      district: "서울특별시",
      lat: u.lat!,
      lng: u.lng!,
      address: u.addressRaw,
      deposit: u.depositManwon ?? 0,
      rent: 0,
      area: u.areaExclusive ? `${Math.round(u.areaExclusive)}㎡` : "",
      supplyUnits: 1,
      suplyTyNm: u.houseType ?? undefined,
      complexes: undefined,
    }));
}

// ── 광역/좌표없음 매물 중 지오코딩으로 지도에 올린 것 (든든전세 방식 일반화) ──
// lib/mapped-regional.json: pblancId → { districtId, district, points[{lat,lng,...}] }.
// 단일단지면 point 1개(대표 1핀), 흩어진 주택목록이면 point N개(주택별 핀).
// 모 매물 메타 상속 + point별 위치/가격 덮어쓰기. 해당 pblancId 는 전국모집에서 제외.
interface MappedPoint {
  lat: number; lng: number; address?: string; label?: string;
  area?: string; depositManwon?: number; rentManwon?: number; units?: number;
}
interface MappedCfg { districtId?: string; district?: string; points: MappedPoint[]; }
const MAPPED_REGIONAL = mappedRegional as Record<string, MappedCfg>;
const MAPPED_REGIONAL_PIDS = new Set(Object.keys(MAPPED_REGIONAL));

function buildMappedRegionalListings(): Listing[] {
  const out: Listing[] = [];
  for (const [pid, cfg] of Object.entries(MAPPED_REGIONAL)) {
    const parent = (apiListings as unknown as ApiListing[]).find((r) => r.pblancId === pid);
    if (!parent) continue;
    const base = adaptApi(parent, true);
    if (!base) continue;
    const multi = cfg.points.length > 1;
    cfg.points.forEach((p, i) => {
      out.push({
        ...base,
        id: multi ? `${base.id}-m${i}` : base.id,
        lat: p.lat,
        lng: p.lng,
        districtId: cfg.districtId ?? base.districtId,
        district: cfg.district ?? base.district,
        ...(p.address && { address: p.address }),
        ...(p.label && { title: p.label }),
        ...(p.area && { area: p.area }),
        ...(p.depositManwon != null && { deposit: p.depositManwon }),
        ...(p.rentManwon != null && { rent: p.rentManwon }),
        ...(p.units != null && { supplyUnits: p.units }),
        complexes: undefined,
      });
    });
  }
  return out.map(applyOverride);
}

export const LH_LISTINGS: Listing[] = [
  ...dedupeListings(ALL),
  ...buildDundeonSeoulListings(),
  ...buildMappedRegionalListings(),
];

// 광역(regional) 또는 좌표 없는 매물 — 지도/메인 리스트에서 빠진 것들.
// "전국 모집" 섹션 + 어드민 검수 큐용. LH_LISTINGS 와 중복 없음.
const mainIds = new Set(ALL.map((l) => l.pblancId));
const REGIONAL: Listing[] = (apiListings as unknown as ApiListing[])
  .flatMap((r) => {
    // 이미 메인에 들어간 매물 (scope single + 좌표 + districtId) 은 제외.
    if (mainIds.has(r.pblancId)) return [];
    // 서울 든든전세는 개별 주택으로 지도 분리됨 → 전국 모집 중복 제외.
    if (r.pblancId === DUNDEON_SEOUL_PID) return [];
    // 지오코딩으로 지도에 올린 광역 매물 → 전국 모집 중복 제외.
    if (MAPPED_REGIONAL_PIDS.has(r.pblancId ?? "")) return [];
    const base = adaptApi(r, true);
    return base ? [applyOverride(base)] : [];
  });
export const LH_REGIONAL_LISTINGS: Listing[] = dedupeListings(REGIONAL);

// 어드민 검수용 — 지도 노출 매물 + 광역 매물 전체. 검수 큐는 지도와 무관하므로 다 포함.
export const LH_ADMIN_LISTINGS: Listing[] = [...LH_LISTINGS, ...LH_REGIONAL_LISTINGS];

export function buildDistricts(listings: Listing[]): District[] {
  const counts = new Map<string, number>();
  // 시도별 listing 좌표 누적 — 시도 기하학적 중심 대신 실제 listing 분포의 평균(centroid)으로
  // 마커 위치 잡기. 경기도처럼 면적이 넓은 시도는 중심점이 실제 매물 분포와 떨어져 어색했음.
  const sums = new Map<string, { latSum: number; lngSum: number; n: number }>();
  for (const l of listings) {
    counts.set(l.districtId, (counts.get(l.districtId) ?? 0) + 1);
    const s = sums.get(l.districtId) ?? { latSum: 0, lngSum: 0, n: 0 };
    s.latSum += l.lat;
    s.lngSum += l.lng;
    s.n += 1;
    sums.set(l.districtId, s);
  }
  return SIDOS.filter((s) => counts.has(s.id)).map((s, idx) => {
    const c = sums.get(s.id);
    return {
      id: s.id,
      name: s.name,
      x: idx,
      y: idx,
      lat: c && c.n > 0 ? c.latSum / c.n : s.lat,
      lng: c && c.n > 0 ? c.lngSum / c.n : s.lng,
      count: counts.get(s.id) ?? 0,
    };
  });
}

export const LH_DISTRICTS: District[] = buildDistricts(LH_LISTINGS);
