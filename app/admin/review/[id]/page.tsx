import { DdsIcon } from "@/components/dds-icon";
import NoticeWorkspace from "./notice-workspace";
import { adminNav } from "@/lib/admin-nav";
import { LH_ADMIN_LISTINGS, getAdminListingById, listingIssues } from "@/lib/lh-adapter";
import { OVERRIDES, type OverrideRow } from "@/lib/manual-overrides";
import { notFound } from "next/navigation";
import ReviewForm from "./review-form";
import AdminShell from "../../admin-shell";
import { getAdminUser } from "@/lib/admin-user";
import rawApiListings from "@/lib/listings-api.json";
import shMapped from "@/lib/sh-mapped.json";
import mappedRegional from "@/lib/mapped-regional.json";
import MappedPointsEditor, { type MappedPoint } from "./mapped-points-editor";
import { youthDirectoryInfo } from "@/lib/youth-adapter";
import extractDrafts from "@/lib/extract-drafts.json";
import floorplanSpecs from "@/lib/floorplan-specs.json";
import FloorplanEditor from "./floorplan-editor";
import ReviewPreview from "./review-preview";
import { ReviewLiveProvider } from "./review-live";
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
  depositManwon?: number | null;
  monthlyRentManwon?: number | null;
  salePriceManwon?: number | null;
  supplyUnits?: number | null;
  lat?: number | null;
  lng?: number | null;
}

// 유형별 정상 보증금 상한 (lh-adapter PRICE_GUARD 와 동일 기준) — 이상값 감지용.
const DEPOSIT_GUARD: Record<string, number> = {
  happy: 10000, nation: 15000, perm: 5000, fifty: 20000, integ: 20000, buy: 30000, jeonse: 30000,
};
const RAW_API_BY_PANID = new Map<string, RawApiListing>();
for (const r of rawApiListings as RawApiListing[]) {
  if (r?.pblancId) RAW_API_BY_PANID.set(String(r.pblancId), r);
}

const TYPE_LABEL: Record<string, string> = {
  public: "공공임대", rental: "임대 · 유형 확인", happy: "행복주택", nation: "국민임대", integ: "통합공공임대", perm: "영구임대",
  buy: "매입임대", jeonse: "전세임대", fifty: "50년임대", sale: "분양", youth: "청년주택",
};

// 값이 문자열이면 같은 공고 페이지를 공유하는 대표 매물 id 별칭 (분리 핀)
function resolveFloorplanSpec(id: string): FloorPlanSpec | null {
  const specs = floorplanSpecs as Record<string, FloorPlanSpec | string>;
  const raw = specs[id];
  return (typeof raw === "string" ? (specs[raw] as FloorPlanSpec | undefined) : raw) ?? null;
}

export const dynamic = "force-dynamic";

