import { LH_LISTINGS } from "@/lib/lh-adapter";
import { OVERRIDES, type OverrideRow } from "@/lib/manual-overrides";
import { notFound } from "next/navigation";
import Link from "next/link";
import ReviewForm from "./review-form";
import AdminShell, { type NavItem } from "../../admin-shell";
import { AIcon } from "../../icons";
import { getAdminUser } from "@/lib/admin-user";
import rawApiListings from "@/lib/listings-api.json";

interface RawApiListing {
  pblancId: string;
  houseType?: unknown;
  heatMethod?: unknown;
  parkngCo?: number | null;
  complexName?: string | null;
  address?: string;
  pnu?: string | null;
  coverPhotoUrl?: string | null;
}
const RAW_API_BY_PANID = new Map<string, RawApiListing>();
for (const r of rawApiListings as RawApiListing[]) {
  if (r?.pblancId) RAW_API_BY_PANID.set(String(r.pblancId), r);
}

const TYPE_LABEL: Record<string, string> = {
  happy: "행복주택", nation: "국민임대", integ: "통합공공임대", perm: "영구임대",
  buy: "매입임대", jeonse: "전세임대", fifty: "50년임대", sale: "분양",
};

export default async function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  const listing = LH_LISTINGS.find((l) => l.id === decodedId);
  if (!listing) notFound();

  const override = OVERRIDES[decodedId] ?? null;
  const raw = listing.pblancId ? RAW_API_BY_PANID.get(listing.pblancId) : undefined;

  // listing.complexes[0].rows 에서 RowDraft 초기값 derive (단위 변환: 원 → 만원)
  const complexRows = listing.complexes?.[0]?.rows ?? [];
  const initialRows: OverrideRow[] = complexRows.map((r) => ({
    houseType: r.houseType ?? "",
    area: r.area ? `${r.area}㎡` : "",
    supplyUnits: r.supplyTotal ?? r.supplyThisRound ?? null,
    deposit: r.deposit != null ? Math.round(r.deposit / 10000) : null, // 원 → 만원
    rent: r.rent != null ? Math.round(r.rent / 10000) : null,
    salePriceManwon: null, // sale 매물은 별도 (rows 안에 salePrice 없을 수도)
  }));

  // 검수 큐 — 미검수 + supplyUnits 의심값.
  const queue = LH_LISTINGS.filter((l) => {
    if (l.id in OVERRIDES) return false;
    return l.supplyUnits == null || l.supplyUnits === 1;
  });
  const needsReview = queue.length;

  // 현재 매물이 큐 안에 있으면 다음 매물 id 계산 (없으면 첫 매물).
  const currentIdx = queue.findIndex((l) => l.id === decodedId);
  const nextInQueue = currentIdx >= 0 && currentIdx + 1 < queue.length
    ? queue[currentIdx + 1]
    : (currentIdx < 0 && queue.length > 0 ? queue[0] : null);
  const nextHref = nextInQueue ? `/admin/review/${encodeURIComponent(nextInQueue.id)}` : null;

  const navItems: NavItem[] = [
    { href: "/admin/review", label: "대시보드", icon: "dash" },
    { href: "/admin/review?filter=review", label: "검수 큐", icon: "listing", badge: needsReview, badgeKind: "danger" },
    { href: "/admin/activity", label: "검수 내역", icon: "history", badge: Object.keys(OVERRIDES).length, badgeKind: "subtle" },
    { href: "/admin/complexes", label: "단지 관리", icon: "building" },
    { href: "/admin/settings", label: "설정", icon: "settings" },
  ];

  return (
    <AdminShell
      pageTitle="공고 검수"
      pageSub={currentIdx >= 0 ? `검수 큐 ${currentIdx + 1} / ${queue.length}` : "단일 매물 정정"}
      navItems={navItems}
      user={getAdminUser()}
    >
      <Link href="/admin/review" className="a-detail-back">
        <AIcon.ChevronL /> 대시보드로
      </Link>

      <h1 className="a-detail-title">{listing.title}</h1>
      <div className="a-detail-meta">
        <span style={{ fontFamily: "ui-monospace, monospace" }}>{listing.pblancId}</span>
        <span className="sep">·</span>
        <span>{listing.district}</span>
        <span className="sep">·</span>
        <span>{TYPE_LABEL[listing.type] ?? listing.type}</span>
      </div>

      {listing.sourceUrl && (
        <a href={listing.sourceUrl} target="_blank" rel="noreferrer" className="a-pdf-btn">
          LH 공고 페이지 열기 <AIcon.External />
        </a>
      )}

      <ReviewForm
        id={listing.id}
        type={listing.type}
        current={{
          supplyUnits: listing.supplyUnits ?? null,
          deposit: listing.deposit ?? null,
          rent: listing.rent ?? null,
          salePriceManwon: listing.salePriceManwon ?? null,
          area: listing.area ?? "",
          status: listing.status,
          noticeStatus: listing.noticeStatus ?? "",
          progressStatus: listing.progressStatus ?? "",
          deadline: listing.deadline ?? "",
          announceDate: listing.announceDate ?? "",
        }}
        context={{
          complexName: raw?.complexName ?? null,
          address: raw?.address || listing.address || "",
          pnu: raw?.pnu ?? listing.pnu ?? null,
          houseType: typeof raw?.houseType === "string" ? raw.houseType : (listing.suplyTyNm ?? null),
          heatMethod: typeof raw?.heatMethod === "string" ? raw.heatMethod : (listing.heatMethod ?? null),
          parkngCo: raw?.parkngCo ?? null,
          coverPhotoUrl: listing.coverPhotoUrl ?? null,
          eligible: listing.eligible ?? [],
        }}
        override={override}
        nextHref={nextHref}
        queueIndex={currentIdx >= 0 ? { current: currentIdx + 1, total: queue.length } : null}
        initialRows={initialRows.length > 0 ? initialRows : null}
      />
    </AdminShell>
  );
}
