import type { District, HousingTypeId, Listing, StatusId } from "./types";
import apiListings from "./listings-api.json";
import allNotices from "./lh-notices-all.json";
import dundeonSeoul from "./dundeon-seoul.json";
import mappedRegional from "./mapped-regional.json";
import housingGroupsRaw from "./housing-groups.json";
import blobCovers from "./blob-covers.json";
import { applyOverride } from "./manual-overrides";
import { effectiveStatus } from "./dday";
import { SH_ADMIN_LISTINGS, SH_PUBLIC_LISTINGS } from "./sh-adapter";
import { YOUTH_ADMIN_LISTINGS, YOUTH_PUBLIC_LISTINGS } from "./youth-adapter";
import noticeTextMeta from "./notice-texts/_meta.json";
import competitionMap from "./competition.json";
import competitionHistory from "./competition-history.json";

// 공고별 경쟁률 — scripts/sync-competition.mjs 출력 (pblancId → { competition, ... })
const COMPETITION = competitionMap as Record<string, { competition: number }>;

// 단지별 과거 회차 경쟁률 이력 — 본인 결과(COMPETITION)가 없는 매물에 "지난 회차 경쟁률" 참조용.
// 매칭은 보수적으로: 단지명 core(블록/단지 suffix 제거, 4자 이상)가 제목·단지명에 그대로 포함 + 유형 일치.
type CompetitionHistoryEntry = {
  name: string; type: string; competition: number; noticeDate: string;
};
const HISTORY_TYPE_TO_ID: Record<string, string[]> = {
  "행복주택": ["happy"], "국민임대": ["nation"], "영구임대": ["perm"],
  "통합공공임대": ["integ"], "매입임대": ["buy"], "전세임대": ["jeonse"],
  "분양주택": ["sale"], "신혼희망타운": ["sale"], "공공분양(신혼희망)": ["sale"], "공공임대": ["fifty"],
};
// 공백/구두점 제거 + 블록 표기 통일 ("1단지"→"1", "S-1블록"→"S1", "2BL"→"2")
// → "고양창릉 S-4블록" 매물이 "고양창릉 S-1블록" 이력과 오매칭되지 않게 블록 식별자 보존.
const normCompText = (s: string) =>
  s.replace(/[\s()[\]·,._\-]/g, "").replace(/(\d|[A-Z])(단지|블록|BL)/g, "$1");
const TYPE_SUFFIX_RE =
  /(행복주택|국민임대주택|국민임대|통합공공임대주택|통합공공임대|공공임대주택|공공임대|영구임대|신혼희망타운|매입임대주택|매입임대|아파트)+$/;
const BLOCK_SUFFIX_RE = /(LH\d*|[A-Z]\d+|\d+|단지|블록|BL|지구)+$/;
const stripLoop = (s: string, re: RegExp) => {
  for (let prev = ""; prev !== s; ) { prev = s; s = s.replace(re, ""); }
  return s;
};
// noticeDate 내림차순 정렬돼 있음(sync-competition) → 첫 hit 이 최신 회차.
// nameCore: 유형어+블록 제거 (철원갈말행복주택→철원갈말) / nameWithBlock: 유형어만 제거 (고양창릉S1)
const HISTORY_ENTRIES = (competitionHistory as CompetitionHistoryEntry[])
  .map((h) => {
    const nameWithBlock = stripLoop(normCompText(h.name), TYPE_SUFFIX_RE);
    return { ...h, nameWithBlock, nameCore: stripLoop(nameWithBlock, BLOCK_SUFFIX_RE) };
  })
  .filter((h) => h.nameCore.length >= 4 && Number.isFinite(h.competition));
