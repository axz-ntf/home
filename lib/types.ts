export type HousingTypeId =
  | "happy"
  | "nation"
  | "integ"
  | "perm"
  | "buy"
  | "jeonse"
  | "fifty"
  | "sale";
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
