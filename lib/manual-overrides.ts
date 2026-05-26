// 사람이 검수해서 자동 추출값을 정정한 값. daily sync 가 listings-api.json 을 매일 덮어써도
// 이 파일은 손대지 않으므로, lh-adapter 에서 머지 시점에 자동값을 override 한다.
//
// 키 = Listing.id (splitByComplex 후 최종 id, 예: lh-rental-2015...19890-c0).
// 값 = 정정할 필드만 부분적으로. 빠진 필드는 자동값 유지.
import type { Listing, StatusId } from "./types";
import overridesRaw from "./manual-overrides.json";

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

export interface ManualOverride {
  // ── 단일 값 (단일 평형 매물) ──
  supplyUnits?: number | null;
  deposit?: number | null;        // 만원
  rent?: number | null;           // 만원
  salePriceManwon?: number | null;
  area?: string;
  // ── 다중 평형 (688세대 = 59㎡ 390 + 74㎡ 102 + 84㎡ 194 같은 케이스) ──
  rows?: OverrideRow[];
  // ── 상태 ──
  status?: StatusId;              // "open" | "upcoming" | "closing" | "closed"
  noticeStatus?: string;          // "일반공고" / "정정공고" / "취소공고"
  progressStatus?: string;        // "모집중" / "모집완료" / "모집예정"
  deadline?: string;
  _reviewedAt: string;            // ISO date
  _note?: string;
}

export type OverridesMap = Record<string, ManualOverride>;

export const OVERRIDES: OverridesMap = overridesRaw as OverridesMap;

export function applyOverride(listing: Listing): Listing {
  const o = OVERRIDES[listing.id];
  if (!o) return listing;

  // rows 가 있으면 평형별 데이터로 listing.complexes 갱신.
  // 메인 앱이 complexes 를 표시하니 자동 반영. 합계는 supplyUnits 로 노출.
  let complexesPatched = listing.complexes;
  let derivedSupply: number | null | undefined = undefined;
  if (Array.isArray(o.rows) && o.rows.length > 0) {
    const rows = o.rows.map((r) => ({
      houseType: r.houseType,
      area: Number(String(r.area ?? "").replace(/[^0-9.]/g, "")) || 0,
      supplyTotal: r.supplyUnits ?? null,
      supplyThisRound: r.supplyUnits ?? null,
      deposit: r.deposit != null ? r.deposit * 10000 : null, // 만원 → 원
      rent: r.rent != null ? r.rent * 10000 : null,
    }));
    complexesPatched = [{ name: listing.complexes?.[0]?.name ?? null, rows }];
    derivedSupply = o.rows.reduce((sum, r) => sum + (r.supplyUnits ?? 0), 0);
  }

  return {
    ...listing,
    ...(o.supplyUnits !== undefined && { supplyUnits: o.supplyUnits, totalUnits: o.supplyUnits }),
    ...(derivedSupply !== undefined && { supplyUnits: derivedSupply, totalUnits: derivedSupply }),
    ...(o.deposit !== undefined && o.deposit !== null && { deposit: o.deposit }),
    ...(o.rent !== undefined && o.rent !== null && { rent: o.rent }),
    ...(o.salePriceManwon !== undefined && { salePriceManwon: o.salePriceManwon }),
    ...(o.area !== undefined && { area: o.area }),
    ...(o.status !== undefined && { status: o.status }),
    ...(o.noticeStatus !== undefined && { noticeStatus: o.noticeStatus }),
    ...(o.progressStatus !== undefined && { progressStatus: o.progressStatus }),
    ...(o.deadline !== undefined && { deadline: o.deadline }),
    ...(complexesPatched !== listing.complexes && { complexes: complexesPatched }),
  };
}

export function isReviewed(id: string): boolean {
  return Boolean(OVERRIDES[id]);
}