function findPrevCompetition(type: string, title: string, complexName?: string | null): number | null {
  const blob = normCompText(title + (complexName || ""));
  for (const h of HISTORY_ENTRIES) {
    if (!(HISTORY_TYPE_TO_ID[h.type] || []).includes(type)) continue;
    // 이력에 블록 표기가 있으면 블록까지 정확히 일치해야 함 (S-1 이력 ≠ S-4 매물).
    // 블록 없는 단지 단위 이력은 core 포함으로 매칭 (철원갈말 ↔ 철원갈말2 행복주택).
    const key = h.nameWithBlock !== h.nameCore ? h.nameWithBlock : h.nameCore;
    if (blob.includes(key)) return h.competition;
  }
  return null;
}

// 공고문 PDF 직접 열기(M2) — enrich 가 기록한 pdfFileid 로 LH 파일서버 URL 구성.
// 키는 base id(lh-rental-{panId}) — listing id 의 -c0 등 suffix 제거 후 조회.
const PDF_META: Record<string, { pdfFileid?: string }> =
  (noticeTextMeta as { entries?: Record<string, { pdfFileid?: string }> }).entries ?? {};
// raw complexName 의 ~42%가 단지명이 아니라 "경상남도 창원시" 같은 주소 조각 (M3).
// 시도명으로 시작하면서 단지 단서 단어가 없으면 단지명으로 안 쓴다(카드 제목 오염 방지).
const SIDO_PREFIX = /^(서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충청|충북|충남|전라|전북|전남|경상|경북|경남|제주)/;
const COMPLEX_HINT = /단지|블록|BL|마을|타운|캐슬|아파트|빌|하임|스테이|팰|푸르지오|자이|힐|LH|행복주택|타워|파크|시티|뜨란|리채|숲|채/;
function cleanComplexName(name: string | null | undefined): string | null {
  const n = (name ?? "").trim();
  if (!n) return null;
  if (SIDO_PREFIX.test(n) && !COMPLEX_HINT.test(n)) return null;
  return n;
}

function noticePdfUrlFor(id: string): string | undefined {
  const m = id.match(/^lh-(rental|sale)-(\d+)/);
  const base = m ? `lh-${m[1]}-${m[2]}` : id;
  const fileid = PDF_META[id]?.pdfFileid ?? PDF_META[base]?.pdfFileid;
  return fileid ? `https://apply.lh.or.kr/lhapply/lhFile.do?fileid=${fileid}` : undefined;
}

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
  winnerAt?: string;
  address: string;
  lat: number | null;
  lng: number | null;
  geocoded: string;
  area: string;
  depositManwon: number;
  monthlyRentManwon: number;
  depositRange?: [number, number] | null;
  rentRange?: [number, number] | null;
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
  youth:  ["청년", "무주택", "소득", "자산"],
};

