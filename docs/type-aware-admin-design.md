# 유형별 어드민 구조 설계 (3번)

> PDF 서베이(LH 9종 + SH 11종 실측) 기반. 단일 평면 스키마(deposit/rent/rows)가
> 유형별 가격·자격 구조를 못 담아 검수 폼·추출·디테일이 어긋나는 문제를 해결.

---

## 1. 핵심 문제

현재 override 스키마는 `{ deposit, rent, salePriceManwon, rows[], supplyUnits, area }` 하나로 모든 유형을 표현하려 함.
하지만 실측 결과 유형마다 **가격의 구조 자체**가 다름:

| 발견 (실제 공고문) | 단일 스키마로 안 되는 이유 |
|---|---|
| 영구임대 가군/나군 (당진석문) — 보259/월5 vs 보1305/월12 | **소득계층별로 가격이 다름** — 한 평형에 가격 2개 |
| 통합공공임대 (함평기산) — 소득연계형 | 같은 평형도 **소득구간별 임대료 상이** |
| 매입임대 (대구달서) — 1형/2형/3형 = 가구원수별 면적구간 | **평형이 아니라 가구원수 유형**, 개별 호실 산재 |
| 전세임대 (기존주택) | **평형·단지 없음** — 지원한도액만 |
| 집주인임대 (대전동구) — 개별 호실 수십개 | 호실별 산재 → **가격 범위** 표현 필요 |
| 전환보증금 (국민/영구/50년/매입 전부) | 월세를 보증금으로 전환 → **"저가" 킬러 정보인데 100% 누락** |
| 분양/매각 (구미화성) — 동·호별 | **동·호 단위 개별 분양가** |
| SH 장기전세 | **보증금만** (월세 없음) |

→ 결론: **가격 모델을 유형별 variant 로 분기**해야 함.

---

## 2. 가격 모델 분류 (PriceModel)

8개 LH + 11개 SH 유형을 **6개 가격 모델**로 수렴:

| PriceModel | 구조 | 해당 유형 |
|---|---|---|
| `rows-by-area` | 평형별 1행 (보증금/월세) | 국민임대, 50년임대, 행복주택(계층 무관 단일가일 때), SH 행복주택 |
| `tiered-by-income` | 평형 × 소득계층(가/나군, 1~N구간) 매트릭스 | 영구임대, 통합공공임대, 고령자복지 |
| `by-household-size` | 가구원수 유형(1/2/3형) + 면적구간 + 가격범위 | 매입임대, 집주인임대, SH 매입/수요자맞춤형 |
| `support-limit` | 지원한도액 (평형 없음) | 전세임대, SH 전세임대/장기안심 |
| `deposit-only` | 보증금 단일 (월세 없음) | SH 장기전세주택 |
| `per-unit-sale` | 동·호별 단일 분양가 | 분양, 매각, SH 분양 |

**공통 부가 옵션** (모델과 직교):
- `conversion` — 전환보증금 제도: `{ limitManwon, convertedDeposit, convertedRent, rate }`. 모든 임대형에 선택적.
- `incomeTiers` — 계층/구간 라벨 메타 (tiered 모델에서 사용).

---

## 3. 확장 스키마 (하위호환 = 기존 필드 유지)

```ts
// 기존 ManualOverride 는 그대로 두고, priceModel + 모델별 블록을 ADD (옵셔널).
// priceModel 없으면 = 레거시 단일/rows 모드 (현 동작 유지). 점진 마이그레이션.

interface ManualOverrideV2 extends ManualOverride {
  priceModel?: PriceModel;

  // rows-by-area / deposit-only — 기존 rows 재사용 (salePrice/rent 유무로 구분)

  // tiered-by-income
  tiers?: {
    houseType: string;       // "26A"
    area?: string;           // "26.84㎡"
    supplyUnits?: number | null;
    incomes: { label: string; deposit: number | null; rent: number | null }[]; // 가군/나군 또는 1~N구간
  }[];

  // by-household-size
  householdTypes?: {
    label: string;           // "2인 가구(1형)"
    areaRange?: string;      // "전용 50㎡ 이하"
    supplyUnits?: number | null;
    depositRange?: [number, number] | number | null; // 범위 또는 단일(만원)
    rentRange?: [number, number] | number | null;
  }[];

  // support-limit
  supportLimit?: { byHousehold: { label: string; limitManwon: number }[] };

  // 전환보증금 (공통 옵션)
  conversion?: {
    perHouseType?: { houseType: string; limitManwon: number; maxDeposit: number; minRent: number }[];
    rateUp?: number;    // 보증금→월세 전환이율 (예 3.5)
    rateDown?: number;  // 월세→보증금 전환이율 (예 6)
  };

  // 일정 확장 (기존 deadline 외)
  schedule?: { applyStart?: string; applyEnd?: string; docResultAt?: string; winnerAt?: string };

  // 단지 메타 확장
  complexMeta?: { addressJibun?: string; firstMoveIn?: string; structure?: string; contact?: string };
}

type PriceModel = "rows-by-area" | "tiered-by-income" | "by-household-size"
  | "support-limit" | "deposit-only" | "per-unit-sale";
```

