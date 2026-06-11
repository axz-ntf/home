import { LH_ADMIN_LISTINGS, listingIssues } from "@/lib/lh-adapter";
import { OVERRIDES } from "@/lib/manual-overrides";
import { effectiveStatus } from "@/lib/dday";
import { getAdminUser } from "@/lib/admin-user";
import Dashboard, { type DashboardRow } from "./dashboard";
import syncMeta from "@/lib/_sync-meta.json";
import extractDrafts from "@/lib/extract-drafts.json";

// 어드민 대시보드 — 모든 공고를 한 곳에서 보고 상태/검수여부로 필터.
// 데이터는 서버에서 빌드 시점에 로드 (LH_ADMIN_LISTINGS), 필터링은 클라이언트.
export default function AdminDashboardPage() {
  const rows: DashboardRow[] = LH_ADMIN_LISTINGS.map((l) => {
    const supply = typeof l.supplyUnits === "number" ? l.supplyUnits : l.supplyUnits == null ? null : Number(l.supplyUnits);
    // 마감임박(closing)은 raw 데이터에 없고 deadline 기반 derived — 메인 앱이 쓰는 effectiveStatus 동일 적용.
    const derivedStatus = effectiveStatus(l.status, l.deadline ?? "", l.beginDate);
    return {
      id: l.id,
      pblancId: l.pblancId,
      title: l.title,
      district: l.district,
      type: l.type,
      agency: l.agency,
      suplyTyNm: l.suplyTyNm ?? "",
      status: derivedStatus,
      noticeStatus: l.noticeStatus ?? "",
      progressStatus: l.progressStatus ?? "",
      deadline: l.deadline ?? "",
      beginDate: l.beginDate ?? "",
      announceDate: l.announceDate ?? "",
      supplyUnits: Number.isFinite(supply as number) ? (supply as number) : null,
      deposit: l.deposit ?? 0,
      rent: l.rent ?? 0,
      salePriceManwon: l.salePriceManwon ?? null,
      sourceUrl: l.sourceUrl ?? "",
      reviewed: l.id in OVERRIDES,
      issues: listingIssues(l),
      needsReview: listingIssues(l).length > 0,
      hasDraft: l.id in extractDrafts,
      note: OVERRIDES[l.id]?._note ?? "",
    };
  });

  return <Dashboard rows={rows} user={getAdminUser()} syncMeta={syncMeta} />;
}
