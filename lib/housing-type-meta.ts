import type { HousingTypeId } from "./types";

// 타입별 "맞춤 데이터 에셋" — 상세 패널의 제도 인트로 카드에 쓰는 정적 메타.
// 규칙: 핵심 지표의 수치는 이 레포가 이미 단언한 값만 재사용한다
// (eligibility.ts 의 rentRatio/stayYears, mock-data 의 자격 요약,
//  eligibility-detail 의 TYPE_DESCRIPTIONS). 새 규제 수치는 추측하지 않는다.
// 미확정 항목은 "공고문 확인" 같은 빈칸 위장 대신, 항상 참인 정성 사실
// ("시세 이하", "시세 대비 최저" 등)이나 제도 구조 사실(공급방식·대상)로 채운다.

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
    metrics: [
      { label: "임대료", value: "시세 60~80%" },
      { label: "거주기간", value: "최대 6~10년" },
      { label: "자격", value: "무주택 · 6대 계층" },
    ],
  },
  nation: {
    variant: "rental",
    accent: "blue",
    tagline: "무주택 저소득층을 위한 장기 임대주택",
    metrics: [
      { label: "임대료", value: "시세 60~80%" },
      { label: "거주기간", value: "최대 30년" },
      { label: "자격", value: "소득 70% 이하" },
    ],
  },
  integ: {
    variant: "rental",
    accent: "green",
    tagline: "소득 구간별로 통합한 공공임대",
    metrics: [
      { label: "임대료", value: "시세 35~80%" },
      { label: "거주기간", value: "최대 30년" },
      { label: "자격", value: "소득 100~150%" },
    ],
  },
  perm: {
    variant: "rental",
    accent: "purple",
    tagline: "수급·차상위 등 사회취약계층 임대주택",
    metrics: [
      { label: "임대료", value: "시세 대비 최저" },
      { label: "거주기간", value: "장기 거주" },
      { label: "자격", value: "수급·차상위·장애 등" },
    ],
  },
  fifty: {
    variant: "rental",
    accent: "yellow",
    tagline: "최대 50년 거주하는 공공임대",
    metrics: [
      { label: "임대료", value: "시세 이하" },
      { label: "거주기간", value: "최대 50년" },
      { label: "자격", value: "소득 70% 이하" },
    ],
  },
  buy: {
    variant: "rental",
    accent: "pink",
    tagline: "LH가 매입한 기존 주택을 빌려주는 임대",
    metrics: [
      { label: "공급방식", value: "기존 주택 매입" },
      { label: "임대료", value: "시세 이하" },
      { label: "자격", value: "청년·신혼·자녀" },
    ],
  },
  jeonse: {
    variant: "jeonse",
    accent: "red",
    tagline: "내가 고른 집을 LH가 전세계약하는 지원",
    metrics: [
      { label: "지원방식", value: "LH 전세 계약" },
      { label: "본인부담", value: "보증금 일부" },
      { label: "자격", value: "청년·신혼 등" },
    ],
  },
  sale: {
    variant: "sale",
    accent: "gray",
    tagline: "무주택자를 위한 합리적 분양 (소유)",
    metrics: [
      { label: "공급방식", value: "분양 (소유)" },
      { label: "분양가", value: "단지별 상이" },
      { label: "자격", value: "무주택 · 청약저축" },
    ],
  },
};

export function housingTypeMeta(type: HousingTypeId): HousingTypeMeta {
  return HOUSING_TYPE_META[type] ?? HOUSING_TYPE_META.nation;
}
