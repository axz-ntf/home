import type { CSSProperties } from "react";
import type { Listing, HousingTypeId } from "@/lib/types";
import { housingTypeMeta } from "@/lib/housing-type-meta";
import { HOUSING_TYPES } from "@/lib/mock-data";

// 타입별 상세 패널 분화 — 공통 골격(DetailPanel)은 유지하고,
// 제도 인트로 카드와 가격 블록만 타입 의미에 맞게 렌더한다.

// 타입 액센트를 CSS 변수로 주입 — 이 style 을 단 엘리먼트의 하위(인트로·가격·자격)가
// --type-accent* 를 상속해 한 가지 색으로 테마링된다. (styles.css 의 eli-*, detail-confirm-link 가 소비)
export function accentVars(type: HousingTypeId): CSSProperties {
  const a = housingTypeMeta(type).accent;
  return {
    ["--type-accent" as string]: `var(--seed-scale-color-${a}-700)`,
    ["--type-accent-low" as string]: `var(--seed-scale-color-${a}-50)`,
    ["--type-accent-strong" as string]: `var(--seed-scale-color-${a}-600)`,
  } as CSSProperties;
}

// 제도 인트로 카드 — 타입 액센트 컬러 + 한 줄 설명 + 핵심 지표 3개.
export function TypeIntro({ item }: { item: Listing }) {
  const meta = housingTypeMeta(item.type);
  const name = HOUSING_TYPES.find((t) => t.id === item.type)?.name ?? item.type;
  const accentText = `var(--seed-scale-color-${meta.accent}-700)`;
  const accentBg = `var(--seed-scale-color-${meta.accent}-50)`;

  return (
    <section
      className="type-intro"
      style={{ background: accentBg, borderColor: accentText }}
    >
      <div className="type-intro-name" style={{ color: accentText }}>
        {name}
      </div>
      <div className="type-intro-tagline">{meta.tagline}</div>
      {meta.metrics.length > 0 && (
        <dl className="type-intro-metrics">
          {meta.metrics.map((m) => (
            <div key={m.label} className="type-metric">
              <dt className="type-metric-label">{m.label}</dt>
              <dd className="type-metric-value">{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

// (TypePrice 제거 — 임대 조건 1차 노출은 detail-panel 의 RentSummarySection 으로 통일)