// 주택 종류 — LH 단지 DB(houseTyNm) 매칭 실패 시 제도 기반 기본값.
// 건설임대 5종은 LH 가 건설·공급하는 아파트 단지라 "아파트"가 제도 사실.
// 매입임대는 다가구·다세대·오피스텔 혼재라 단일 종류 없음. 전세임대·분양은 추정하지 않는다.
const BUILDING_TYPE_FALLBACK: Record<string, string> = {
  nation: "아파트",
  perm: "아파트",
  happy: "아파트",
  integ: "아파트",
  fifty: "아파트",
  buy: "다가구·다세대 등",
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

// 서울 25개 자치구 — 장기전세·청년 등 일부 매물은 districtId 없이 구 이름만 와서
// "seoul" 시도 집계 마커가 0 으로 빠진다(서울이 지도에서 통째로 안 보임). 구 이름으로 보정.
const SEOUL_GU = new Set([
  "종로구", "중구", "용산구", "성동구", "광진구", "동대문구", "중랑구", "성북구",
  "강북구", "도봉구", "노원구", "은평구", "서대문구", "마포구", "양천구", "강서구",
  "구로구", "금천구", "영등포구", "동작구", "관악구", "서초구", "강남구", "송파구", "강동구",
]);
// districtId 가 비었지만 district 가 서울 자치구면 "seoul" 로 채운다 (그 외엔 그대로).
const fillDistrictId = (l: Listing): Listing =>
  l.districtId || !SEOUL_GU.has(l.district) ? l : { ...l, districtId: "seoul" };

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
  // 첨부 주택목록 집계(든든전세·매입임대) — 상세 "공급 주택" 표 + 가격 없을 때 보증금 범위 폴백.
  const hg = (housingGroupsRaw as Record<string, { groups: NonNullable<Listing["housingGroups"]> }>)[
    r.pblancId
  ]?.groups?.filter((g) => g.units > 0);
  const hgDeps = (hg ?? []).flatMap((g) => (g.depMin ? [g.depMin, g.depMax ?? g.depMin] : []));
  const hgRents = (hg ?? []).flatMap((g) => (g.rentMin ? [g.rentMin, g.rentMax ?? g.rentMin] : []));
  const raw = RAW_BY_PANID.get(r.pblancId);
  // 경쟁률: 본인 접수결과(own) 우선, 없으면 같은 단지 과거 회차(previous) 참조
  const ownCompetition = COMPETITION[r.pblancId]?.competition ?? null;
  const prevCompetition = ownCompetition == null ? findPrevCompetition(r.type, r.title, r.complexName) : null;
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
    // 유형별 보증금/월세 범위 — 단일값이 guard 통과(>0)일 때만 노출.
    // 가격이 아예 없으면 주택목록 집계(실보증금) 범위로 폴백.
    depositRange: deposit > 0
      ? (r.depositRange ?? null)
      : hgDeps.length ? [Math.min(...hgDeps), Math.max(...hgDeps)] as [number, number] : null,
    rentRange: rent > 0
      ? (r.rentRange ?? null)
      : hgRents.length ? [Math.min(...hgRents), Math.max(...hgRents)] as [number, number] : null,
    ...(hg?.length ? { housingGroups: hg } : {}),
    area: formatArea(r.area || ""),
    layout: "",
    totalUnits: r.supplyUnits ?? null,
    supplyUnits: r.supplyUnits ?? null,
    heatMethod: safeString(r.heatMethod),
    salePriceManwon: r.salePriceManwon,
    status: r.status as StatusId,
    deadline: r.deadline || "",
    beginDate: r.announceDate || "",
    winnerAt: r.winnerAt || undefined,
    // 매물별 PDF 에서 추출된 자격 키 우선 (정확). 없으면 type 기본값.
    eligible: sortEligibility(
      (Array.isArray(r.eligibilityKeys) && r.eligibilityKeys.length)
        ? r.eligibilityKeys
        : (ELIGIBILITY_BY_TYPE[r.type] || [])
    ),
    features: [],
    transit: "",
    // sync-competition.mjs 가 접수결과 공지 PDF 에서 추출한 경쟁률 (신청자수/모집호수)
    competition: ownCompetition ?? prevCompetition,
    competitionKind: ownCompetition != null ? "own" : prevCompetition != null ? "previous" : undefined,
    thumbSeed: r.thumbSeed,
    suplyTyNm: safeString(r.houseType) || undefined,
    complexName: cleanComplexName(r.complexName),
    buildingType: safeString(r.houseType) || BUILDING_TYPE_FALLBACK[r.type] || null,
    complexes: Array.isArray(r.complexes) ? (r.complexes as Listing["complexes"]) : undefined,
    pblancNm: r.noticeTitle,
    sourceUrl: r.sourceUrl,
    noticePdfUrl: noticePdfUrlFor(r.id),
    coverPhotoUrl: resolveCoverPhoto(r.coverPhotoLocal, r.coverPhotoUrl),
  };
}

