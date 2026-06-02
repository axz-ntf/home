"use client";

import { useEffect, useRef, useState } from "react";
import type { Listing, SortKey } from "@/lib/types";
import { eligibilitySummaryByType, HOUSING_TYPES } from "@/lib/mock-data";
import { dDayText, effectiveStatus } from "@/lib/dday";
import { formatManwon } from "@/lib/format";

function typeBadge(type: Listing["type"]) {
  const t = HOUSING_TYPES.find((x) => x.id === type);
  if (!t) return null;
  return <span className={`badge ${t.badge}`}>{t.name}</span>;
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

function ListingCard({
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
    effStatus === "closed" ? "마감"
    : effStatus === "closing" ? (dday || "마감임박")
    : effStatus === "upcoming" ? "모집 예정"
    : (dday || "수시모집");
  return (
    <article
      className={`card ${hovered ? "hovered" : ""} ${selected ? "selected" : ""}`}
      onMouseEnter={() => onHover(item.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(item.id)}
    >
      <div className="card-body">
        <div className="card-type-row">
          {typeBadge(item.type)}
          <span className="badge agency">{item.agency}</span>
        </div>
        <div className="card-title">{item.title}</div>
        <div className="card-price">{priceText(item)}</div>
        <div className="card-meta">
          {item.area && (
            <>
              {item.area}
              <span className="dot">·</span>
            </>
          )}
          {item.district}
          {typeof item.supplyUnits === "number" && item.supplyUnits > 0 && (
            <>
              <span className="dot">·</span>
              모집 {item.supplyUnits}세대
            </>
          )}
        </div>
        <div className="card-foot">
          <span className="eligibility">{eligibilitySummaryByType(item.type)}</span>
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
}) {
  const [loadedCount, setLoadedCount] = useState(15);
  const itemsRef = useRef<HTMLDivElement>(null);

  const closeSheet = () => setSnap?.("hidden");

  useEffect(() => {
    setLoadedCount(15);
    if (itemsRef.current) itemsRef.current.scrollTop = 0;
  }, [items.length, activeDistrict]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      setLoadedCount((c) => Math.min(c + 10, items.length));
    }
  };

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
      <div className="listing-items" ref={itemsRef} onScroll={handleScroll}>
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
          <div className="scroll-sentinel">
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
