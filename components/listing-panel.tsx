"use client";

import { useEffect, useRef, useState } from "react";
import { MdOutlineSearch, MdClose } from "react-icons/md";
import type { Listing, SortKey } from "@/lib/types";
import { AgencyBadge } from "./agency-badge";
import { eligibilitySummaryByType, HOUSING_TYPES } from "@/lib/mock-data";
import { dDayText, effectiveStatus } from "@/lib/dday";
import { formatManwon } from "@/lib/format";

function typeBadge(type: Listing["type"], item?: Listing) {
  const t = HOUSING_TYPES.find((x) => x.id === type);
  if (!t) return null;
  // SH 는 자체 청약유형(청년안심주택·수요자맞춤형 등)을 그대로 노출 (개선안1차 M4).
  const label = item?.agency === "SH" && item.suplyTyNm ? item.suplyTyNm : t.name;
  return <span className={`badge ${t.badge}`}>{label}</span>;
}

// 대상 계층 태그 (M3) — eligible 엔 자격조건(무주택·자산·소득)과 계층이 섞여 있어 계층만 추림.
const TIER_TAGS = ["청년", "신혼", "대학생", "고령", "다자녀", "자녀", "한부모", "수급자", "주거급여"];
function tierTags(item: Listing): string[] {
  const tags = (item.eligible ?? []).filter((e) => TIER_TAGS.some((t) => e.includes(t)));
  return [...new Set(tags)].slice(0, 3);
}

// 평형별 데이터가 있으면 보증금·월세 min~max 범위 (M3 — "800만 ~ 2,100만원" 형식).
// rows 의 금액은 원 단위 → 만원 변환. 값이 하나뿐이거나 min==max 면 null(단일가 표시).
function priceRange(item: Listing): { dep: [number, number] | null; rent: [number, number] | null } | null {
  // 추출 단계에서 채운 유형별 범위(만원) 우선 — 커버리지 넓음.
  if (item.depositRange || item.rentRange) {
    return { dep: item.depositRange ?? null, rent: item.rentRange ?? null };
  }
  const rows = (item.complexes ?? []).flatMap((c) => c.rows ?? []);
  if (rows.length < 2) return null;
  // 타당성 가드 — 추출 오류로 자릿수 합쳐진 비현실적 값 제외 (보증금≤200억·월세≤500만, 만원 단위)
  const deps = rows.map((r) => r.deposit).filter((d): d is number => d != null && d > 0).map((d) => Math.round(d / 10000)).filter((d) => d <= 2_000_000);
  const rents = rows.map((r) => r.rent).filter((r): r is number => r != null && r > 0).map((r) => Math.round(r / 10000)).filter((r) => r <= 500);
  const range = (ns: number[]): [number, number] | null => {
    if (ns.length < 2) return null;
    const lo = Math.min(...ns), hi = Math.max(...ns);
    return lo === hi ? null : [lo, hi];
  };
  const dep = range(deps), rentR = range(rents);
  if (!dep && !rentR) return null;
  return { dep, rent: rentR };
}

function priceText(item: Listing) {
  const isJeonse = item.type === "jeonse" || /전세/.test(item.title ?? "");
  const depositLabel = isJeonse ? "전세보증금" : "보증금";
  if (item.type === "sale") {
    if (item.salePriceManwon && item.salePriceManwon > 0) {
      const isResale = /매각|분양전환/.test(item.title ?? "");
      return <strong>{isResale ? "매매가" : "분양가"} {formatManwon(item.salePriceManwon)}</strong>;
    }
    return <span style={{ color: "var(--seed-semantic-color-ink-text-low)" }}>분양가 공고문 확인</span>;
  }
  // 평형별 범위가 있으면 범위 우선 (M3)
  const ranges = priceRange(item);
  if (ranges) {
    return (
      <>
        <strong>
          {depositLabel} {ranges.dep ? `${formatManwon(ranges.dep[0])}~${formatManwon(ranges.dep[1])}` : formatManwon(item.deposit) || "공고문 확인"}
        </strong>
        {(ranges.rent || item.rent > 0) && (
          <>
            <span className="sep">·</span>
            <span>월세 {ranges.rent ? `${ranges.rent[0]}~${ranges.rent[1]}만` : `${item.rent}만`}</span>
          </>
        )}
      </>
    );
  }
  // 월세 — 보증금 + 월세
  if (item.rent > 0) {
    return (
      <>
        <strong>{depositLabel} {formatManwon(item.deposit) || "공고문 확인"}</strong>
        <span className="sep">·</span>
        <span>월세 {item.rent}만</span>
      </>
    );
  }
  // 전세 — 보증금만 (월세 없음)
  if (item.deposit > 0) {
    return <strong>{depositLabel} {formatManwon(item.deposit)}</strong>;
  }
  return <span style={{ color: "var(--seed-semantic-color-ink-text-low)" }}>임대조건 공고문 확인</span>;
}

