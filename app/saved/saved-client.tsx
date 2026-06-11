"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Listing } from "@/lib/types";
import { useSavedListings } from "@/lib/use-saved";
import { ListingCard } from "@/components/listing-panel";
import { effectiveStatus } from "@/lib/dday";

// 저장한 공고 모아보기 (N1) — 마감돼도 유지(마감 상태로 표시, 뒤로 정렬).
export function SavedClient({ listings }: { listings: Listing[] }) {
  const router = useRouter();
  const { savedIds, toggle, loaded } = useSavedListings();

  const byId = new Map(listings.map((l) => [l.id, l]));
  const saved = savedIds.map((id) => byId.get(id)).filter((l): l is Listing => Boolean(l));
  // active 먼저, 마감 뒤로 (저장 순서는 그룹 내 유지)
  saved.sort((a, b) =>
    Number(effectiveStatus(a.status, a.deadline, a.beginDate) === "closed") -
    Number(effectiveStatus(b.status, b.deadline, b.beginDate) === "closed"),
  );
  const missing = loaded ? savedIds.length - saved.length : 0;

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "20px 0 60px" }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "0 16px 14px" }}>
        <h1 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>저장한 공고</h1>
        <span style={{ fontSize: 13, color: "var(--seed-semantic-color-ink-text-low)" }}>
          {loaded ? `${saved.length}건` : ""}
        </span>
        <Link href="/" style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: "var(--seed-semantic-color-primary)", textDecoration: "none" }}>
          지도로 →
        </Link>
      </header>

      {loaded && saved.length === 0 && (
        <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--seed-semantic-color-ink-text-low)", fontSize: 14, lineHeight: 1.7 }}>
          아직 저장한 공고가 없어요.
          <br />
          공고 상세에서 ♥ 를 누르면 여기에 모여요.
        </div>
      )}

      <div>
        {saved.map((item) => (
          <div key={item.id} style={{ position: "relative" }}>
            <ListingCard
              item={item}
              hovered={false}
              selected={false}
              onHover={() => {}}
              onClick={(id) => router.push(`/listings/${encodeURIComponent(id)}`)}
            />
            <button
              type="button"
              aria-label="저장 해제"
              onClick={(e) => { e.stopPropagation(); toggle(item.id); }}
              style={{
                position: "absolute", top: 10, right: 12,
                background: "none", border: "none", cursor: "pointer",
                fontSize: 16, color: "var(--seed-semantic-color-primary)", lineHeight: 1,
              }}
            >
              ♥
            </button>
          </div>
        ))}
      </div>

      {missing > 0 && (
        <p style={{ padding: "14px 16px", fontSize: 12, color: "var(--seed-semantic-color-ink-text-low)" }}>
          저장했던 공고 {missing}건은 게시가 내려가 더 이상 표시할 수 없어요.
        </p>
      )}
    </main>
  );
}
