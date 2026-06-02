import type { HousingTypeId } from "@/lib/types";
import { HOUSING_TYPES } from "@/lib/mock-data";
import { LH_ADMIN_LISTINGS } from "@/lib/lh-adapter";
import { TypeIntro, TypePrice, accentVars } from "@/components/detail-type";
import { EligibilityDetail } from "@/components/eligibility-detail";
import { getEligibility } from "@/lib/notice-eligibility";

// 임시 리뷰용 목업 — 타입별 상세(인트로·가격·입주자격)가 실제 데이터로 어떻게 렌더되는지.
// 검토 후 폴더째 삭제 가능.

// 타입별 대표 매물 — 자격 데이터가 가장 풍부한 실 매물 id (없으면 해당 타입 첫 매물 fallback).
const PREFERRED: Partial<Record<HousingTypeId, string>> = {
  happy: "lh-rental-2015122300019972", // tiers 5 · 우선공급 4
  nation: "lh-rental-2015122300019984", // 우선공급 18
  perm: "lh-rental-2015122300019970", // tiers 2 · 우선공급 16
  fifty: "lh-rental-2015122300019938",
  buy: "lh-rental-2015122300019865", // tiers 7
  sale: "lh-sale-0000061080", // tiers 10
  // integ · jeonse 는 구조화 자격 데이터가 없어 fallback(제도 안내) 상태로 표시됨
};

function hasRichEligibility(id: string): boolean {
  const d = getEligibility(id);
  return !!d && (d.tiers?.length ?? 0) > 0;
}

function pickListing(type: HousingTypeId) {
  const preferred = PREFERRED[type];
  if (preferred) {
    const hit = LH_ADMIN_LISTINGS.find((l) => l.id === preferred);
    if (hit) return hit;
  }
  const ofType = LH_ADMIN_LISTINGS.filter((l) => l.type === type);
  // 자격 데이터가 실제로 있는 매물 우선 (없으면 fallback 안내 상태 노출)
  return ofType.find((l) => hasRichEligibility(l.id)) ?? ofType[0] ?? null;
}

const TOKEN_LOW = "var(--seed-semantic-color-ink-text-low)";
const TOKEN_DIVIDER = "var(--seed-semantic-color-divider-2)";
const TOKEN_PAPER = "var(--seed-semantic-color-paper-default)";
const TOKEN_WHITE = "var(--seed-static-color-white)";

export default async function MockupPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const types = t ? HOUSING_TYPES.filter((h) => h.id === t) : HOUSING_TYPES;

  // 각 타입의 대표 매물 + 데이터 상태(실데이터/제도 안내)를 미리 계산해 한 번만 순회.
  const cards = types.map((ht) => {
    const item = pickListing(ht.id);
    const isRich = !!item && hasRichEligibility(item.id);
    return { ht, item, isRich };
  });
  const richCount = cards.filter((c) => c.isRich).length;
  const fallbackCount = cards.length - richCount;

  return (
    <div
      style={{
        height: "100vh",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        background: TOKEN_PAPER,
      }}
    >
      {/* 점프 내비 — 8개 타입을 스크롤 없이 오갈 수 있게. (PO 리뷰 동선) */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "color-mix(in srgb, var(--seed-semantic-color-paper-default) 86%, transparent)",
          backdropFilter: "saturate(180%) blur(12px)",
          WebkitBackdropFilter: "saturate(180%) blur(12px)",
          borderBottom: `1px solid ${TOKEN_DIVIDER}`,
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "10px 20px",
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
          }}
        >
          {cards.map(({ ht, isRich }) => (
            <a
              key={ht.id}
              href={`#type-${ht.id}`}
              className={`badge ${ht.badge}`}
              style={{
                textDecoration: "none",
                gap: 5,
                opacity: isRich ? 1 : 0.55,
              }}
            >
              {ht.name}
              <span style={{ fontSize: 9 }} aria-hidden>
                {isRich ? "●" : "○"}
              </span>
            </a>
          ))}
        </div>
      </nav>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px 96px" }}>
        <header style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8 }}>
            공공주택 타입별 상세 — 데이터 리뷰
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: TOKEN_LOW, maxWidth: 640 }}>
            8개 유형의 상세 패널(제도 소개 · 가격 · 입주 자격)을 실제 매물 데이터로 렌더한 화면입니다.
            가격·자격은 추출 파이프라인의 진짜 결과예요.
          </p>
          <div style={{ display: "flex", gap: 14, marginTop: 14, fontSize: 12.5, color: TOKEN_LOW, alignItems: "center" }}>
            <span>
              <span aria-hidden>●</span> 실데이터 {richCount}
            </span>
            <span>
              <span aria-hidden>○</span> 제도 안내(fallback) {fallbackCount}
            </span>
          </div>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(440px, 1fr))",
            gap: 24,
            alignItems: "start",
          }}
        >
          {cards.map(({ ht, item, isRich }) => (
            <section
              key={ht.id}
              id={`type-${ht.id}`}
              style={{
                scrollMarginTop: 64,
                border: `1px solid ${TOKEN_DIVIDER}`,
                borderRadius: 16,
                overflow: "hidden",
                background: TOKEN_WHITE,
                boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px -16px rgba(0,0,0,0.18)",
                ...accentVars(ht.id),
              }}
            >
              {/* 카드 헤더 — 타입 정체성 + 공급기관 + 데이터 상태 */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "14px 18px",
                  borderBottom: `1px solid ${TOKEN_DIVIDER}`,
                }}
              >
                <span className={`badge ${ht.badge}`}>{ht.name}</span>
                <span className="badge agency">{item?.agency ?? "LH"} 공급</span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: isRich
                      ? "var(--seed-scale-color-green-50)"
                      : "var(--seed-scale-color-gray-100)",
                    color: isRich
                      ? "var(--seed-scale-color-green-700)"
                      : "var(--seed-scale-color-gray-600)",
                  }}
                >
                  {isRich ? "실데이터" : "제도 안내"}
                </span>
              </div>

              <div style={{ padding: 18 }}>
                {item ? (
                  <>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        lineHeight: 1.4,
                        marginBottom: 12,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical" as const,
                      }}
                    >
                      {item.title}
                    </div>
                    <TypeIntro item={item} />
                    <TypePrice item={item} />
                    <EligibilityDetail listingId={item.id} sourceUrl={item.sourceUrl} housingType={item.type} />
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: TOKEN_LOW, padding: "20px 0" }}>
                    이 타입의 매물이 없습니다.
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