export function ListingCard({
  item,
  hovered,
  selected,
  onHover,
  onClick,
}: {
  item: Listing;
  hovered: boolean;
  selected: boolean;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
}) {
  const photo = item.coverPhotoUrl;
  const effStatus = effectiveStatus(item.status, item.deadline, item.beginDate);
  // dDayText 가 raw status 기반이라 effStatus 로 보정된 매물에선 잘못된 라벨 반환 — effStatus 로 호출.
  const dday = dDayText(item.deadline, effStatus);
  // statusLabel — effStatus 우선. raw status 가 "open" 이지만 마감 지났으면 effStatus=closed → "마감".
  const statusLabel =
    effStatus === "closed" ? (dday || "마감")
    : effStatus === "closing" ? (dday || "마감임박")
    : effStatus === "upcoming" ? "모집 예정"
    : (dday || "수시모집");
  const tiers = tierTags(item);
  return (
    <article
      className={`card ${hovered ? "hovered" : ""} ${selected ? "selected" : ""} ${effStatus === "closed" ? "is-closed" : ""}`}
      onMouseEnter={() => onHover(item.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(item.id)}
    >
      <div className="card-body">
        <div className="card-type-row">
          {typeBadge(item.type, item)}
          <AgencyBadge agency={item.agency} />
        </div>
        {/* M3: 단지명 우선 — 공고명 전체는 상세에서 */}
        <div className="card-title">{item.complexName || item.title}</div>
        <div className="card-price">{priceText(item)}</div>
        <div className="card-meta">
          {item.area && (
            <>
              {item.area}
              <span className="dot">·</span>
            </>
          )}
          {item.district}
          {item.buildingType && (
            <>
              <span className="dot">·</span>
              {item.buildingType}
            </>
          )}
          {typeof item.supplyUnits === "number" && item.supplyUnits > 0 && (
            <>
              <span className="dot">·</span>
              모집 {item.supplyUnits}세대
            </>
          )}
          {item.winnerAt && /^\d{4}[.\-]\d{2}[.\-]\d{2}/.test(item.winnerAt) && (
            <>
              <span className="dot">·</span>
              당첨발표 {item.winnerAt.replace(/-/g, ".").slice(5)}
            </>
          )}
        </div>
        <div className="card-foot">
          {/* M3: 대상 계층 태그 (있을 때) — 없으면 유형별 요약 fallback */}
          {tiers.length > 0 ? (
            <span className="eligibility">{tiers.map((t) => `#${t}`).join(" ")}</span>
          ) : (
            <span className="eligibility">{eligibilitySummaryByType(item.type)}</span>
          )}
          {item.competition != null && (
            <>
              <span style={{ color: "var(--seed-scale-color-gray-400)" }}>·</span>
              <span>전년 경쟁률 {item.competition}:1</span>
            </>
          )}
        </div>
      </div>
      <aside className="card-side">
        {statusLabel && <span className={`status-chip ${effStatus}`}>{statusLabel}</span>}
        {photo && (
          <div className="card-thumb">
            {/* next/image 가 mtime 변경된 파일을 인식 못해 옛 조감도가 캐시돼서 보이는 문제. detail 과 통일. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo}
              alt={item.title}
              width={72}
              height={72}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          </div>
        )}
      </aside>
    </article>
  );
}

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "recent", label: "최신순" },
  { id: "deadline", label: "마감임박" },
  { id: "low-rent", label: "월세 낮은순" },
  { id: "low-depo", label: "보증금 낮은순" },
];

// 모바일 바텀시트 — hidden(지도 풀스크린) ↔ expanded(매물 list) 토글.
// snap 은 부모(AppShell) 에서 컨트롤 — "이 지역 검색" 같은 외부 트리거와 floating 버튼 공유.
type SheetSnap = "hidden" | "expanded";

export function ListingPanel({
  items,
  sort,
  setSort,
  hoveredId,
  selectedId,
  activeDistrict,
  onHover,
  onSelect,
  snap = "hidden",
  setSnap,
  query = "",
  onQueryChange,
}: {
  items: Listing[];
  sort: SortKey;
  setSort: (s: SortKey) => void;
  hoveredId: string | null;
  selectedId: string | null;
  activeDistrict: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  snap?: SheetSnap;
  setSnap?: (s: SheetSnap) => void;
  query?: string;
  onQueryChange?: (q: string) => void;
}) {
  const [loadedCount, setLoadedCount] = useState(20);
  const itemsRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const closeSheet = () => setSnap?.("hidden");

  useEffect(() => {
    setLoadedCount(20);
    if (itemsRef.current) itemsRef.current.scrollTop = 0;
  }, [items.length, activeDistrict]);

  // 무한스크롤 — 센티넬이 (300px 안에) 보이면 자동으로 다음 배치 로드.
  // 스크롤 이벤트 의존 X → 화면을 안 넘쳐도 안 멈춤. 로드는 클라이언트 slice 라 즉시.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || loadedCount >= items.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setLoadedCount((c) => Math.min(c + 24, items.length));
      },
      // root=null(뷰포트) — 데스크톱은 페이지 스크롤, 모바일은 시트 스크롤 둘 다 대응.
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadedCount, items.length]);

  const visible = items.slice(0, loadedCount);

  return (
    <div className={`listing sheet-${snap}`} data-snap={snap}>
      <button
        type="button"
        className="listing-handle"
        onClick={closeSheet}
        aria-label="매물 목록 닫기"
        aria-expanded={snap === "expanded"}
      />
      {onQueryChange && (
        <div className="listing-search">
          <MdOutlineSearch className="listing-search-ico" />
          <input
            type="text"
            className="listing-search-input"
            placeholder="단지명·지역으로 검색"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
          {query && (
            <button type="button" className="listing-search-clear" onClick={() => onQueryChange("")} aria-label="검색어 지우기">
              <MdClose />
            </button>
          )}
        </div>
      )}
      <div className="listing-head">
        <div className="listing-count">
          총 <em>{items.length.toLocaleString()}</em>개의 공공임대 매물
        </div>
        <div className="listing-sort">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={`sort-chip ${sort === opt.id ? "active" : ""}`}
              onClick={() => setSort(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="listing-items" ref={itemsRef}>
        {visible.length === 0 && (
          <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--seed-semantic-color-ink-text-low)" }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>조건에 맞는 매물이 없어요</div>
            <div style={{ fontSize: 12 }}>필터를 조정하거나 지도에서 다른 구를 눌러보세요.</div>
          </div>
        )}
        {visible.map((item) => (
          <ListingCard
            key={item.id}
            item={item}
            hovered={hoveredId === item.id}
            selected={selectedId === item.id}
            onHover={onHover}
            onClick={onSelect}
          />
        ))}
        {loadedCount < items.length && (
          <div className="scroll-sentinel" ref={sentinelRef}>
            <div
              className="spinner"
              style={{
                width: 20,
                height: 20,
                margin: "0 auto 8px",
                border: "2px solid var(--seed-scale-color-gray-200)",
                borderTopColor: "var(--seed-semantic-color-primary)",
                borderRadius: "50%",
                animation: "spin .8s linear infinite",
              }}
            />
            더 불러오는 중…
          </div>
        )}
        {loadedCount >= items.length && items.length > 0 && (
          <div className="scroll-sentinel">· 모든 매물을 확인했어요 ·</div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
