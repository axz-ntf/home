"use client";

// 모바일 viewport(<768px) 에서만 보이는 상단 chrome.
// 데스크탑 트리는 그대로 두고 CSS @media 로 숨긴다.
// 디자인 시안: app/m/MobileV1.tsx — 같은 .m-* 클래스를 그대로 사용.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { District, Filters, FilterKey } from "@/lib/types";
import { FILTER_CONFIG } from "./filter-bar";

// ─── 필터 popover (모바일) ──────────────────────────────────────
function FilterPopover({
  filterKey,
  selected,
  onChange,
  onClose,
}: {
  filterKey: FilterKey;
  selected: string[];
  onChange: (next: string[]) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const config = FILTER_CONFIG[filterKey];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  const toggle = (v: string) => {
    if (selected.includes(v)) onChange(selected.filter((x) => x !== v));
    else onChange([...selected, v]);
  };

  return (
    <div ref={ref} className="m-fpop">
      <ul className="m-fpop-grid">
        {config.options.map((opt) => {
          const active = selected.includes(opt.value);
          return (
            <li key={opt.value}>
              <button
                type="button"
                className={`m-fpop-opt ${active ? "on" : ""}`}
                onClick={() => toggle(opt.value)}
              >
                {opt.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── 지역 선택 바텀시트 ─────────────────────────────────────────
function RegionSheet({
  districts,
  activeDistrict,
  districtCounts,
  onPick,
  onClear,
  onClose,
}: {
  districts: District[];
  activeDistrict: string | null;
  districtCounts: Record<string, number>;
  onPick: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;
  return createPortal(
    <>
      <div className="m-region-sheet-backdrop" onClick={onClose} />
      <div className="m-region-sheet" role="dialog" aria-label="지역 선택">
        <div className="m-region-sheet-handle" />
        <div className="m-region-sheet-head">
          <div className="m-region-sheet-title">지역 선택</div>
          <button className="m-region-sheet-close" onClick={onClose} aria-label="닫기">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M 4 4 L 12 12 M 12 4 L 4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="m-region-sheet-list">
          <button
            type="button"
            className={`m-region-sheet-item ${activeDistrict === null ? "on" : ""}`}
            onClick={onClear}
          >
            <span>전체 지역</span>
          </button>
          {districts.map((d) => {
            const count = districtCounts[d.id] ?? 0;
            return (
              <button
                key={d.id}
                type="button"
                className={`m-region-sheet-item ${activeDistrict === d.id ? "on" : ""}`}
                onClick={() => onPick(d.id)}
              >
                <span>{d.name}</span>
                <span className="m-region-sheet-count">{count.toLocaleString()}건</span>
              </button>
            );
          })}
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── 상단 (검색바 → 지역선택 + 필터칩) ──────────────────────────
function Top({
  regionLabel,
  districts,
  activeDistrict,
  districtCounts,
  onDistrictClick,
  onDistrictClear,
  filters,
  setFilters,
  onReset,
}: {
  regionLabel: string;
  districts: District[];
  activeDistrict: string | null;
  districtCounts: Record<string, number>;
  onDistrictClick: (id: string) => void;
  onDistrictClear: () => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
  onReset: () => void;
}) {
  const [openKey, setOpenKey] = useState<FilterKey | null>(null);
  const [regionOpen, setRegionOpen] = useState(false);
  const keys = Object.keys(FILTER_CONFIG) as FilterKey[];
  const totalSelected = Object.values(filters).reduce((a, arr) => a + arr.length, 0);
  // "전체 지역" default 면 placeholder 톤, 지역 선택 후엔 진한 톤
  const isRegionDefault = regionLabel === "전체 지역";

  return (
    <div className="app-m-top">
      <div className="m-topbar">
        <button
          type="button"
          className={`m-search ${isRegionDefault ? "is-placeholder" : ""}`}
          onClick={() => setRegionOpen(true)}
          aria-label="지역 선택"
        >
          <span className="m-search-icon" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M 7 1 C 4.5 1 2.5 3 2.5 5.5 C 2.5 8.5 7 13 7 13 C 7 13 11.5 8.5 11.5 5.5 C 11.5 3 9.5 1 7 1 Z"
                stroke="currentColor"
                strokeWidth="1.4"
                fill="none"
              />
              <circle cx="7" cy="5.5" r="1.4" fill="currentColor" />
            </svg>
          </span>
          <span className="s-text">{isRegionDefault ? "지역 선택" : regionLabel}</span>
          <svg className="m-search-arrow" width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path d="M 2 4 L 5 7 L 8 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div className="m-filterrow">
        <button
          className={`m-fchip ${totalSelected === 0 ? "on" : ""}`}
          onClick={() => {
            onReset();
            setOpenKey(null);
          }}
        >
          전체
        </button>
        {keys.map((key) => {
          const sel = filters[key] ?? [];
          const active = sel.length > 0;
          const isOpen = openKey === key;
          return (
            <button
              key={key}
              className={`m-fchip ${active || isOpen ? "on" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setOpenKey(isOpen ? null : key);
              }}
            >
              {FILTER_CONFIG[key].label}
              {active && <span className="m-fchip-count">{sel.length}</span>}
              <svg width="8" height="8" viewBox="0 0 8 8">
                <path
                  d="M 2 3 L 4 5 L 6 3"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          );
        })}
      </div>
      {openKey && (
        <FilterPopover
          filterKey={openKey}
          selected={filters[openKey] ?? []}
          onChange={(next) => setFilters({ ...filters, [openKey]: next })}
          onClose={() => setOpenKey(null)}
        />
      )}
      {regionOpen && (
        <RegionSheet
          districts={districts}
          activeDistrict={activeDistrict}
          districtCounts={districtCounts}
          onPick={(id) => {
            onDistrictClick(id);
            setRegionOpen(false);
          }}
          onClear={() => {
            onDistrictClear();
            setRegionOpen(false);
          }}
          onClose={() => setRegionOpen(false)}
        />
      )}
    </div>
  );
}

export const MobileChrome = { Top };
