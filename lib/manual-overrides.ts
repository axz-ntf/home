// 사람이 검수해서 자동 추출값을 정정한 값. daily sync 가 listings-api.json 을 매일 덮어써도
// 이 파일은 손대지 않으므로, lh-adapter 에서 머지 시점에 자동값을 override 한다.
//
// 키 = Listing.id (splitByComplex 후 최종 id, 예: lh-rental-2015...19890-c0).
// 값 = 정정할 필드만 부분적으로. 빠진 필드는 자동값 유지.
import type { HousingTypeId, Listing, StatusId } from "./types";
import overridesRaw from "./manual-overrides.json";

// ── 가격 모델 (유형별 어드민 구조, 설계: docs/type-aware-admin-design.md) ──
// 유형마다 가격 구조가 달라 단일 rows 로 표현 불가 → 6개 모델로 수렴.
export type PriceModel =
  | "rows-by-area"      // 평형별 보증금/월세 (현 기본)
  | "tiered-by-income"  // 평형 × 소득계층(가/나군) — 영구·통합공공
  | "by-household-size" // 가구원수 유형(1/2/3형) + 범위 — 매입
  | "support-limit"     // 지원한도액 (평형 없음) — 전세임대
  | "deposit-only"      // 보증금만 (월세 없음) — SH 장기전세
  | "per-unit-sale";    // 동·호별 분양가 — 분양·매각

const PRICE_MODEL_BY_TYPE: Record<HousingTypeId, PriceModel> = {
  nation: "rows-by-area",
  fifty: "rows-by-area",
  happy: "rows-by-area",
  integ: "tiered-by-income",
  perm: "tiered-by-income",
  buy: "by-household-size",
  jeonse: "support-limit",
  sale: "per-unit-sale",
  youth: "rows-by-area",
};

export function priceModelFor(type: HousingTypeId): PriceModel {
  return PRICE_MODEL_BY_TYPE[type] ?? "rows-by-area";
}

// 한 매물의 평형별 행 — 분양 공공처럼 59㎡/74㎡/84㎡ 가 한 공고에 묶이는 경우.
// 일반 임대 매물은 보통 단일 평형이라 rows.length === 1.
export interface OverrideRow {
  houseType: string;              // "59A" / "84" / "전용 84㎡" 등 자유 표기
  area?: string;                  // "59.96㎡" 또는 "59~84㎡"
  supplyUnits?: number | null;
  deposit?: number | null;        // 만원 — 임대 매물용
  rent?: number | null;           // 만원 — 임대 매물용
  salePriceManwon?: number | null; // 만원 — 분양 매물용
}

// 소득계층별 임대조건 (가군/나군 또는 1~N구간) — tiered-by-income.
export interface IncomeTier {
  houseType: string;
  area?: string;
  supplyUnits?: number | null;    // 평형당 세대수 (계층 무관, 1회만)
  incomes: { label: string; deposit: number | null; rent: number | null }[];
}

// 가구원수 유형(1/2/3형) — by-household-size. 가격은 단일 또는 [min,max] 범위.
export interface HouseholdType {
  label: string;                  // "2인 가구(1형)"
  areaRange?: string;             // "전용 50㎡ 이하"
  supplyUnits?: number | null;
  deposit?: number | [number, number] | null;
  rent?: number | [number, number] | null;
}

