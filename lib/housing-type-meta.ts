import type { HousingTypeId } from "./types";

// 타입별 "맞춤 데이터 에셋" — 상세 패널의 제도 인트로 카드에 쓰는 정적 메타.
// 규칙: 핵심 지표의 수치는 이 레포가 이미 단언한 값만 재사용한다
// (eligibility.ts 의 stayYears 등). 새 규제 수치는 추측하지 않는다.
// 인트로 카드 지표는 "아래 섹션에 없는 정보"만 싣는다 — 임대료·자격은
// 디테일의 임대 조건(실제 범위)·입주 자격(칩) 섹션이 실데이터로 대체하므로
// 싣지 않는다. 거주기간처럼 디테일 어디에도 없는 제도 사실만 metrics 로.
// 확정 수치가 없는 유형은 metrics 를 비워 tagline 만 노출한다.

export type DetailVariant = "rental" | "jeonse" | "happy" | "sale";

// seed-design scale color family — accent 로 var(--seed-scale-color-<accent>-{50,700}) 사용.
export type AccentColor = "carrot" | "blue" | "green" | "purple" | "yellow" | "pink" | "red" | "gray";

export interface HousingTypeMeta {
  variant: DetailVariant;
  accent: AccentColor;
  tagline: string; // 한 줄 — 누구를 위한 제도인가
  metrics: { label: string; value: string }[]; // 인트로 카드 핵심 지표 (3개 권장)
}

export const HOUSING_TYPE_META: Record<HousingTypeId, HousingTypeMeta> = {
  happy: {
    variant: "happy",
    accent: "carrot",
    tagline: "청년·신혼·고령 등 6대 계층을 위한 임대주택",
    metrics: [{ label: "거주기간", value: "최대 6~10년 (계층별)" }],
  },
  nation: {
    variant: "rental",
    accent: "blue",
    tagline: "무주택 저소득층을 위한 장기 임대주택",
    metrics: [{ label: "거주기간", value: "최대 30년" }],
  },
  integ: {
    variant: "rental",
    accent: "green",
    tagline: "소득 구간별로 통합한 공공임대",
    metrics: [{ label: "거주기간", value: "최대 30년" }],
  },
  perm: {
    variant: "rental",
    accent: "purple",
    tagline: "수급·차상위 등 사회취약계층을 위한 장기 임대주택",
    metrics: [],
  },
  fifty: {
    variant: "rental",
    accent: "yellow",
    tagline: "최대 50년 거주하는 공공임대",
    metrics: [],
  },
  buy: {
    variant: "rental",
    accent: "pink",
    tagline: "LH가 매입한 기존 주택을 빌려주는 임대",
    metrics: [],
  },
  jeonse: {
    variant: "jeonse",
    accent: "red",
    tagline: "내가 고른 집을 LH가 전세계약하는 지원",
    metrics: [],
  },
  sale: {
    variant: "sale",
    accent: "gray",
    tagline: "무주택자를 위한 합리적 분양 (소유)",
    metrics: [],
  },
  youth: {
    variant: "happy",
    accent: "green",
    tagline: "만 19~39세 청년을 위한 임대주택",
    metrics: [],
  },
};

export function housingTypeMeta(type: HousingTypeId): HousingTypeMeta {
  return HOUSING_TYPE_META[type] ?? HOUSING_TYPE_META.nation;
}
