"use client";

// 디테일 패널의 "입주 자격" 섹션 — 구조화 자격 데이터 기반 풍부한 UI.
// /api/eligibility/{listingId} 에서 lazy fetch.
// 시안: 계층 탭 / 연령·혼인·월소득·자산 카드 / 기타 / 우선공급 / CTA.

import { useEffect, useState } from "react";
import { eligibilitySummaryByType } from "@/lib/mock-data";

type HousingType = "happy" | "nation" | "perm" | "integ" | "fifty" | "sale" | "buy" | "jeonse";

export const TYPE_DESCRIPTIONS: Record<HousingType, { title: string; detail: string[] }> = {
  happy: {
    title: "행복주택 — 청년·신혼·고령 등 다계층",
    detail: [
      "만 19~39세 청년, 신혼부부, 한부모, 고령자, 대학생 등",
      "소득 100~120% 이하, 무주택 세대구성원",
      "최대 거주기간 6~20년 (계층별 상이)",
    ],
  },
  nation: {
    title: "국민임대 — 무주택 저소득층 (장기거주)",
    detail: ["도시근로자 가구당 월평균 소득 70% 이하", "무주택 세대구성원", "최대 30년 거주 가능"],
  },
  perm: {
    title: "영구임대 — 수급·차상위·장애 등 특별 자격",
    detail: ["기초생활수급자 / 차상위 / 장애인 / 국가유공자 등", "무주택 세대구성원", "장기 거주"],
  },
  integ: {
    title: "통합공공임대 — 무주택 (소득 100~150%)",
    detail: ["도시근로자 가구당 월평균 소득 100% (계층 따라 150%) 이하", "무주택 세대구성원"],
  },
  fifty: {
    title: "50년임대 — 무주택 저소득층",
    detail: ["도시근로자 가구당 월평균 소득 70% 이하", "무주택 세대구성원", "최대 50년 거주"],
  },
  sale: {
    title: "공공분양 — 무주택 + 청약통장",
    detail: ["무주택 세대구성원", "주택청약저축 가입자", "공급 가격 합리적 분양가"],
  },
  buy: {
    title: "매입임대 — 청년·신혼·자녀",
    detail: ["청년, 신혼부부, 자녀가구 대상", "무주택 세대구성원", "기존 주택을 LH 가 매입 후 공급"],
  },
  jeonse: {
    title: "전세임대 — 청년·신혼",
    detail: ["청년, 신혼부부 대상", "본인이 원하는 집을 LH 가 전세 계약", "무주택 세대구성원"],
  },
};

type Tier = {
  id: string;
  name: string;
  units?: number | null;
  age?: string | null;
  marriage?: string | null;
  income?: {
    percent?: number | null;
    byHousehold?: Record<string, number | null> | null;
    note?: string | null;
  } | null;
  asset?: { total?: number | null; car?: number | null } | null;
  other?: string[];
};

type EligibilityData = {
  supplyTotal?: number | null;
  tiers: Tier[];
  priority?: string[];
};

function formatManwon(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  // 1억 = 10000 만원
  if (v >= 10000) {
    const eok = Math.floor(v / 10000);
    const man = v % 10000;
    return man > 0 ? `${eok}억 ${man.toLocaleString()}만원` : `${eok}억원`;
  }
  return `${v.toLocaleString()}만원`;
}

// Google Material Symbols Rounded — layout.tsx 에서 폰트 link 로드.
// ligature 방식: 이름 텍스트가 자동으로 아이콘 글리프로 치환됨.
function MSIcon({ name }: { name: string }) {
  return <span className="material-symbols-rounded eli-icon" aria-hidden>{name}</span>;
}
const IconClock = () => <MSIcon name="schedule" />;
const IconRing = () => <MSIcon name="favorite" />;
const IconCoin = () => <MSIcon name="payments" />;
const IconHome = () => <MSIcon name="savings" />;
const IconCheck = () => <MSIcon name="check_circle" />;

