import type { CSSProperties } from "react";
import type { Listing, HousingTypeId } from "@/lib/types";
import { housingTypeMeta } from "@/lib/housing-type-meta";
import { HOUSING_TYPES } from "@/lib/mock-data";
import { formatManwon } from "@/lib/format";

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

// 거래 유형별 가격 표현 (사용자 멘탈모델 기준):
//  · 매매/분양(sale) → 분양가 또는 매매가 (단일)
//  · 월세 (rent>0)   → 보증금 + 월 임대료
//  · 전세 (월세 없음) → 전세보증금 (단일, 월세 칸 없음)
//  · 둘 다 없음      → 단지별 상이
export function TypePrice({ item }: { item: Listing }) {
  const variant = housingTypeMeta(item.type).variant;
  const isJeonse = variant === "jeonse" || /전세/.test(item.title ?? "");
  const depositLabel = isJeonse ? "전세보증금" : "보증금";

  // 매매/분양 — 단일 가격
  if (variant === "sale") {
    const isResale = /매각|분양전환/.test(item.title ?? "");
    return (
      <div className="detail-price">
        <div className="detail-price-cell detail-price-cell--full">
          <div className="detail-price-label">{isResale ? "매매가" : "분양가 (평균)"}</div>
          <div className="detail-price-value">
            {item.salePriceManwon && item.salePriceManwon > 0 ? (
              formatManwon(item.salePriceManwon)
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

  // 월세 — 보증금 + 월 임대료
  if (item.rent > 0) {
    return (
      <div className="detail-price">
        <div className="detail-price-cell">
          <div className="detail-price-label">{depositLabel}</div>
          <div className="detail-price-value">
            {item.deposit > 0 ? formatManwon(item.deposit) : <ConfirmLink url={item.sourceUrl} />}
          </div>
        </div>
        <div className="detail-price-cell">
          <div className="detail-price-label">월 임대료</div>
          <div className="detail-price-value">{item.rent}만원</div>
        </div>
      </div>
    );
  }

  // 전세 (월세 없음) — 단일 칸, 월세 칸 안 만듦
  if (item.deposit > 0) {
    return (
      <div className="detail-price">
        <div className="detail-price-cell detail-price-cell--full">
          <div className="detail-price-label">{depositLabel}</div>
          <div className="detail-price-value">{formatManwon(item.deposit)}</div>
        </div>
      </div>
    );
  }

  // 가격 정보 없음
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
