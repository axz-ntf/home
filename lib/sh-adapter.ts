// SH(서울주택도시공사) 공고 → Listing (어드민용). 2번 병합 1단계.
// 합의: 어드민에 먼저 노출 → 검수(가격은 3-2 추출) 후 공개. 그래서 지도 좌표(lat/lng)는
// 아직 0(공개 지도 미노출). district 는 제목에서 추출. 가격/세대수는 검수로 채운다.
import type { HousingTypeId, Listing } from "./types";
import shNotices from "./sh-notices.json";

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
  청년안심주택: "happy",
  희망하우징: "happy",
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
  deadline: "",
  beginDate: "",
  announceDate: n.postedAt ?? "",
  eligible: [],
  features: [],
  transit: "",
  competition: null,
  thumbSeed: 10000 + i,
  suplyTyNm: n.supplyType,
  sourceUrl: n.detailUrl ?? "",
  noticePdfUrl: n.pdfUrl ?? undefined,
}));

// 공개(지도) 노출용 — 좌표가 있는(제목서 지오코딩됨) SH. 마감 포함(개선안 1차: 전체 표시
// 후 필터 구분, 마감 핀은 회색). 산재형·시단위(좌표 없음)는 제외.
export const SH_PUBLIC_LISTINGS: Listing[] = SH_ADMIN_LISTINGS.filter(
  (l) => l.lat !== 0 && l.lng !== 0,
);