export default async function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  const listing = getAdminListingById(decodedId);
  if (!listing) notFound();

  const override = OVERRIDES[decodedId] ?? null;
  const raw = listing.pblancId ? RAW_API_BY_PANID.get(listing.pblancId) : undefined;

  // 다지점 분리 핀 (P1) — SH 는 부모 공고(sh-{seq})에서, LH 는 분리 핀(-mN) 페이지에서 접근.
  const shSeq = decodedId.match(/^sh-(\d+)/)?.[1];
  const shCfg = shSeq ? (shMapped as Record<string, { points: MappedPoint[] }>)[shSeq] : undefined;
  const lhCfg = !shCfg && listing.pblancId
    ? (mappedRegional as Record<string, { points: MappedPoint[] }>)[listing.pblancId]
    : undefined;
  // SH 는 점이 0개여도 에디터를 띄운다 — 좌표 없는 산재형도 "주소검색"으로 핀을 추가할 수 있게.
  const mapped = shSeq
    ? { file: "sh" as const, key: shSeq, points: shCfg?.points ?? [] }
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

  // 현재 매물이 큐 안에 있으면 다음 매물 id 계산 (없으면 첫 매물).
  const currentIdx = queue.findIndex((l) => l.id === decodedId);
  const nextInQueue = currentIdx >= 0 && currentIdx + 1 < queue.length
    ? queue[currentIdx + 1]
    : (currentIdx < 0 && queue.length > 0 ? queue[0] : null);
  const nextHref = nextInQueue ? `/admin/review/${encodeURIComponent(nextInQueue.id)}` : null;

  // LH 원본 가격/세대수/주소 (raw listings-api) — 폼 diff 표시용.
  const isSaleType = listing.type === "sale";
  const original = {
    deposit: raw?.depositManwon ?? null,
    rent: raw?.monthlyRentManwon ?? null,
    salePriceManwon: raw?.salePriceManwon ?? null,
    supplyUnits: raw?.supplyUnits ?? null,
    address: raw?.address ?? null,
  };

  // 이상값 감지 — 상단 경고 바 + 미리보기 강조. 검수 필요 이유를 한눈에.
  // 가격 이슈는 따로 모아 임대 조건 섹션 헤더 배지로도 표시.
  const priceAnomalies: string[] = [];
  const guard = DEPOSIT_GUARD[listing.type];
  if (!isSaleType && listing.deposit && guard && listing.deposit < guard * 0.2) {
    priceAnomalies.push(`보증금 ${listing.deposit.toLocaleString()}만원 — ${TYPE_LABEL[listing.type] ?? listing.type} 치고 비정상적으로 낮음`);
  }
  if (!isSaleType && !listing.deposit && !listing.rent) priceAnomalies.push("보증금·월세 정보 없음");
  if (isSaleType && !listing.salePriceManwon) priceAnomalies.push("분양가 정보 없음");
  const anomalies: string[] = [...priceAnomalies];
  if (listing.supplyUnits === 1) anomalies.push("공급 세대수 1 — LH API 오류 가능(확인 필요)");
  const hasCoord = Number.isFinite(raw?.lat) && Number.isFinite(raw?.lng);
  if (!hasCoord && (!mapped || mapped.points.length === 0)) anomalies.push("좌표 없음 — 지도에 표시되지 않음");

  const navItems = adminNav();

  return (
    <AdminShell
      pageTitle="공고 관리"
      pageSub="원문 · 수집 정보 · AI 처리 상태"
      navItems={navItems}
      user={getAdminUser()}
    >
      <div className="a-detail-page nw-page">
      <NoticeWorkspace listing={listing} anomalies={anomalies} />
      <details className="nw-manual">
        <summary>직접 정보 수정 <span>필요한 경우에만 기존 편집 도구를 사용하세요</span></summary>
      <ReviewLiveProvider>
      <div className="a-review-layout">
        <div className="a-review-main">
      {dirRows && (
        <section style={{ margin: "12px 0 4px", padding: "12px 12px", border: "1px solid var(--a-line)", borderRadius: 8, background: "var(--a-bg-2)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
            공식 단지 디렉토리 대조 <span style={{ fontWeight: 600, color: "var(--a-ink-3)", fontSize: 14 }}>(soco 단지정보 vs 현재 표시값 — 다르면 강조)</span>
          </div>
          <table style={{ borderCollapse: "collapse", fontSize: 14, width: "100%" }}>
            <thead>
              <tr style={{ color: "var(--a-ink-3)", textAlign: "left" }}>
                <th style={{ padding: "0px 8px 0px 0" }}></th>
                <th style={{ padding: "0px 8px" }}>디렉토리(공식)</th>
                <th style={{ padding: "0px 8px" }}>현재값</th>
              </tr>
            </thead>
            <tbody>
              {dirRows.map((r) => (
                <tr key={r.label} style={r.mismatch ? { background: "var(--a-yellow-low)" } : undefined}>
                  <td style={{ padding: "4px 8px 4px 0", fontWeight: 700, color: "var(--a-ink-2)", whiteSpace: "nowrap" }}>{r.label}</td>
                  <td style={{ padding: "4px 8px" }}>{r.official}</td>
                  <td style={{ padding: "4px 8px", fontWeight: r.mismatch ? 800 : 400 }}>{r.current}{r.mismatch && <span role="img" aria-label="값 불일치"><DdsIcon name="exclamation" size={14} style={{ marginLeft: 4 }}/></span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {decodedId.startsWith("youth-") && !dirRows && (
        <p style={{ fontSize: 14, color: "var(--a-ink-3)", margin: "8px 0 0" }}>
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
        override={override}
        original={original}
        nextHref={nextHref}
        initialRows={initialRows.length > 0 ? initialRows : null}
        sourceUrl={listing.sourceUrl ?? null}
        canAutoExtract={!(listing.id.startsWith("sh-") && !listing.noticePdfUrl)}
        draft={(extractDrafts as Record<string, { at: string; fields: unknown }>)[decodedId] ?? null}
        priceIssue={priceAnomalies.length > 0}
        currentAddress={listing.address ?? ""}
      />

      {mapped && (
        <MappedPointsEditor
          file={mapped.file}
          mappedKey={mapped.key}
          initialPoints={mapped.points}
          currentPinIndex={pinIdx != null ? Number(pinIdx) : null}
        />
      )}

      {/* 평면도 3D — 보조 정보라 검수(가격·세대수·일정·좌표) 다음으로 배치. */}
      <FloorplanEditor
        listingId={decodedId}
        initialSpec={resolveFloorplanSpec(decodedId)}
      />
        </div>

        <ReviewPreview
          title={raw?.complexName || listing.title}
          typeLabel={TYPE_LABEL[listing.type] ?? listing.type}
          agency={listing.agency}
          district={listing.district}
          deposit={listing.deposit ?? null}
          rent={listing.rent ?? null}
          salePriceManwon={listing.salePriceManwon ?? null}
          supplyUnits={typeof listing.supplyUnits === "number" ? listing.supplyUnits : listing.supplyUnits ? Number(listing.supplyUnits) || null : null}
          area={listing.area ?? ""}
          isSale={isSaleType}
          rows={complexRows.map((r) => ({
            houseType: r.houseType ?? "",
            area: r.area ? `${r.area}㎡` : "",
            depositManwon: r.deposit != null ? Math.round(r.deposit / 10000) : null,
          }))}
          points={(mapped?.points ?? []).map((p) => ({
            label: p.label,
            address: p.address,
            depositManwon: p.depositManwon,
            rentManwon: p.rentManwon,
          }))}
          refInfo={{
            complexName: raw?.complexName ?? null,
            address: raw?.address || listing.address || "",
            pnu: raw?.pnu ?? listing.pnu ?? null,
            houseType: typeof raw?.houseType === "string" ? raw.houseType : (listing.suplyTyNm ?? null),
            heatMethod: typeof raw?.heatMethod === "string" ? raw.heatMethod : (listing.heatMethod ?? null),
            parkngCo: raw?.parkngCo ?? null,
            coverPhotoUrl: listing.coverPhotoUrl ?? null,
            eligible: listing.eligible ?? [],
          }}
        />
      </div>
      </ReviewLiveProvider>
      </details>
      </div>
    </AdminShell>
  );
}
