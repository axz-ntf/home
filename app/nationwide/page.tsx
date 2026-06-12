import { LH_LISTINGS, LH_REGIONAL_LISTINGS } from "@/lib/lh-adapter";
import { effectiveStatus } from "@/lib/dday";
import type { Listing } from "@/lib/types";
import NationwideList, { type NationwideRow } from "./nationwide-list";

export const dynamic = "force-dynamic";

// 전체 공고 게시판 — 지도 매물(LH·SH·청년) + 전국(광역) 매물을 한 곳에.
// 공고 단위로 묶고(분리 핀 -mN 은 한 공고로), 활성만, 공고일 최신순.
export default function NationwidePage() {
  // 공고 키 — pblancId 우선, 없으면 분리 핀 suffix 제거한 id.
  const noticeKey = (l: Listing) => l.pblancId || l.id.replace(/-m\d+$/, "");

  const byNotice = new Map<string, Listing>();
  for (const l of [...LH_LISTINGS, ...LH_REGIONAL_LISTINGS]) {
    const status = effectiveStatus(l.status, l.deadline ?? "", l.beginDate);
    if (status === "closed") continue;
    const k = noticeKey(l);
    if (!byNotice.has(k)) byNotice.set(k, l);
  }

  const rows: NationwideRow[] = [...byNotice.values()]
    .map((l) => ({
      id: l.id,
      title: l.pblancNm || l.title,
      type: l.type,
      district: l.district,
      status: effectiveStatus(l.status, l.deadline ?? "", l.beginDate),
      deadline: l.deadline ?? "",
      announceDate: l.announceDate ?? l.beginDate ?? "",
      supplyUnits: typeof l.supplyUnits === "number" ? l.supplyUnits : null,
      deposit: l.deposit ?? 0,
      rent: l.rent ?? 0,
      salePriceManwon: l.salePriceManwon ?? null,
      area: l.area ?? "",
      eligible: l.eligible ?? [],
      sourceUrl: l.sourceUrl ?? "",
    }))
    // 공고일 최신순 (없으면 맨 뒤), 동일 날짜는 마감 임박 순.
    .sort((a, b) =>
      (b.announceDate || "0").localeCompare(a.announceDate || "0") ||
      (a.deadline || "9999").localeCompare(b.deadline || "9999"),
    );

  return <NationwideList rows={rows} />;
}
