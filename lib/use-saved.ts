"use client";

import { useCallback, useSyncExternalStore } from "react";

// 공고 저장(찜) — 비로그인 서비스라 localStorage (N1, 개선안1차).
// 마감돼도 목록에 유지: id 만 저장하고 표시 시점에 매물 데이터와 조인.
// useSyncExternalStore — SSR 은 빈 배열, 같은 탭 토글 + 다른 탭 storage 이벤트 모두 구독.
const KEY = "doongji:saved";
const EMPTY: string[] = [];

let cacheRaw: string | null = null;
let cacheArr: string[] = EMPTY;

function getSnapshot(): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    /* SSR/프라이버시 모드 */
  }
  if (raw === cacheRaw) return cacheArr; // 동일 원본이면 같은 참조 (무한 렌더 방지)
  cacheRaw = raw;
  try {
    const arr = raw ? JSON.parse(raw) : [];
    cacheArr = Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : EMPTY;
  } catch {
    cacheArr = EMPTY;
  }
  return cacheArr;
}

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useSavedListings() {
  const ids = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  const toggle = useCallback((id: string) => {
    const cur = getSnapshot();
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* quota 등 */
    }
    emit();
  }, []);

  const isSaved = useCallback((id: string) => ids.includes(id), [ids]);

  // loaded: SSR 스냅샷(EMPTY 참조)과 구분 — 클라 마운트 후엔 항상 true 가 되도록
  // getSnapshot 이 localStorage 접근 가능 여부로 판단.
  const loaded = typeof window !== "undefined";

  return { savedIds: ids, isSaved, toggle, loaded };
}
