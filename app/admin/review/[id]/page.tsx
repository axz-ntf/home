import { LH_ADMIN_LISTINGS, listingIssues } from "@/lib/lh-adapter";
import { OVERRIDES, type OverrideRow } from "@/lib/manual-overrides";
import { notFound } from "next/navigation";
import Link from "next/link";
import ReviewForm from "./review-form";
import AdminShell, { type NavItem } from "../../admin-shell";
import { AIcon } from "../../icons";
import { getAdminUser } from "@/lib/admin-user";
import rawApiListings from "@/lib/listings-api.json";
import shMapped from "@/lib/sh-mapped.json";
import mappedRegional from "@/lib/mapped-regional.json";
import MappedPointsEditor, { type MappedPoint } from "./mapped-points-editor";
import { youthDirectoryInfo } from "@/lib/youth-adapter";
import extractDrafts from "@/lib/extract-drafts.json";
import floorplanSpecs from "@/lib/floorplan-specs.json";
import FloorplanEditor from "./floorplan-editor";
import type { FloorPlanSpec } from "@/lib/floorplan-spec";

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
  const listing = LH_ADMIN_LISTINGS.find((l) => l.id === decodedId);
  if (!listing) notFound();

  const override = OVERRIDES[decodedId] ?? null;
  const raw = listing.pblancId ? RAW_API_BY_PANID.get(listing.pblancId) : undefined;

  // 다지점 분리 핀 (P1) — SH 는 부모 공고(sh-{seq})에서, LH 는 분리 핀(-mN) 페이지에서 접근.
  const shSeq = decodedId.match(/^sh-(\d+)/)?.[1];
  const shCfg = shSeq ? (shMapped as Record<string, { points: MappedPoint[] }>)[shSeq] : undefined;
  const lhCfg = !shCfg && listing.pblancId
    ? (mappedRegional as Record<string, { points: MappedPoint[] }>)[listing.pblancId]
    : undefined;
  const mapped = shCfg
    ? { file: "sh" as const, key: shSeq as string, points: shCfg.points }
    : lhCfg
      ? { file: "lh" as const, key: listing.pblancId as string, points: lhCfg.points }
      : null;
  const pinIdx = decodedId.match(/-m(\d+)$/)?.[1];

  // 청년안심 소스 대조 (P3) — 공식 단지 디렉토리 vs 현재(override 반영) 값.
  // soco 오입력(보↔월 뒤바뀜 등)·검수 드리프트를 비교로 잡는다. 불일치 행 하이라이트.
  const dir = decodedId.startsWith("youth-") ? youthDirectoryInfo(listing.title) : null;
  const dirRows = dir
    ? ([
        ["보증금(만)", dir.depositManwon || "—", listing.deposit || "—"],
        ["월세(만)", dir.rentManwon || "—", listing.rent || "—"],
        ["세대수", dir.totalUnits ?? "—", listing.totalUnits ?? "—"],
        ["자치구", dir.gu || "—", listing.district || "—"],
        ["주소", dir.address || "—", listing.address.replace(/^서울\s*/, "") || "—"],
        ["역세권", dir.subway || "—", listing.transit || "—"],
      ] as const).map(([label, official, current]) => ({
        label,
        official: String(official),
        current: String(current),
        mismatch: String(official) !== String(current),
      }))
    : null;

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

  // 검수 큐 — 미검수 + 품질 이슈 보유 (마감 매물 제외). 대시보드 큐와 같은 기준 (P2).
  const queue = LH_ADMIN_LISTINGS.filter((l) => {
    if (l.id in OVERRIDES) return false;
    return listingIssues(l).length > 0;
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
          {listing.agency} 공고 페이지 열기 <AIcon.External />
        </a>
      )}

      <FloorplanEditor
        listingId={decodedId}
        initialSpec={(floorplanSpecs as Record<string, FloorPlanSpec>)[decodedId] ?? null}
      />

      {dirRows && (
        <section style={{ margin: "14px 0 4px", padding: "12px 14px", border: "1px solid var(--a-line)", borderRadius: 10, background: "var(--a-bg-2)" }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
            공식 단지 디렉토리 대조 <span style={{ fontWeight: 500, color: "var(--a-ink-3)", fontSize: 12 }}>(soco 단지정보 vs 현재 표시값 — 다르면 강조)</span>
          </div>
          <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%" }}>
            <thead>
              <tr style={{ color: "var(--a-ink-3)", textAlign: "left" }}>
                <th style={{ padding: "2px 8px 2px 0" }}></th>
                <th style={{ padding: "2px 8px" }}>디렉토리(공식)</th>
                <th style={{ padding: "2px 8px" }}>현재값</th>
              </tr>
            </thead>
            <tbody>
              {dirRows.map((r) => (
                <tr key={r.label} style={r.mismatch ? { background: "var(--a-yellow-low, #fff7e0)" } : undefined}>
                  <td style={{ padding: "3px 8px 3px 0", fontWeight: 700, color: "var(--a-ink-2)", whiteSpace: "nowrap" }}>{r.label}</td>
                  <td style={{ padding: "3px 8px" }}>{r.official}</td>
                  <td style={{ padding: "3px 8px", fontWeight: r.mismatch ? 800 : 400 }}>{r.current}{r.mismatch ? " ⚠" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {decodedId.startsWith("youth-") && !dirRows && (
        <p style={{ fontSize: 12.5, color: "var(--a-ink-3)", margin: "10px 0 0" }}>
          공식 단지 디렉토리에 매칭되는 단지가 없습니다 (만실로 내려간 단지 추정) — 공고문 기준으로 검수하세요.
        </p>
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
        sourceUrl={listing.sourceUrl ?? null}
        canAutoExtract={!(listing.id.startsWith("sh-") && !listing.noticePdfUrl)}
        draft={(extractDrafts as Record<string, { at: string; fields: unknown }>)[decodedId] ?? null}
      />

      {mapped && (
        <MappedPointsEditor
          file={mapped.file}
          mappedKey={mapped.key}
          initialPoints={mapped.points}
          currentPinIndex={pinIdx != null ? Number(pinIdx) : null}
        />
      )}
    </AdminShell>
  );
}