`applyOverride()` 는 priceModel 분기 추가, 없으면 기존 경로 (레거시 무손상).

---

## 4. 유형 → 모델 매핑 테이블 (LH + SH 통합)

```ts
const PRICE_MODEL_BY_TYPE: Record<HousingTypeId, PriceModel> = {
  nation: "rows-by-area", fifty: "rows-by-area", happy: "rows-by-area",
  perm: "tiered-by-income", integ: "tiered-by-income",
  buy: "by-household-size", jeonse: "support-limit",
  sale: "per-unit-sale",
};
// SH 청약유형 → HousingTypeId (신규 매핑)
const SH_TYPE_MAP = {
  "행복주택": "happy", "매입임대주택": "buy", "장기전세주택": "jeonse-deposit"/*신규*/,
  "전세임대": "jeonse", "국민공공임대주택": "nation", "수요자맞춤형": "buy",
  "청년안심주택": "happy"/*청년 중심*/, "도시형생활주택": "nation",
  "두레주택": "buy", "희망하우징": "happy", "장기안심주택": "support-limit",
};
```
→ SH 장기전세(deposit-only)용 신규 type 또는 variant 1개 추가 필요.

---

## 5. 어드민 검수 폼 (유형별 분화)

- 검수 폼 상단에서 **PriceModel 자동 판별**(type 기반) → 해당 입력 UI만 렌더.
  - rows-by-area → 현 평형별 입력 (유지)
  - tiered-by-income → 평형 × 계층 매트릭스 입력
  - by-household-size → 가구원수 유형 + 범위 입력
  - support-limit → 가구원수별 한도액 입력
  - per-unit-sale → 동·호 + 분양가
- **전환보증금 섹션**(공통, 접이식) 추가.
- **일정 그룹** 확장: 접수시작/마감/서류발표/당첨발표.
- AI 자동추출 결과를 해당 모델 구조로 매핑해 채움 → 검수자 교정.

## 6. 추출 스키마 확장 (2번과 연결)

- `solar-extract.ts` 프롬프트를 PriceModel 인지형으로:
  - 유형 힌트를 받아 해당 모델 스키마로 출력 (tiered면 계층별, 가구원수형이면 유형별 범위).
  - SH 양식 키워드 보강 (LH 튜닝 → 공통화). ← **2번 SH 추출 튜닝이 여기 흡수됨**
- 검증 로직도 모델별로 (가격 원문 대조는 공통).

## 7. 디테일 페이지 표현 (공개면)

- `TypePrice` 를 PriceModel별 렌더로 확장:
  - tiered → 소득계층 토글 ("가군/나군" 또는 "1~4구간")
  - household → 가구원수 선택 → 해당 범위
  - **conversion → 전환 슬라이더**: "보증금 X만 더 내면 월세 Y만" (저가 부동산 킬러 UI)
- 골격은 §1에서 통일한 그대로 — 데이터 모델만 풍부해짐.

---

## 8. 단계 (빌드 순서)

```
3-1. 스키마 + 매핑 테이블 + applyOverride 분기 (하위호환 검증)
3-2. 추출 스키마 모델 인지화 (= 2번 SH 추출 튜닝 흡수)
3-3. 어드민 폼 유형별 분화
3-4. 디테일 TypePrice 모델별 렌더 + 전환보증금 UI
─────  여기까지 3번 ─────
2.   SH 유형매핑·지오코딩·병합 (3번 구조에 SH 데이터 얹기)
4.   청년안심주택 (SH 크롤에 8건 이미 포함 — 매핑만)
```

**핵심**: 3번이 "그릇"을 만들고, 2번 SH는 그 그릇에 데이터를 붓는 구조.
SH 추출 튜닝(2번 숙제)이 3-2(추출 모델 인지화)에 자연 흡수됨 → 중복 작업 제거.