// Vercel Blob 미사용 (스토어 폐기). 로컬 정적(/lh-covers/) 우선.
// localPath 없는 매물만 urlFallback 사용. (추후 Supabase Storage 로 이전 예정)
// 커버 이미지 해석 — 로컬(/lh-covers/*)은 591MB 라 .vercelignore 로 배포 제외됨.
// blob-covers.json(파일명→Vercel Blob CDN URL)으로 매핑해 배포·로컬 모두에서 로드.
// Blob 매핑 없으면 외부(LH 공고) URL 폴백.
const BLOB_COVERS = blobCovers as Record<string, string>;
function resolveCoverPhoto(localPath: string | null, urlFallback: string | null): string | undefined {
  if (localPath) {
    const file = localPath.split("/").pop();
    if (file && BLOB_COVERS[file]) return BLOB_COVERS[file];
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

// 표시용 — 머리 라벨([정정공고]/[재공고]/[재게시]/[변경공고] 등) 제거.
// dedup 우선순위 판단(/정정/.test)이 끝난 뒤 선택된 매물 제목에만 적용.
function stripNoticeLabel(title: string): string {
  const out = (title || "").replace(/^\s*(?:\[[^\]]*(?:정정|재공고|재게시|변경)[^\]]*\]\s*)+/, "").trim();
  return out || title;
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
    if (arr.length === 1) { out.push({ ...arr[0], title: stripNoticeLabel(arr[0].title) }); continue; }
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
    // 정정공고 우선 판단(원제목 기준)이 끝났으니, 표시 제목에서 라벨만 제거.
    out.push({ ...arr[0], title: stripNoticeLabel(arr[0].title) });
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
  coverPhotoLocal?: string; // 단지별 조감도 (없으면 모 조감도 안 물려받음)
  districtId?: string; district?: string; // 한 공고가 여러 시/도에 걸칠 때 핀별 소속
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
        districtId: p.districtId ?? cfg.districtId ?? base.districtId,
        district: p.district ?? cfg.district ?? base.district,
        ...(p.address && { address: p.address }),
        ...(p.label && { title: p.label }),
        ...(p.area && { area: p.area }),
        ...(p.depositManwon != null && { deposit: p.depositManwon }),
        ...(p.rentManwon != null && { rent: p.rentManwon }),
        ...(p.units != null && { supplyUnits: p.units }),
        // 단지별 조감도 — point에 있으면 그것, 없으면 모 조감도 안 물려받고 비움.
        coverPhotoUrl: resolveCoverPhoto(p.coverPhotoLocal ?? null, null),
        complexes: undefined,
      });
    });
  }
  return out.map(applyOverride);
}

// 주소가 "강원특별자치도 삼척시", "경상남도 의령군 화정면"처럼 시군구(±읍면) 수준뿐이고
// 도로명·번지가 없으면 좌표는 지오코딩된 지역 중심(시청·도청급) 근사값이다.
function isApproxAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  const s = addr.trim();
  if (/\d/.test(s)) return false; // 번지·건물번호가 있으면 실주소
  return /^[가-힣]+(특별자치도|특별자치시|광역시|특별시|도)(\s+[가-힣]+(시|군|구))?(\s+[가-힣]+(시|군|구|읍|면))?$/.test(s);
}

// LH 전용 공개 매물(SH 제외) — 어드민/공개 양쪽의 공통 베이스.
const LH_LISTINGS_BASE: Listing[] = [
  // 지오코딩으로 분리한 매물의 원본(단일 핀)은 제외 — 분리 핀과 중복 방지.
  ...dedupeListings(ALL.filter((l) => !MAPPED_REGIONAL_PIDS.has(l.pblancId ?? ""))),
  ...buildDundeonSeoulListings(),
  ...buildMappedRegionalListings(),
]
  .map(fillDistrictId)
  // dedup 을 안 거치는 경로(지오코딩 분리 매물 등)에도 표시 라벨 제거 — 멱등.
  .map((l) => ({ ...l, title: stripNoticeLabel(l.title) }))
  // 주소가 시군구(±읍면) 수준뿐이면 좌표는 지역 중심 근사값 — "대표 위치" 표시 대상.
  .map((l) => (isApproxAddress(l.address) ? { ...l, coordApprox: true } : l));

