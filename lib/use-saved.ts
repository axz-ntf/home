"use client";

import { useEffect, useState, useCallback } from "react";

// 공고 저장(찜) — 비로그인 서비스라 localStorage (N1, 개선안1차).
// 마감돼도 목록에 유지: id 만 저장하고 표시 시점에 매물 데이터와 조인.
const KEY = "doongji:saved";

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function useSavedListings() {
  // hydration-safe: 서버 렌더 시 빈 배열 → 마운트 후 localStorage 로드.
  const [ids, setIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setIds(read());
    setLoaded(true);
    // 다른 탭/페이지에서의 변경 동기화
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setIds(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* quota 등 — 메모리 상태만 유지 */
      }
      return next;
    });
  }, []);

  const isSaved = useCallback((id: string) => ids.includes(id), [ids]);

  return { savedIds: ids, isSaved, toggle, loaded };
}
