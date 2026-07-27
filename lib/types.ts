export type HousingTypeId =
  | "happy"
  | "nation"
  | "integ"
  | "perm"
  | "buy"
  | "jeonse"
  | "fifty"
  | "sale"
  | "youth";
export type StatusId = "open" | "upcoming" | "closing" | "closed";
export type Agency = "LH" | "SH" | "GH" | "서울시"; // 서울시 = 청년안심주택(민간임대, soco)

export interface District {
  id: string;
  name: string;
  x: number;
  y: number;
  lat: number;
  lng: number;
  count: number;
}

export interface HousingType {
  id: HousingTypeId;
  name: string;
  badge: HousingTypeId;
}

export interface StatusLabel {
  text: string;
  color: string;
}

export interface Listing {
  id: string;
  pblancId?: string;
  houseSn?: number | null;
  title: string;
  type: HousingTypeId;
  agency: Agency;
  districtId: string;
  district: string;
  lat: number;
  lng: number;
  address: string;
  pnu?: string;
  deposit: number;
  rent: number;
  // 유형별 보증금/월세 min~max (만원). 단일이면 없음 — 카드·상세에서 범위 표시용.
  depositRange?: [number, number] | null;
  rentRange?: [number, number] | null;
  // 가격이 검수 전 AI 추출값(extract-drafts)일 때 true — UI 에서 "미검수" 배지 표시.
  priceUnverified?: boolean;
  // 좌표가 시군구 중심(시청·도청급) 근사값일 때 true — 예비입주자류 광역 공고 등
  // 실주택 위치가 공고에 없는 경우. UI 에서 "대표 위치" 표시 + 핀 스타일 구분.
  coordApprox?: boolean;
  // 광역 공고(든든전세·매입임대)의 첨부 주택목록 집계 — 상세 "공급 주택" 표.
  housingGroups?: {
    label: string;
    units: number;
    depMin: number | null;
    depMax: number | null;
    rentMin: number | null;
    rentMax: number | null;
  }[];
  area: string;
  layout: string;
  totalUnits?: number | string | null;
  supplyUnits?: number | string | null;
  heatMethod?: string;
  salePriceManwon?: number | null;
  status: StatusId;
  deadline: string;
  beginDate?: string;
  eligible: string[];
  features: string[];
  transit: string;
  competition: number | null;
  // 경쟁률 출처 구분 — "own": 이 공고 자체의 접수결과, "previous": 같은 단지 과거 회차 (참고용)
  competitionKind?: "own" | "previous";
  thumbSeed: number;
  suplyTyNm?: string;
  pblancNm?: string;
  sourceUrl?: string;
  noticePdfUrl?: string; // 공고문 PDF 직접 열기 (개선안1차 M2) — LH는 _meta fileid, SH는 innoFD
  complexName?: string | null; // 단지명 (M3 — 카드 제목 우선 표시, 공고명 전체는 상세에)
  buildingType?: string | null; // 주택 종류: 아파트/오피스텔/다가구 등 (M3)
  winnerAt?: string; // 당첨자 발표일 (검수 schedule.winnerAt — 모집일정 타임라인용)
  pcUrl?: string;
  mobileUrl?: string;
  photos?: ListingPhoto[];
  coverPhotoUrl?: string;
  attachments?: ListingPhoto[];
  complexes?: ComplexInfo[]; // 한 공고에 여러 단지가 묶인 경우 단지별 표
  // LH raw 상태 필드 — lh-notices-all 에서 pblancId 로 매칭. 어드민/필터/표시에 활용.
  noticeStatus?: string;     // "일반공고" / "정정공고" / "취소공고" 등
  progressStatus?: string;   // "모집중" / "모집완료" / "모집예정"
  announceDate?: string;     // raw 공고일 (YYYY.MM.DD)
  // 유형별 가격 모델 구조화 데이터 — applyOverride 가 priceModel 검수값에서 채움(3-4 디테일 렌더용).
  priceDetail?: PriceDetail;
  // 공고 공통 임대 조건(핵심만) — SH 공고문 PDF 에서 추출(extract-sh-mapped → sh-mapped.json).
  // 보일러플레이트(전환율·재계약 할증 등)는 제외하고, 매물마다 다르고 유용한 것만 정제.
  rentTerms?: {
    residence?: string;    // 거주기간 (예: "최대 10년", "만 39세까지")
    depositBasis?: string; // 보증금이 고정값이 아닐 때 산정 방식 (예: "호실별 감정평가액의 30~50%")
    convertible?: boolean; // 보증금↔월세 상호전환 가능 여부
  };
  // 주택형 단위 옵션 — SH 매입임대는 주택형(32A/36A…)으로 신청(호실은 무작위 배정)이라
  // 상세 패널에서 주택형 드롭다운으로 보여준다. extract-sh-mapped → sh-mapped.json 의 단지별 types.
  unitTypes?: {
    name: string;           // 주택형 (예: "32A")
    areaM2?: number;        // 전용면적 (㎡)
    units?: number;         // 공급 호수
    depositManwon?: number; // 보증금 (만원) — 없으면 단지 공통값
    rentManwon?: number;    // 월세 (만원)
  }[];
}

export interface PriceDetail {
  model: "tiered-by-income" | "by-household-size" | "support-limit" | "deposit-only" | "per-unit-sale" | "rows-by-area";
  tiers?: { houseType: string; area?: string; supplyUnits?: number | null; incomes: { label: string; deposit: number | null; rent: number | null }[] }[];
  householdTypes?: { label: string; areaRange?: string; supplyUnits?: number | null; deposit?: number | [number, number] | null; rent?: number | [number, number] | null }[];
  supportLimit?: { byHousehold: { label: string; limitManwon: number }[] };
  conversion?: { rateUp?: number | null; rateDown?: number | null };
}

export interface ComplexRow {
  houseType: string;
  area: number;
  supplyTotal: number | null;
  supplyThisRound: number | null;
  deposit: number | null;     // 원, null=공고문 확인
  rent: number | null;        // 원
}

export interface ComplexInfo {
  name: string | null;
  rows: ComplexRow[];
}

export interface ListingPhoto {
  kind: string | null;
  name: string | null;
  url: string;
  source?: string;
}

export type FilterKey = "type" | "status" | "agency";
export type Filters = Record<FilterKey, string[]>;
export type SortKey = "recent" | "deadline" | "low-rent" | "low-depo";
export type ViewMode = "split" | "list";
export type Density = "compact" | "comfort";
