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
export type Agency = "LH" | "SH" | "GH";

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

export type FilterKey = "type" | "status";
export type Filters = Record<FilterKey, string[]>;
export type SortKey = "recent" | "deadline" | "low-rent" | "low-depo";
export type ViewMode = "split" | "list";
export type Density = "compact" | "comfort";
