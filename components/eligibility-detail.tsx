"use client";

// 디테일 패널의 "입주 자격" 섹션 — 정규화된 계층 칩으로만 표시 (UI 통일).
// 소득표·자산 등 세부 조건은 공고마다 구조가 달라 1차 노출에서 제외, 공고문 링크로 위임.
// /api/eligibility/{listingId} 에서 lazy fetch.

import { useEffect, useState } from "react";

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

// 계층 본문에 보여줄 실제 내용이 있는지 (이름만 있는 "구조뿐인" 계층 판별용).
function hasContent(t: Tier): boolean {
  return (
    Boolean(t.age) || Boolean(t.marriage) ||
    t.income?.percent != null || Boolean(t.income?.byHousehold) || Boolean(t.income?.note) ||
    t.asset?.total != null || t.asset?.car != null ||
    (t.other?.length ?? 0) > 0
  );
}

// 보여줄 내용이 전혀 없는 데이터(tiers 빈 배열 등)는 데이터 없음과 동일 취급 — 타입 안내 fallback.
function hasUsableData(d: EligibilityData): boolean {
  return (
    (d.tiers ?? []).some((t) => (typeof t.units === "number" && t.units > 0) || hasContent(t)) ||
    (d.priority?.length ?? 0) > 0
  );
}

// "1순위 - 생계·의료급여 수급자" → "생계·의료급여 수급자" (행정 순위 접두어 제거).
function stripRankPrefix(name: string): string {
  const stripped = name.replace(/^\s*\d+\s*순위\s*[-–—·:()]*\s*/, "").trim();
  return stripped || name;
}

// 칩 표시용 계층 이름 정규화 — 같은 의미의 변형 표기를 표준 이름으로 수렴.
// 예: "국민임대 일반공급"/"일반(입주자격완화)"/"일반 (국민임대)" → "일반",
//     "청년 계층" → "청년", "영구임대 1순위 (생계·의료급여수급자 등)" → "생계·의료급여수급자 등"
function normalizeTierName(raw: string): string {
  let n = raw.replace(/^(국민임대|영구임대|행복주택|통합공공임대|매입임대)\s*/, "").trim();
  n = stripRankPrefix(n);
  n = n.replace(/\s*계층$/, "");
  n = n.replace(/^일반\s*\(.*\)$/, "일반");
  n = n.replace(/^일반공급$/, "일반");
  n = n.replace(/산업단지근로자/, "산업단지 근로자");
  // 순위 접두어 제거로 여는 괄호가 사라진 경우 닫는 괄호 잔여물 정리
  if (n.endsWith(")") && !n.includes("(")) n = n.slice(0, -1);
  n = n.trim();
  return n || raw.trim();
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
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

  if (!data || !hasUsableData(data)) {
    const desc = housingType ? TYPE_DESCRIPTIONS[housingType] : null;
    return (
      <div className="eli-detail">
        <div className="eli-empty">
          {desc ? (
            <>
              {/* 제목이 이미 "유형 — 핵심 자격"을 담고 있어 요약 줄은 중복 → 생략 */}
              <div className="eli-empty-title">{desc.title}</div>
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

  // 정리: 빈 tier(내용·세대수 모두 없음) 제외 → 정규화 → dedupe.
  const tiers = (data.tiers ?? []).filter(
    (t) => (typeof t.units === "number" && t.units > 0) || hasContent(t),
  );
  const targetNames = Array.from(new Set(tiers.map((t) => normalizeTierName(t.name))));

  return (
    <div className="eli-detail">
      <div className="eli-section-title">입주 자격</div>

      <div className="eli-target">
        <div className="eli-target-label">대상</div>
        <div className="eli-tag-list">
          {targetNames.map((n, i) => <span key={i} className="eli-tag">{n}</span>)}
        </div>
      </div>

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

      {/* 소득·자산 세부는 공고마다 구조가 달라 공고문으로 위임 */}
      {sourceUrl && (
        <a href={sourceUrl} target="_blank" rel="noreferrer" className="eli-empty-link" style={{ marginTop: 10 }}>
          소득·자산 등 자세한 자격조건은 공고문에서 →
        </a>
      )}
    </div>
  );
}
