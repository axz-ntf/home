"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Listing } from "@/lib/types";
import { useSavedListings } from "@/lib/use-saved";
import { ListingCard } from "@/components/listing-panel";
import { effectiveStatus } from "@/lib/dday";
import { DdsIcon } from "@/components/dds-icon";
import "./saved.css";

const subscribeHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

// 저장한 공고 모아보기 (N1) — 마감돼도 유지(마감 상태로 표시, 뒤로 정렬).
export function SavedClient({ listings, onCompare }: { listings: Listing[]; onCompare?: () => void }) {
  const router = useRouter();
  const { savedIds, toggle } = useSavedListings();
  const loaded = useSyncExternalStore(subscribeHydration, clientReady, serverReady);

  const byId = new Map(listings.map((l) => [l.id, l]));
  const saved = savedIds.map((id) => byId.get(id)).filter((l): l is Listing => Boolean(l));
  // active 먼저, 마감 뒤로 (저장 순서는 그룹 내 유지)
  saved.sort((a, b) =>
    Number(effectiveStatus(a.status, a.deadline, a.beginDate) === "closed") -
    Number(effectiveStatus(b.status, b.deadline, b.beginDate) === "closed"),
  );
  const missing = loaded ? savedIds.length - saved.length : 0;

  return (
    <main className="saved-page">
      <header className="saved-page-heading">
        <h1>저장한 공고</h1>
        <span className="saved-count">
          {loaded ? `${saved.length}건` : ""}
        </span>
        <Link href="/" className="saved-map-link">
          지도로 <DdsIcon name="arrow-right" size={16} />
        </Link>
      </header>

      <button type="button" className="saved-compare-entry" onClick={() => onCompare ? onCompare() : router.push("/compare")}>
        <span>공고 비교</span><span>{saved.length ? `저장한 공고 ${saved.length}건 비교하기` : "비교 기능 둘러보기"} <DdsIcon name="arrow-right" size={16} /></span>
      </button>

      {loaded && saved.length === 0 && (
        <div className="saved-empty">
          <DdsIcon name="like" size={32} />
          <strong>아직 저장한 공고가 없어요.</strong>
          <p>공고 상세에서 관심 저장을 누르면 여기에 모여요.</p>
        </div>
      )}

      <div>
        {saved.map((item) => (
          // 해제 버튼을 카드와 분리된 우측 열로 — 카드 내부 칩/썸네일과 안 겹침.
          <div key={item.id} style={{ display: "flex", alignItems: "stretch" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <ListingCard
                item={item}
                hovered={false}
                selected={false}
                onHover={() => {}}
                onClick={(id) => router.push(`/listings/${encodeURIComponent(id)}`)}
              />
            </div>
            <button
              type="button"
              aria-label={`${item.complexName || item.title} 저장 해제`}
              title="저장 해제"
              onClick={() => toggle(item.id)}
              className="saved-remove-btn"
            >
              <DdsIcon name="close" size={20} />
            </button>
          </div>
        ))}
      </div>

      {missing > 0 && (
        <p className="saved-missing">
          저장했던 공고 {missing}건은 게시가 내려가 더 이상 표시할 수 없어요.
        </p>
      )}
    </main>
  );
}
