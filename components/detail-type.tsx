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
      <dl className="type-intro-metrics">
        {meta.metrics.map((m) => (
          <div key={m.label} className="type-metric">
            <dt className="type-metric-label">{m.label}</dt>
            <dd className="type-metric-value">{m.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ConfirmLink({ url }: { url?: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="detail-confirm-link">
      원문 보기 →
    </a>
  );
}

function formatSalePrice(manwon: number): string {
  const eok = Math.floor(manwon / 10000);
  const rest = manwon % 10000;
  return `${eok > 0 ? `${eok}억 ` : ""}${rest.toLocaleString()}만원`;
}

// 타입별 가격 의미 분화:
//  · sale   → 분양가 (소유)
//  · jeonse → 전세보증금 (월세는 rent>0 일 때만 — 전세임대는 소액 월세 있고, 순수 전세는 0)
//  · 그 외  → 보증금 + 월 임대료
export function TypePrice({ item }: { item: Listing }) {
  const variant = housingTypeMeta(item.type).variant;

  if (variant === "sale") {
    return (
      <div className="detail-price">
        <div className="detail-price-cell detail-price-cell--full">
          <div className="detail-price-label">분양가 (평균)</div>
          <div className="detail-price-value">
            {item.salePriceManwon && item.salePriceManwon > 0 ? (
              formatSalePrice(item.salePriceManwon)
            ) : (
              <>
                <span style={{ fontSize: 14, marginRight: 8 }}>단지별 상이</span>
                <ConfirmLink url={item.sourceUrl} />
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (variant === "jeonse") {
    return (
      <div className="detail-price">
        <div className={`detail-price-cell ${item.rent > 0 ? "" : "detail-price-cell--full"}`}>
          <div className="detail-price-label">전세보증금</div>
          <div className="detail-price-value">
            {item.deposit > 0 ? `${item.deposit.toLocaleString()}만원` : <ConfirmLink url={item.sourceUrl} />}
          </div>
        </div>
        {item.rent > 0 && (
          <div className="detail-price-cell">
            <div className="detail-price-label">월 임대료</div>
            <div className="detail-price-value">{item.rent}만원</div>
          </div>
        )}
      </div>
    );
  }

  // 보증금·월세 둘 다 listing 레벨에 없으면(매입/일부 임대) "공고문 확인" 셀 2개가 누락처럼 보임 → 한 줄로 통합.
  if (item.deposit <= 0 && item.rent <= 0) {
    return (
      <div className="detail-price">
        <div className="detail-price-cell detail-price-cell--full">
          <div className="detail-price-label">임대조건</div>
          <div className="detail-price-value">
            <span style={{ fontSize: 14, marginRight: 8 }}>단지별 상이</span>
            <ConfirmLink url={item.sourceUrl} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="detail-price">
      <div className="detail-price-cell">
        <div className="detail-price-label">보증금</div>
        <div className="detail-price-value">
          {item.deposit > 0 ? `${item.deposit.toLocaleString()}만원` : <ConfirmLink url={item.sourceUrl} />}
        </div>
      </div>
      <div className="detail-price-cell">
        <div className="detail-price-label">월 임대료</div>
        <div className="detail-price-value">
          {item.rent > 0 ? `${item.rent}만원` : <ConfirmLink url={item.sourceUrl} />}
        </div>
      </div>
    </div>
  );
}
