import { LH_ADMIN_LISTINGS, LH_LISTINGS, listingIssues } from "@/lib/lh-adapter";
import shMapped from "@/lib/sh-mapped.json";
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
      // 소스 — id 프리픽스로 구분 (lh-*/sh-*/youth-*). 어드민 소스 필터용.
      source: l.id.startsWith("sh-") ? "SH" : l.id.startsWith("youth-") ? "youth" : "LH",
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
      // SH 메가공고 부모 행 — 지도에선 단지별 핀으로 펼쳐짐 (어드민 1행 = PC N핀 안내)
      pinCount: (() => {
        const seq = l.id.match(/^sh-(\d+)$/)?.[1];
        return seq ? ((shMapped as Record<string, { points: unknown[] }>)[seq]?.points.length ?? null) : null;
      })(),
      // 검색 보조 — 공고에 등록된 핀(단지명·주소)도 검색에 잡히게. 제목엔 없는 단지명
      // ("당산센트럴아이파크" 등)으로도 그 공고를 찾을 수 있다.
      searchExtra: (() => {
        const seq = l.id.match(/^sh-(\d+)$/)?.[1];
        const pts = seq ? (shMapped as Record<string, { points: { label?: string; address?: string }[] }>)[seq]?.points : undefined;
        return pts ? pts.map((p) => `${p.label ?? ""} ${p.address ?? ""}`).join(" ") : "";
      })(),
      note: OVERRIDES[l.id]?._note ?? "",
    };
  });

  // 공고일 최신순 — SH 가 LH 뒤에 붙어 뒤 페이지로 밀리던 문제 해소(없으면 맨 뒤).
  rows.sort((a, b) => (b.announceDate || "0").localeCompare(a.announceDate || "0"));

  // 공개 지도 핀 단위 모집중(마감임박 포함) — 어드민 공고 수와 PC 핀 수가 다른 이유를 KPI 에 병기.
  const activePins = LH_LISTINGS.filter((l) =>
    ["open", "closing"].includes(effectiveStatus(l.status, l.deadline ?? "", l.beginDate)),
  ).length;

  return <Dashboard rows={rows} user={getAdminUser()} syncMeta={syncMeta} activePins={activePins} />;
}
