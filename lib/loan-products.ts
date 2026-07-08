// 주택도시기금 전월세 대출 상품 모델 — 2026.1.1 기준금리 (KB·마이홈포털 대조).
// brackets: [연소득 상한(만원), 보증금 구간별 금리(%)] — depositTiers 없으면 단일 금리.
// 실제 실행은 무주택 세대주·순자산(3.45억)·보증금 5% 선납·은행 심사 통과 필요.
// UI 는 components/loan-calculator.tsx — 여기는 순수 로직만 (프로필 필터·테스트 용이).

import type { EligibilityForm } from "./eligibility";

export type LoanProduct = {
  id: "youth" | "newly" | "general" | "wolse";
  tab: string; // 세그먼트 탭 (짧게)
  name: string; // 결과 카드 상품명
  require: string; // 대상 요건 요약 (경고 문구용)
  ltv: number; // 보증금 대비 한도 비율 (월세대출은 미사용)
  capManwon: number; // 상품 최대 한도 (만원, 수도권 기준)
  maxYears: number;
  depositTiers?: number[]; // 보증금 구간 상한(만원) — brackets 금리 배열과 짝
  brackets: [number, number[]][];
};

export const LOAN_PRODUCTS: LoanProduct[] = [
  // 청년전용 버팀목: 만 19~34세 · 연소득 5천만 이하(신혼 7.5천/2자녀 6천 예외)
  // 보증금 3억 이하 주택 · 80% · 최대 1.5억 (만 25세 미만 단독세대주 1.2억)
  { id: "youth", tab: "청년", name: "청년버팀목", require: "만 19~34세 · 연소득 5천만 이하",
    ltv: 0.8, capManwon: 15000, maxYears: 10,
    brackets: [[2000, [2.2]], [4000, [2.5]], [6000, [2.9]], [7500, [3.3]]] },
  // 신혼부부전용 버팀목: 혼인 7년 이내(3개월 내 결혼 예정 포함) · 부부합산 7,500만 이하
  // 보증금 수도권 4억 이하 · 80% · 수도권 최대 2.5억 — 금리는 소득×보증금 구간
  { id: "newly", tab: "신혼", name: "신혼부부 버팀목", require: "혼인 7년 이내(예비 포함) · 부부합산 7,500만 이하",
    ltv: 0.8, capManwon: 25000, maxYears: 10,
    depositTiers: [5000, 10000, 15000, Infinity],
    brackets: [
      [2000, [1.9, 2.0, 2.1, 2.2]],
      [4000, [2.2, 2.3, 2.4, 2.5]],
      [6000, [2.6, 2.7, 2.8, 2.9]],
      [7500, [3.0, 3.1, 3.2, 3.3]],
    ] },
  // 일반 버팀목: 부부합산 5천만 이하(신혼·2자녀 예외 상향) · 보증금 수도권 3억 이하
  // 70%(신혼·2자녀 80%) · 수도권 최대 1.2억 — 금리는 소득×보증금 구간
  { id: "general", tab: "일반", name: "일반 버팀목", require: "연소득 5천만 이하(부부합산)",
    ltv: 0.7, capManwon: 12000, maxYears: 10,
    depositTiers: [2000, 5000, Infinity],
    brackets: [
      [2000, [2.5, 2.6, 2.7]],
      [4000, [2.7, 2.8, 2.9]],
      [6000, [3.0, 3.1, 3.2]],
      [7500, [3.3, 3.4, 3.5]],
    ] },
  // 주거안정월세대출 일반형: 연소득 5천만 이하 · 보증금 1억·월세 60만 이하 주택
  // 월 최대 60만 × 2년 (총 1,440만) · 연장 최장 10년 · 일반형 1.8% (우대형 1.3%)
  { id: "wolse", tab: "월세", name: "주거안정 월세대출", require: "연소득 5천만 이하",
    ltv: 0, capManwon: 1440, maxYears: 10,
    brackets: [[5000, [1.8]]] },
];

export type ProfileBrief = { age: number; annual: number; newlywed: boolean };

// 연소득 구간 × 보증금 구간 금리. 소득 미입력·구간 초과 시 최고 구간(보수적)으로.
export function rateFor(p: LoanProduct, annual: number | null, depositManwon: number): number {
  let rates = p.brackets[p.brackets.length - 1][1];
  if (annual != null) {
    for (const [max, r] of p.brackets) if (annual <= max) { rates = r; break; }
  }
  if (!p.depositTiers) return rates[0];
  const col = p.depositTiers.findIndex((max) => depositManwon <= max);
  return rates[col < 0 ? rates.length - 1 : col];
}

export function limitFor(p: LoanProduct, deposit: number, rent: number): number {
  if (p.id === "wolse") return Math.min(p.capManwon, rent * 24);
  return Math.min(p.capManwon, Math.floor(deposit * p.ltv));
}

// 프로필 요건 충족 여부 (annual 0 = 소득 미입력 → 통과로 간주)
export function qualifies(p: LoanProduct, prof: ProfileBrief): boolean {
  const incomeOk = (cap: number) => prof.annual === 0 || prof.annual <= cap;
  if (p.id === "youth") return prof.age >= 19 && prof.age <= 34 && incomeOk(5000);
  if (p.id === "newly") return prof.newlywed && incomeOk(7500);
  return incomeOk(5000);
}

// 자동 선택 — 신혼 > 청년 > 일반 순으로 첫 충족 상품
export function autoSelect(prof: ProfileBrief): LoanProduct["id"] {
  for (const id of ["newly", "youth"] as const) {
    const p = LOAN_PRODUCTS.find((x) => x.id === id)!;
    if (qualifies(p, prof)) return id;
  }
  return "general";
}

export function toBrief(form: EligibilityForm): ProfileBrief | null {
  const age = Number(form.age);
  if (!Number.isFinite(age)) return null;
  const annual = form.income ? Number(form.income) * 12 : 0;
  const newlywed =
    form.married === "planning" ||
    (form.married === "yes" && (!form.marriedYears || Number(form.marriedYears) <= 7));
  return { age, annual: Number.isFinite(annual) ? annual : 0, newlywed };
}