export interface ManualOverride {
  // ── 단일 값 (단일 평형 매물) ──
  supplyUnits?: number | null;
  deposit?: number | null;        // 만원
  rent?: number | null;           // 만원
  salePriceManwon?: number | null;
  area?: string;
  address?: string;               // 위치 정정 — LH 원본이 시군 근사일 때 실제 단지 주소
  // ── 다중 평형 (688세대 = 59㎡ 390 + 74㎡ 102 + 84㎡ 194 같은 케이스) ──
  rows?: OverrideRow[];
  // ── 유형별 가격 모델 (옵셔널 — 없으면 위 레거시 필드로 동작) ──
  priceModel?: PriceModel;
  tiers?: IncomeTier[];                                   // tiered-by-income
  householdTypes?: HouseholdType[];                       // by-household-size
  supportLimit?: { byHousehold: { label: string; limitManwon: number }[] }; // support-limit
  conversion?: {                                          // 전환보증금 (공통 옵션)
    perHouseType?: { houseType: string; limitManwon: number; maxDeposit: number; minRent: number }[];
    rateUp?: number;
    rateDown?: number;
  };
  schedule?: { applyStart?: string; applyEnd?: string; docResultAt?: string; winnerAt?: string };
  complexMeta?: { addressJibun?: string; firstMoveIn?: string; structure?: string; contact?: string };
  // ── 상태 ──
  status?: StatusId;              // "open" | "upcoming" | "closing" | "closed"
  noticeStatus?: string;          // "일반공고" / "정정공고" / "취소공고"
  progressStatus?: string;        // "모집중" / "모집완료" / "모집예정"
  deadline?: string;
  _reviewedAt: string;            // ISO date
  _note?: string;
}

// 새 가격 모델(tiers/householdTypes/supportLimit) → 레거시 rows/headline 으로 정규화.
// 카드·리스트·지도는 대표가만 쓰므로 "가장 싼 옵션"(저가 컨셉)을 대표로. 구조화 데이터는
// OVERRIDES[id] 로 디테일 페이지가 직접 읽는다(3-4). priceModel 없으면 {} → 레거시 무손상.
function deriveFromModel(o: ManualOverride): { rows?: OverrideRow[]; deposit?: number; rent?: number } {
  const lo = (v: number | [number, number] | null | undefined): number | null =>
    Array.isArray(v) ? v[0] : v ?? null;
  // 대표 행 = 보증금 최소(가장 싼 옵션). 그 행의 deposit·rent 를 headline 으로.
  const cheapest = (rows: OverrideRow[]): { deposit?: number; rent?: number } => {
    const priced = rows.filter((r) => r.deposit != null);
    if (!priced.length) return {};
    const rep = priced.sort((a, b) => (a.deposit! - b.deposit!))[0];
    return { deposit: rep.deposit ?? undefined, rent: rep.rent ?? undefined };
  };

  if (o.priceModel === "tiered-by-income" && o.tiers?.length) {
    const rows: OverrideRow[] = o.tiers.map((t) => {
      // 평형별 대표 = 가장 싼 계층(보증금 최소)
      const priced = t.incomes.filter((i) => i.deposit != null);
      const rep = priced.sort((a, b) => (a.deposit! - b.deposit!))[0] ?? t.incomes[0];
      return { houseType: t.houseType, area: t.area, supplyUnits: t.supplyUnits ?? null, deposit: rep?.deposit ?? null, rent: rep?.rent ?? null };
    });
    return { rows, ...cheapest(rows) };
  }
  if (o.priceModel === "by-household-size" && o.householdTypes?.length) {
    const rows: OverrideRow[] = o.householdTypes.map((h) => ({
      houseType: h.label, area: h.areaRange, supplyUnits: h.supplyUnits ?? null, deposit: lo(h.deposit), rent: lo(h.rent),
    }));
    return { rows, ...cheapest(rows) };
  }
  if (o.priceModel === "support-limit" && o.supportLimit?.byHousehold?.length) {
    const limits = o.supportLimit.byHousehold.map((b) => b.limitManwon).filter((n) => Number.isFinite(n));
    return { deposit: limits.length ? Math.min(...limits) : undefined };
  }
  return {};
}

export type OverridesMap = Record<string, ManualOverride>;

export const OVERRIDES: OverridesMap = overridesRaw as OverridesMap;