export const LH_LISTINGS: Listing[] = [
  ...LH_LISTINGS_BASE,
  // SH 중 좌표 확보 + 모집중인 건만 공개 지도에. (대부분 SH 는 산재형이라 어드민 전용)
  ...SH_PUBLIC_LISTINGS.map(applyOverride),
  // 청년안심(민간임대) 중 모집중 + 단지 디렉토리 매칭(좌표·가격 공식 출처)된 건.
  ...YOUTH_PUBLIC_LISTINGS.map(applyOverride),
].map(fillDistrictId);

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

// 어드민 검수용 — 지도 노출 매물 + 광역 매물 + SH 전체 + 청년안심(민간임대). 검수 큐는 지도와 무관하므로 다 포함.
// SH·청년안심은 어드민에만(공개 LH_LISTINGS 엔 미포함) — 검수 후 공개 승격 예정.
// 어드민은 LH 베이스(SH 제외) + 광역 + SH 전체(77). 공개 SH 가 LH_LISTINGS 에 섞여도 중복 안 되게 베이스 사용.
export const LH_ADMIN_LISTINGS: Listing[] = [
  ...LH_LISTINGS_BASE,
  ...LH_REGIONAL_LISTINGS,
  ...SH_ADMIN_LISTINGS.map(applyOverride),
  ...YOUTH_ADMIN_LISTINGS.map(applyOverride),
];

// 검수 필요 여부 — 공급세대수가 의심값(없음/1)인 매물. 단, 이미 마감(closed)된 매물은
// 정정해도 사용자 노출이 끝나 검수 의미가 없으므로 제외. (active 만 큐에 노출)
export function needsSupplyReview(l: Listing): boolean {
  if (effectiveStatus(l.status, l.deadline ?? "", l.beginDate) === "closed") return false;
  return l.supplyUnits == null || l.supplyUnits === 1;
}

// 검수 품질 이슈 — 세대수 단일 신호(needsSupplyReview)의 다중화 (어드민 P2).
// LH 단일 소스 시절엔 세대수가 대표 신호였지만, SH(가격/일정 결손)·청년안심(좌표·PDF)
// 3소스 체제에선 이슈 종류별로 보여야 어떤 검수부터 할지 정할 수 있다. closed 제외.
export type ReviewIssue = "가격" | "좌표" | "PDF" | "마감일" | "자격" | "세대수";

export function listingIssues(l: Listing): ReviewIssue[] {
  if (effectiveStatus(l.status, l.deadline ?? "", l.beginDate) === "closed") return [];
  const issues: ReviewIssue[] = [];
  if (!l.deposit && !l.salePriceManwon) issues.push("가격");
  if (!l.lat || !l.lng) issues.push("좌표");
  // LH 는 상세 페이지에서 PDF 를 찾으므로 noticePdfUrl 없음이 정상 — SH/서울시만 결손 신호.
  if (!l.noticePdfUrl && l.agency !== "LH") issues.push("PDF");
  if (!l.deadline) issues.push("마감일");
  if (!l.eligible?.length) issues.push("자격");
  if (l.supplyUnits == null || l.supplyUnits === 1) issues.push("세대수");
  return issues;
}

export function buildDistricts(listings: Listing[]): District[] {
  const counts = new Map<string, number>();
  for (const l of listings) {
    counts.set(l.districtId, (counts.get(l.districtId) ?? 0) + 1);
  }
  // 시도 마커는 고정 지리중심에 배치. listing centroid 를 쓰면 경기 중심이 매물 분포상
  // 서울에 붙어, 큰 서울 마커에 경기 마커가 가려지는 문제가 있어 고정 좌표 사용.
  return SIDOS.filter((s) => counts.has(s.id)).map((s, idx) => ({
    id: s.id,
    name: s.name,
    x: idx,
    y: idx,
    lat: s.lat,
    lng: s.lng,
    count: counts.get(s.id) ?? 0,
  }));
}

export const LH_DISTRICTS: District[] = buildDistricts(LH_LISTINGS);
