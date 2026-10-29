"use client";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { changedFields, DEFAULT_CONDITIONS, listingFingerprint, type HomeConditions, type ListingFingerprint } from "./home-discovery";
import type { Filters, Listing } from "./types";

// 원본 문자열이 동일하면 동일 스냅샷을 반환해 hydration과 재렌더를 안정화한다.
function store<T>(key: string, fallback: T, validate: (v: unknown) => T, persistent = true) {
  let raw: string | null = null, value = fallback;
  let memoryOnly = !persistent;
  const listeners = new Set<() => void>();
  const read = () => {
    if (memoryOnly) return value;
    try {
      const next = localStorage.getItem(key);
      if (next !== raw) { raw = next; value = next ? validate(JSON.parse(next)) : fallback; }
    } catch { /* 저장 제한 시 메모리 상태 유지 */ }
    return value;
  };
  return {
    read, server: () => fallback,
    subscribe(cb: () => void) {
      listeners.add(cb);
      const onStorage = (e: StorageEvent) => { if (e.key === key || e.key === null) cb(); };
      window.addEventListener("storage", onStorage);
      return () => { listeners.delete(cb); window.removeEventListener("storage", onStorage); };
    },
    write(next: T) {
      value = next;
      try { if (persistent) { raw = JSON.stringify(next); localStorage.setItem(key, raw); } }
      catch { memoryOnly = true; }
      listeners.forEach(l => l());
      return !memoryOnly;
    },
  };
}
function validateConditions(v: unknown): HomeConditions {
  const obj = v && typeof v === "object" ? v as Record<string, unknown> : {};
  const amount = (key: string) => typeof obj[key] === "string" && /^\d*(?:\.\d+)?$/.test(obj[key]) ? obj[key] as string : "";
  return { region: typeof obj.region === "string" ? obj.region : "", deposit: amount("deposit"), rent: amount("rent"), area: amount("area"), includeUnknown: obj.includeUnknown !== false };
}
const conditions = store<HomeConditions>("doongji:active-conditions", DEFAULT_CONDITIONS, validateConditions, false);
type SavedFilter = { conditions: HomeConditions; status: Filters["status"] };
const savedFilter = store<SavedFilter | null>("doongji:saved-filter:v2", null, v => {
  if (!v || typeof v !== "object" || !("conditions" in v) || !("status" in v)) return null;
  return { conditions: validateConditions(v.conditions), status: Array.isArray(v.status) ? v.status.filter((x): x is Filters["status"][number] => ["open", "closing", "upcoming", "closed"].includes(x)) : [] };
});
export function useSavedHomeFilter() {
  return [useSyncExternalStore(savedFilter.subscribe, savedFilter.read, savedFilter.server), savedFilter.write] as const;
}
const selection = store<string[]>("doongji:compare:v1", [], v => Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string"))].slice(0, 3) : []);
export function useHomeConditions() {
  return [useSyncExternalStore(conditions.subscribe, conditions.read, conditions.server), conditions.write] as const;
}
export function useCompareSelection() {
  return [useSyncExternalStore(selection.subscribe, selection.read, selection.server), selection.write] as const;
}

type History = { at: string; items: Record<string, ListingFingerprint> };
const EMPTY: History = { at: "", items: {} };
let baseline: History | undefined;
const noop = () => () => {};
function readHistory() {
  if (!baseline) {
    try {
      const v = JSON.parse(localStorage.getItem("doongji:visit:v1") || "null");
      baseline = v && typeof v.at === "string" && v.items && typeof v.items === "object" ? v : EMPTY;
    } catch { baseline = EMPTY; }
  }
  return baseline!;
}
// 이번 방문 중에는 기준을 고정한다. 저장한 최신 스냅샷은 다음 방문에만 사용한다.
export function useListingChanges(listings: Listing[]) {
  const previous = useSyncExternalStore(noop, readHistory, () => EMPTY);
  const changes = useMemo(() => Object.fromEntries(listings.map(l => [l.id, changedFields(previous.items[l.id], l)])), [listings, previous]);
  useEffect(() => {
    readHistory();
    const history: History = { at: new Date().toISOString(), items: Object.fromEntries(listings.map(l => [l.id, listingFingerprint(l)])) };
    try { localStorage.setItem("doongji:visit:v1", JSON.stringify(history)); } catch { /* 선택 기능에 영향 없음 */ }
  }, [listings]);
  return { changes, previousVisit: previous.at };
}