export function applyOverride(listing: Listing): Listing {
  const o = OVERRIDES[listing.id];
  if (!o) return listing;

  // 새 가격 모델이면 레거시 rows/headline 으로 정규화 (없으면 derived={} → 기존 경로 무손상).
  const derived = deriveFromModel(o);
  const effectiveRows = derived.rows ?? o.rows;

  // rows 가 있으면 평형별 데이터로 listing.complexes 갱신.
  // 메인 앱이 complexes 를 표시하니 자동 반영. 합계는 supplyUnits 로 노출.
  let complexesPatched = listing.complexes;
  let derivedSupply: number | null | undefined = undefined;
  if (Array.isArray(effectiveRows) && effectiveRows.length > 0) {
    const rows = effectiveRows.map((r) => ({
      houseType: r.houseType,
      area: Number(String(r.area ?? "").replace(/[^0-9.]/g, "")) || 0,
      supplyTotal: r.supplyUnits ?? null,
      supplyThisRound: r.supplyUnits ?? null,
      deposit: r.deposit != null ? r.deposit * 10000 : null, // 만원 → 원
      rent: r.rent != null ? r.rent * 10000 : null,
    }));
    complexesPatched = [{ name: listing.complexes?.[0]?.name ?? null, rows }];
    // 세대수 합계 — 행에 세대수가 하나도 없으면 0 으로 박제하지 않고 미정으로 둔다 (감사 H2).
    if (effectiveRows.some((r) => r.supplyUnits != null)) {
      derivedSupply = effectiveRows.reduce((sum, r) => sum + (r.supplyUnits ?? 0), 0);
    }
  }

  // headline 가격 — 새 모델이면 derived 대표가, 아니면 레거시 o.deposit/o.rent.
  const headlineDeposit = derived.deposit !== undefined ? derived.deposit : (o.deposit ?? undefined);
  const headlineRent = derived.rent !== undefined ? derived.rent : (o.rent ?? undefined);

  return {
    ...listing,
    // derived(평형 합계) 먼저, 명시적 검수값(o.supplyUnits)이 있으면 그것이 우선 (감사 H2).
    ...(derivedSupply !== undefined && { supplyUnits: derivedSupply, totalUnits: derivedSupply }),
    ...(o.supplyUnits !== undefined && o.supplyUnits !== null && { supplyUnits: o.supplyUnits, totalUnits: o.supplyUnits }),
    ...(headlineDeposit !== undefined && headlineDeposit !== null && { deposit: headlineDeposit }),
    ...(headlineRent !== undefined && headlineRent !== null && { rent: headlineRent }),
    ...(o.salePriceManwon !== undefined && { salePriceManwon: o.salePriceManwon }),
    ...(o.area !== undefined && { area: o.area }),
    ...(o.address !== undefined && { address: o.address }),
    ...(o.status !== undefined && { status: o.status }),
    ...(o.noticeStatus !== undefined && { noticeStatus: o.noticeStatus }),
    ...(o.progressStatus !== undefined && { progressStatus: o.progressStatus }),
    ...(o.deadline !== undefined && { deadline: o.deadline }),
    ...(o.schedule?.winnerAt && { winnerAt: o.schedule.winnerAt }),
    ...(complexesPatched !== listing.complexes && { complexes: complexesPatched }),
    // 구조화 가격 모델 → 디테일 렌더용 priceDetail (priceModel 있을 때만).
    ...(o.priceModel && (o.tiers || o.householdTypes || o.supportLimit || o.conversion) && {
      priceDetail: {
        model: o.priceModel,
        ...(o.tiers && { tiers: o.tiers }),
        ...(o.householdTypes && { householdTypes: o.householdTypes }),
        ...(o.supportLimit && { supportLimit: o.supportLimit }),
        ...(o.conversion && { conversion: { rateUp: o.conversion.rateUp ?? null, rateDown: o.conversion.rateDown ?? null } }),
      },
    }),
  };
}

export function isReviewed(id: string): boolean {
  return Boolean(OVERRIDES[id]);
}
