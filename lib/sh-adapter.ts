// SH(서울주택도시공사) 공고 → Listing (어드민용). 2번 병합 1단계.
// 합의: 어드민에 먼저 노출 → 검수(가격은 3-2 추출) 후 공개. 그래서 지도 좌표(lat/lng)는
// 아직 0(공개 지도 미노출). district 는 제목에서 추출. 가격/세대수는 검수로 채운다.
import type { HousingTypeId, Listing } from "./types";
import shNotices from "./sh-notices.json";
import shMapped from "./sh-mapped.json";

interface ShNotice {
  seq: string;
  supplyType: string;
  title: string;
  postedAt?: string;
  announceAt?: string | null;
  status: string;
  detailUrl?: string;
  pdfUrl?: string | null;
  lat?: number;
  lng?: number;
  geocoded?: boolean;
  geoPlace?: string;
}

// SH 청약유형(11종) → 우리 HousingTypeId. 청년안심·희망하우징은 청년 대상이라 happy.
// 장기전세/장기안심은 전세형이라 jeonse(모델 뉘앙스는 후속 보정).
const SH_TYPE_MAP: Record<string, HousingTypeId> = {
  행복주택: "happy",
  청년안심주택: "youth",
  희망하우징: "youth",
  매입임대주택: "buy",
  수요자맞춤형: "buy",
  두레주택: "buy",
  국민공공임대주택: "nation",
  도시형생활주택: "nation",
  전세임대: "jeonse",
  장기안심주택: "jeonse",
  장기전세주택: "jeonse",
};

function mapType(supplyType: string): HousingTypeId {
  return SH_TYPE_MAP[supplyType] ?? "nation";
}

// SH 접수 기간 — 구조화 데이터에 없어 공고문 PDF(lib/notice-texts/sh-*.md)에서 추출.
// seq 기준 (분리 핀 -mN 은 부모 상속). 순위별 접수는 전체 범위로.
const SH_PERIOD: Record<string, { begin: string; deadline: string }> = {
  "303557": { begin: "2026.05.13", deadline: "2026.06.23" }, // 장기전세 50차 (1~3순위 순차)
  "304864": { begin: "2026.06.15", deadline: "2026.06.17" }, // 행복주택 1차
  "305240": { begin: "2026.06.15", deadline: "2026.06.19" }, // 자립준비청년 상반기
};

// 주택 종류 — SH 원본에 건물종류 필드가 없어 공급유형의 제도 사실로 채움.
// 건설형(행복·국민·장기전세)은 아파트 단지, 매입형은 다가구·다세대 혼재.
// 청년안심주택(아파트·오피스텔 혼재)·희망하우징·전세임대·장기안심주택은 추정하지 않는다.
const SH_BUILDING_TYPE: Record<string, string> = {
  행복주택: "아파트",
  국민공공임대주택: "아파트",
  장기전세주택: "아파트",
  도시형생활주택: "도시형생활주택",
  매입임대주택: "다가구·다세대 등",
  수요자맞춤형: "다가구·다세대 등",
  두레주택: "다가구·다세대 등",
};

// 제목에서 지역(구 우선, 없으면 동/시, 없으면 서울).
function regionFromTitle(title: string): string {
  return (
    title.match(/([가-힣]{2,4}구)/)?.[1] ??
    title.match(/([가-힣]{2,4}동)/)?.[1] ??
    title.match(/([가-힣]{2,4}시)/)?.[1] ??
    "서울"
  );
}

function mapStatus(status: string): Listing["status"] {
  if (status.includes("마감")) return "closed";
  if (status.includes("예정")) return "upcoming";
  return "open";
}

export const SH_ADMIN_LISTINGS: Listing[] = (shNotices as ShNotice[]).map((n, i) => ({
  id: `sh-${n.seq}`,
  pblancId: n.seq,
  title: n.title,
  type: mapType(n.supplyType),
  agency: "SH",
  districtId: "",
  district: n.geoPlace ?? regionFromTitle(n.title),
  lat: n.lat ?? 0,
  lng: n.lng ?? 0,
  address: "",
  deposit: 0,
  rent: 0,
  area: "",
  layout: "",
  totalUnits: null,
  supplyUnits: null,
  status: mapStatus(n.status),
  // SH 구조화 데이터엔 접수 시작·마감이 없어 공고문 PDF 에서 추출해 보강 (SH_PERIOD).
  deadline: SH_PERIOD[String(n.seq)]?.deadline ?? "",
  beginDate: SH_PERIOD[String(n.seq)]?.begin ?? "",
  // LH 와 포맷 통일 (YYYY.MM.DD) — SH 원본은 "2026-05-11" (감사 L3)
  announceDate: (n.postedAt ?? "").replace(/-/g, "."),
  winnerAt: (n.announceAt ?? "").replace(/-/g, ".") || undefined, // 당첨자 발표일
  eligible: [],
  features: [],
  transit: "",
  competition: null,
  thumbSeed: 10000 + i,
  suplyTyNm: n.supplyType,
  buildingType: SH_BUILDING_TYPE[n.supplyType] ?? null,
  sourceUrl: n.detailUrl ?? "",
  noticePdfUrl: n.pdfUrl ?? undefined,
}));

// 다지점(메가)공고 단지별 분리 — extract-sh-mapped.mjs 가 만든 sh-mapped.json
// (seq → points). 행복주택 1차·장기전세·미리내집처럼 좌표가 없던 시단위 공고를
// 단지별 핀으로 전개한다 (LH mapped-regional 과 동일 패턴, SH 전용 경로).
interface ShMappedPoint {
  lat: number;
  lng: number;
  label?: string;
  address?: string;
  units?: number;
  depositManwon?: number;
  rentManwon?: number;
  depositRange?: [number, number];
  rentRange?: [number, number];
}
const SH_MAPPED = shMapped as Record<string, { points: ShMappedPoint[] }>;

function buildShMappedListings(): Listing[] {
  const out: Listing[] = [];
  for (const [seq, cfg] of Object.entries(SH_MAPPED)) {
    const parent = SH_ADMIN_LISTINGS.find((l) => l.id === `sh-${seq}`);
    if (!parent || parent.status === "closed") continue;
    cfg.points.forEach((p, i) => {
      out.push({
        ...parent,
        id: `sh-${seq}-m${i}`,
        lat: p.lat,
        lng: p.lng,
        district: p.address?.match(/([가-힣]{2,4}구)/)?.[1] ?? parent.district,
        ...(p.address && { address: p.address }),
        ...(p.label && { title: p.label }),
        ...(p.units != null && { supplyUnits: p.units }),
        ...(p.depositManwon != null && { deposit: p.depositManwon, rent: p.rentManwon ?? 0 }),
        ...(p.depositRange && { depositRange: p.depositRange }),
        ...(p.rentRange && { rentRange: p.rentRange }),
      });
    });
  }
  return out;
}

// 공개(지도) 노출용 — 좌표가 있는(제목서 지오코딩됨) SH + 다지점 분리 핀. 마감 포함
// (개선안 1차: 전체 표시 후 필터 구분, 마감 핀은 회색). 분리 안 된 산재형은 제외.
export const SH_PUBLIC_LISTINGS: Listing[] = [
  ...SH_ADMIN_LISTINGS.filter((l) => l.lat !== 0 && l.lng !== 0),
  ...buildShMappedListings(),
];