function IncomeTable({ income }: { income: NonNullable<Tier["income"]> }) {
  if (!income.byHousehold) return null;
  const entries = Object.entries(income.byHousehold)
    .filter(([, v]) => v != null)
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  if (!entries.length) return null;
  return (
    <div className="eli-income-grid">
      {entries.map(([k, v]) => (
        <div key={k} className="eli-income-cell">
          <div className="eli-income-key">{k}인</div>
          <div className="eli-income-val">{v!.toLocaleString()}만</div>
        </div>
      ))}
    </div>
  );
}

// 한 item 안에 동그라미 숫자 마커 (①②③...) 또는 "·" bullet 가 여러 개 있으면 split.
// LH 공고문이 한 줄에 ①②③ 식으로 채우는 경우가 많아서 가독성 위해 펼침.
function expandOtherItem(item: string): string[] {
  // ①~⑳ 마커 기준 split (마커 직전에서 끊음)
  if (/[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/.test(item)) {
    return item
      .split(/(?=[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [item];
}

// "라벨: a, b, c …" 처럼 라벨 뒤로 항목이 길게 나열되는 "기타" 줄은
// 한 문장으로 줄바꿈되며 벽처럼 보인다 (예: 영구임대 "해당 입주자격: …13개 계층").
// 라벨 + 태그 칩으로 분해해 스캔성을 높인다.
// · 천단위 콤마(숫자 3자리 직전)는 분해 대상이 아니므로 무시한다 (예: 82,800,000원).
// · 항목이 3개 미만이면 보통 나열이 아니라 문장/키-값이라 그대로 둔다 (예: "…이하, 자동차 소유 불가").
function parseEnumOther(text: string): { label: string; tags: string[] } | null {
  const m = text.match(/^(.{1,16}?)\s*[:：]\s*(.+)$/);
  if (!m) return null;
  const tags = m[2]
    .split(/\s*,(?!\d{3})\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (tags.length < 3) return null;
  return { label: m[1].trim(), tags };
}

function OtherList({ items }: { items: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const all = items.flatMap(expandOtherItem);
  const VISIBLE = 5;
  const showAll = expanded || all.length <= VISIBLE;
  const visibleItems = showAll ? all : all.slice(0, VISIBLE);
  const hidden = all.length - VISIBLE;
  return (
    <>
      <ul className="eli-other-list">
        {visibleItems.map((o, i) => {
          const enumerated = parseEnumOther(o);
          if (enumerated) {
            return (
              <li key={i} className="eli-other-enum">
                <span className="eli-other-enum-label">{enumerated.label}</span>
                <span className="eli-tag-list">
                  {enumerated.tags.map((tag, j) => (
                    <span key={j} className="eli-tag">{tag}</span>
                  ))}
                </span>
              </li>
            );
          }
          const hasMarker = /^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/.test(o.trim());
          return <li key={i} className={hasMarker ? "has-marker" : ""}>{o}</li>;
        })}
      </ul>
      {!showAll && (
        <button type="button" className="eli-more-btn" onClick={() => setExpanded(true)}>
          +{hidden}개 더 보기
        </button>
      )}
    </>
  );
}

// 계층 본문에 보여줄 실제 내용이 있는지 (이름만 있는 "구조뿐인" 계층 판별용).
function hasContent(t: Tier): boolean {
  return (
    Boolean(t.age) || Boolean(t.marriage) ||
    t.income?.percent != null || Boolean(t.income?.byHousehold) || Boolean(t.income?.note) ||
    t.asset?.total != null || t.asset?.car != null ||
    (t.other?.length ?? 0) > 0
  );
}

// "1순위 - 생계·의료급여 수급자" → "생계·의료급여 수급자" (행정 순위 접두어 제거).
function stripRankPrefix(name: string): string {
  const stripped = name.replace(/^\s*\d+\s*순위\s*[-–—·:()]*\s*/, "").trim();
  return stripped || name;
}

// 핵심 행 — 연령 / 혼인 / 월소득(중위 X% 한 줄). 표·노트는 MoreDetails 로.
function CoreRows({ tier }: { tier: Tier }) {
  const rows: { icon: React.ReactNode; label: string; content: React.ReactNode }[] = [];
  if (tier.age) rows.push({ icon: <IconClock />, label: "연령", content: tier.age });
  if (tier.marriage) rows.push({ icon: <IconRing />, label: "혼인", content: tier.marriage });
  if (tier.income?.percent != null) {
    rows.push({
      icon: <IconCoin />,
      label: "월 소득",
      content: <>중위소득 <strong>{tier.income.percent}%</strong> 이하</>,
    });
  }
  if (!rows.length) return null;
  return (
    <div className="eli-rows">
      {rows.map((r, i) => (
        <div key={i} className="eli-row">
          <div className="eli-row-icon" aria-hidden>{r.icon}</div>
          <div className="eli-row-label">{r.label}</div>
          <div className="eli-row-content">{r.content}</div>
        </div>
      ))}
    </div>
  );
}

// 접히는 디테일 — 가구원수별 소득표 · 자산 · 기타.
function MoreDetails({ tier }: { tier: Tier }) {
  const hasIncomeTable = !!tier.income?.byHousehold;
  const hasNote = !!tier.income?.note;
  const hasAsset = !!tier.asset && (tier.asset.total != null || tier.asset.car != null);
  const hasOther = !!tier.other?.length;
  if (!hasIncomeTable && !hasNote && !hasAsset && !hasOther) return null;
  return (
    <details className="eli-more">
      <summary>소득·자산 자세히 보기</summary>
      <div className="eli-rows eli-more-body">
        {hasIncomeTable && (
          <div className="eli-row">
            <div className="eli-row-icon" aria-hidden><IconCoin /></div>
            <div className="eli-row-label">월소득표</div>
            <div className="eli-row-content">
              <IncomeTable income={tier.income!} />
              {hasNote && <div className="eli-row-note">💡 {tier.income!.note}</div>}
            </div>
          </div>
        )}
        {hasAsset && (
          <div className="eli-row">
            <div className="eli-row-icon" aria-hidden><IconHome /></div>
            <div className="eli-row-label">자산</div>
            <div className="eli-row-content">
              <div className="eli-asset-list">
                {tier.asset!.total != null && <div>총자산 <strong>{formatManwon(tier.asset!.total)}</strong> 이하</div>}
                {tier.asset!.car != null && <div>자동차 <strong>{formatManwon(tier.asset!.car)}</strong> 이하</div>}
              </div>
            </div>
          </div>
        )}
        {hasOther && (
          <div className="eli-row">
            <div className="eli-row-icon" aria-hidden><IconCheck /></div>
            <div className="eli-row-label">기타</div>
            <div className="eli-row-content"><OtherList items={tier.other!} /></div>
          </div>
        )}
      </div>
    </details>
  );
}

export function EligibilityDetail({
  listingId,
  sourceUrl,
  housingType,
}: {
  listingId: string;
  sourceUrl?: string;
  housingType?: HousingType;
}) {
  const [data, setData] = useState<EligibilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTierIdx, setActiveTierIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    setActiveTierIdx(0);
    fetch(`/api/eligibility/${encodeURIComponent(listingId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) setData(j?.data ?? null); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [listingId]);

  if (loading) {
    return (
      <div className="eli-detail">
        <div className="eli-skeleton" />
        <div className="eli-skeleton" />
        <div className="eli-skeleton" />
      </div>
    );
  }

  if (!data) {
    const desc = housingType ? TYPE_DESCRIPTIONS[housingType] : null;
    const summary = housingType ? eligibilitySummaryByType(housingType) : null;
    return (
      <div className="eli-detail">
        <div className="eli-empty">
          {desc ? (
            <>
              <div className="eli-empty-title">{desc.title}</div>
              <div className="eli-empty-summary">{summary}</div>
              <ul className="eli-empty-list">
                {desc.detail.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </>
          ) : (
            <>
              <div className="eli-empty-title">자격 정보 안내</div>
              <div className="eli-empty-sub">정확한 자격은 LH 공고문을 확인해 주세요.</div>
            </>
          )}
          {sourceUrl && (
            <a href={sourceUrl} target="_blank" rel="noreferrer" className="eli-empty-link">
              공고문에서 자세한 자격 확인 →
            </a>
          )}
          <div className="eli-empty-foot">
            ※ 매물별 세부 자격(완화/추가) 은 공고문이 우선합니다
          </div>
        </div>
      </div>
    );
  }

  // 정리: name dedupe + 빈 tier(내용·세대수 모두 없음) 제외.
  const seenNames = new Set<string>();
  const tiers = (data.tiers ?? []).filter((t) => {
    if (seenNames.has(t.name)) return false;
    seenNames.add(t.name);
    const hasUnits = typeof t.units === "number" && t.units > 0;
    return hasUnits || hasContent(t);
  });

  // 내용 있는 계층(본문 후보). 그룹이 많으면(>TAB_LIMIT) 탭 벽 대신 "대상 칩" 요약,
  // 그룹별 세부(소득/자산)는 카드에서 빼 자가진단으로 위임. 적으면 탭 유지.
  const richTiers = tiers.filter(hasContent);
  const TAB_LIMIT = 5;
  const useChips = richTiers.length > TAB_LIMIT;
  const targetNames = Array.from(new Set(tiers.map((t) => stripRankPrefix(t.name))));
  const summaryNames = Array.from(
    new Set(tiers.filter((t) => !hasContent(t)).map((t) => stripRankPrefix(t.name)))
  );
  const activeTier = richTiers[activeTierIdx] ?? richTiers[0];

  return (
    <div className="eli-detail">
      <div className="eli-section-title">입주 자격</div>

      {useChips ? (
        /* 그룹 과다 → 대상 칩 요약 (세부 판단은 자가진단) */
        <div className="eli-target">
          <div className="eli-target-label">대상</div>
          <div className="eli-tag-list">
            {targetNames.map((n, i) => <span key={i} className="eli-tag">{n}</span>)}
          </div>
        </div>
      ) : (
        <>
          {/* 내용 있는 계층: 2개 이상이면 탭, 1개면 바로 본문 */}
          {richTiers.length > 1 && (
            <div className="eli-tabs" role="tablist">
              {richTiers.map((t, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === activeTierIdx}
                  className={`eli-tab ${i === activeTierIdx ? "on" : ""}`}
                  onClick={() => setActiveTierIdx(i)}
                >
                  <div className="eli-tab-name">{stripRankPrefix(t.name)}</div>
                </button>
              ))}
            </div>
          )}
          {activeTier && (
            <>
              <CoreRows tier={activeTier} />
              <MoreDetails tier={activeTier} />
            </>
          )}

          {/* 이름만 있는(세부 없는) 계층은 "그 외 대상" 칩으로 */}
          {summaryNames.length > 0 && (
            <div className="eli-target">
              <div className="eli-target-label">{richTiers.length > 0 ? "그 외 대상" : "대상"}</div>
              <div className="eli-tag-list">
                {summaryNames.map((n, i) => <span key={i} className="eli-tag">{n}</span>)}
              </div>
            </div>
          )}
        </>
      )}

      {/* 우선공급 대상 — 한 줄 + 접기 */}
      {data.priority && data.priority.length > 0 && (
        <details className="eli-more">
          <summary>우선공급 대상 {data.priority.length}개</summary>
          <ul className="eli-priority-list eli-more-body">
            {data.priority.map((p, i) => (
              <li key={i} className="eli-priority-item">{p}</li>
            ))}
          </ul>
        </details>
      )}

    </div>
  );
}
