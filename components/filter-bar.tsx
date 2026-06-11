"use client";

import { useEffect, useRef, useState } from "react";
import type { FilterKey, Filters } from "@/lib/types";
import { ChevronIcon } from "./icons";

type FilterOption = { value: string; label: string };
type FilterConfigEntry = { label: string; options: FilterOption[] };

export const FILTER_CONFIG: Record<FilterKey, FilterConfigEntry> = {
  type: {
    label: "공급 유형",
    options: [
      { value: "happy", label: "행복주택" },
      { value: "nation", label: "국민임대" },
      { value: "perm", label: "영구임대" },
      { value: "buy", label: "매입임대" },
      { value: "jeonse", label: "전세임대" },
      { value: "fifty", label: "50년임대" },
      { value: "sale", label: "공공분양" },
    ],
  },
  status: {
    label: "모집 상태",
    options: [
      { value: "open", label: "모집중" },
      { value: "closing", label: "마감임박" },
      { value: "upcoming", label: "모집예정" },
      { value: "closed", label: "마감" },
    ],
  },
  agency: {
    label: "공급기관",
    options: [
      { value: "LH", label: "LH" },
      { value: "SH", label: "SH (서울)" },
    ],
  },
};

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
  const config = FILTER_CONFIG[filterKey];
  const ref = useRef<HTMLDivElement>(null);

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
    <div ref={ref} className="filter-popover">
      <ul className="filter-grid">
        {config.options.map((opt) => {
          const active = selected.includes(opt.value);
          return (
            <li key={opt.value}>
              <button
                type="button"
                className={`filter-box ${active ? "is-selected" : ""}`}
                aria-pressed={active}
                onClick={() => toggle(opt.value)}
              >
                {active ? <b>{opt.label}</b> : opt.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function FilterBar({
  filters,
  setFilters,
  onReset,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  onReset: () => void;
}) {
  const [openKey, setOpenKey] = useState<FilterKey | null>(null);
  const keys = Object.keys(FILTER_CONFIG) as FilterKey[];
  const totalSelected = Object.values(filters).reduce((a, arr) => a + arr.length, 0);
  const isAll = totalSelected === 0;

  return (
    <div className="filterbar">
      <div className="filterbar-chips">
        <button
          className={`filter-chip filter-chip-all ${isAll ? "active" : ""}`}
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
            <div key={key} className="filterbar-chip-wrap">
              <button
                className={`filter-chip ${active ? "active" : ""} ${isOpen ? "open" : ""}`}
                onClick={() => setOpenKey(isOpen ? null : key)}
              >
                {FILTER_CONFIG[key].label}
                {active && <span className="filter-chip-count">{sel.length}</span>}
                <ChevronIcon size={10} dir={isOpen ? "up" : "down"} />
              </button>
              {isOpen && (
                <FilterPopover
                  filterKey={key}
                  selected={sel}
                  onChange={(next) => setFilters({ ...filters, [key]: next })}
                  onClose={() => setOpenKey(null)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
