// 청년안심주택(서울시, soco.seoul.go.kr) 공고 → Listing (어드민용). 4번 파이프라인.
// 민간임대만 병합 — [공공임대]분은 SH 게시판이 원본이라 sh-adapter 로 이미 들어온다(중복 방지).
// SH 와 같은 합의: 어드민 먼저 → 검수 후 공개 승격. lat/lng=0(공개 지도 미노출).
import type { Listing } from "./types";
import youthNotices from "./youth-notices.json";

interface YouthNotice {
  boardId: number;
  title: string;
  isPrivate: boolean;
  gu: string;
  supplier: string;
  postedAt: string; // 공고게시일 YYYY-MM-DD
  applyDate: string; // 청약신청일 YYYY-MM-DD
  detailUrl: string;
  pdfUrl?: string | null;
  pdfName?: string | null;
}

// 청약신청일이 지나면 마감 — soco 게시판엔 상태 컬럼이 없어 날짜로 유도.
function statusFromApplyDate(applyDate: string): Listing["status"] {
  const parts = applyDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return "closed";
  const target = new Date(parts[0], parts[1] - 1, parts[2]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return target.getTime() >= today.getTime() ? "open" : "closed";
}

export const YOUTH_ADMIN_LISTINGS: Listing[] = (youthNotices as YouthNotice[])
  .filter((n) => n.isPrivate)
  .map((n, i) => ({
    id: `youth-${n.boardId}`,
    pblancId: String(n.boardId),
    title: n.title.replace(/^\[민간임대\]\s*/, ""),
    type: "happy",
    agency: "서울시",
    districtId: "",
    district: n.gu || "서울",
    lat: 0,
    lng: 0,
    address: "",
    deposit: 0,
    rent: 0,
    area: "",
    layout: "",
    totalUnits: null,
    supplyUnits: null,
    status: statusFromApplyDate(n.applyDate),
    deadline: n.applyDate.replace(/-/g, "."),
    beginDate: n.applyDate.replace(/-/g, "."),
    announceDate: n.postedAt.replace(/-/g, "."),
    eligible: [],
    features: [],
    transit: "",
    competition: null,
    thumbSeed: 20000 + i,
    suplyTyNm: "청년안심주택(민간임대)",
    sourceUrl: n.detailUrl,
    noticePdfUrl: n.pdfUrl ?? undefined,
  }));
