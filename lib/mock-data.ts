import type { HousingType, StatusId, StatusLabel } from "./types";

export const HOUSING_TYPES: HousingType[] = [
  { id: "happy", name: "행복주택", badge: "happy" },
  { id: "nation", name: "국민임대", badge: "nation" },
  { id: "perm", name: "영구임대", badge: "perm" },
  { id: "buy", name: "매입임대", badge: "buy" },
  { id: "jeonse", name: "전세임대", badge: "jeonse" },
  { id: "fifty", name: "50년임대", badge: "fifty" },
  { id: "integ", name: "통합공공임대", badge: "integ" },
  { id: "youth", name: "청년주택", badge: "youth" },
  { id: "sale", name: "공공분양", badge: "sale" },
];

export const STATUS_LABELS: Record<StatusId, StatusLabel> = {
  open: { text: "접수중", color: "#1aa174" },
  upcoming: { text: "예정", color: "#c27f29" },
  closing: { text: "마감임박", color: "#ff4133" },
  closed: { text: "마감", color: "#868b94" },
};

// 입주자격 키 그룹 — PDF 에서 추출되는 키들은 "기본 자격(모두 충족)" 과
// "우선공급 대상(해당 시 가산)" 이 섞여 있어서 사용자에게 오해를 줌. 분류해서 별도 표시.
export type EligibilityGroup = "base" | "tier" | "special";
export const ELIGIBILITY_GROUP: Record<string, EligibilityGroup> = {
  // 기본 자격 — 신청하려면 모두 충족 필요
  무주택: "base",
  청약저축: "base",
  소득70: "base",
  소득100: "base",
  소득150: "base",
  자산: "base",
  자동차: "base",
  거주10: "base",
  거주30: "base",
  거주50: "base",
  // 계층 우선공급 — 해당하면 가산점
  청년: "tier",
  신혼: "tier",
  자녀: "tier",
  다자녀: "tier",
  "1인": "tier",
  가구: "tier",
  고령: "tier",
  대학생: "tier",
  한부모: "tier",
  // 특별 자격 — 영구임대 등에 우선공급
  수급: "special",
  차상위: "special",
  장애: "special",
  국가유공: "special",
  북한이탈: "special",
};

export function groupEligibilityKeys(keys: string[]): Record<EligibilityGroup, string[]> {
  const out: Record<EligibilityGroup, string[]> = { base: [], tier: [], special: [] };
  for (const k of keys) {
    const g = ELIGIBILITY_GROUP[k];
    if (g) out[g].push(k);
  }
  return out;
}

// 카드 요약 — 슬라이스 대신 housing type 의 자격 narrative 를 한 줄로.
// 너무 디테일한 키 나열보다 "이 매물은 누구를 위한 것인지" 전달이 목적.
const ELIGIBILITY_SUMMARY_BY_TYPE: Record<string, string> = {
  happy: "청년·신혼·고령 등 6대 계층",
  nation: "무주택 · 소득 70% 이하",
  perm: "수급·차상위·장애 등 특별 자격",
  youth: "만 19~39세 청년 · 무주택",
  integ: "무주택 · 소득 기준 차등 (100~150%)",
  fifty: "무주택 · 소득 70% 이하",
  buy: "청년·신혼·자녀 (매입임대)",
  jeonse: "청년·신혼 (전세임대)",
  sale: "무주택 · 청약저축 가입자",
};
export function eligibilitySummaryByType(type: string): string {
  return ELIGIBILITY_SUMMARY_BY_TYPE[type] ?? "공고문 확인";
}

export const ELIGIBILITY_LABELS: Record<string, string> = {
  // 계층
  청년: "만 19-39세 청년",
  신혼: "신혼부부 (혼인 7년 이내)",
  자녀: "자녀 있는 세대",
  다자녀: "다자녀 세대",
  "1인": "1인 가구",
  가구: "일반 세대",
  고령: "만 65세 이상 고령자",
  대학생: "대학생",
  한부모: "한부모 가족",
  // 기본 조건
  무주택: "무주택 세대구성원",
  // 특별 자격 (영구임대 등)
  수급: "기초생활수급자",
  차상위: "차상위 계층",
  장애: "장애인",
  국가유공: "국가유공자",
  북한이탈: "북한이탈주민",
  // 소득 / 자산
  소득70: "소득 도시근로자 70% 이하",
  소득100: "소득 100% 이하",
  소득150: "소득 150% 이하",
  자산: "총자산 3.61억 이하",
  자동차: "자동차 3,803만원 이하",
  청약저축: "주택청약저축 가입자",
  // 거주
  거주30: "최대 30년 거주",
  거주50: "최대 50년 거주",
  거주10: "최대 10년 (자녀 시)",
};
