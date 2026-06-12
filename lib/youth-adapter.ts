// 청년안심주택(서울시, soco.seoul.go.kr) 공고 → Listing. 4번 파이프라인.
// 민간임대만 병합 — [공공임대]분은 SH 게시판이 원본이라 sh-adapter 로 이미 들어온다(중복 방지).
// 단지 정보(좌표·주소·역세권·가격·세대수·사진)는 공식 단지 디렉토리(maplist.json →
// youth-complexes.json)를 공고 제목 ↔ homeName 매칭으로 주입 — 지오코딩·추출 불필요.
import type { Listing } from "./types";
import youthNotices from "./youth-notices.json";
import youthComplexes from "./youth-complexes.json";

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

interface YouthComplex {
  homeCode: string;
  homeName: string;
  gu: string;
  address: string;
  subway: string;
  depositLowWon: number | null;
  rentLowWon: number | null;
  totalUnits: number | null;
  phone: string;
  homepage: string;
  lat: number;
  lng: number;
  photoUrl: string | null;
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

// "길동역 길동생활(B동) 추가모집공고" ↔ "길동역 길동생활B동" — 공백/괄호 차이만 정규화.
const normalize = (s: string) => s.replace(/[\s()[\]]/g, "");
// 괄호 부가표기 제거 — "힐데스하임(U-삼진랜드)" → "힐데스하임", "종암경찰서역(예정)" → "종암경찰서역".
const stripParen = (s: string) => s.replace(/\([^)]*\)/g, "");

function matchComplex(title: string): YouthComplex | undefined {
  const complexes = youthComplexes as YouthComplex[];
  const t = normalize(title);
  // 1차: 괄호 내용 보존 매칭 — "길동생활(B동)"처럼 괄호가 동 구분일 때 A/B 혼동 방지.
  const exact = complexes.find((c) => {
    const h = normalize(c.homeName);
    return h.length >= 4 && t.includes(h);
  });
  if (exact) return exact;
  // 2차: 양쪽 괄호 부가표기 제거 후 매칭.
  const ts = normalize(stripParen(title));
  const stripped = complexes.find((c) => {
    const h = normalize(stripParen(c.homeName));
    return h.length >= 4 && ts.includes(h);
  });
  if (stripped) return stripped;
  // 3차: 토큰 AND — "등촌역 아르체움 등촌 청년주택"(접미사 잉여) ↔ "등촌역 아르체움 등촌 추가모집공고",
  // "연신내역 루미노 816" ↔ "연신내역 Lumino 816 (루미노 816)" 같은 어순·표기 차이 흡수.
  // 괄호 병기("(루미노 816)")가 매칭 단서일 수 있어 괄호 보존 문자열(t)에서 찾는다.
  const tl = t.toLowerCase();
  return complexes.find((c) => {
    const tokens = stripParen(c.homeName)
      .split(/\s+/)
      .filter((w) => w && !/^청년(안심)?주택$/.test(w));
    return tokens.length >= 2 && tokens.every((w) => tl.includes(w.toLowerCase()));
  });
}

const manwon = (won: number | null) => (won ? Math.round(won / 10000) : 0);

// 어드민 소스 대조용 (P3) — 공고 제목으로 매칭된 공식 디렉토리 값을 그대로 노출.
// 검수자가 "공식 vs 현재값" 비교로 soco 오입력(보↔월 뒤바뀜 등)을 눈으로 잡는다.
export function youthDirectoryInfo(title: string): (YouthComplex & { depositManwon: number; rentManwon: number }) | null {
  const c = matchComplex(title);
  if (!c) return null;
  const { deposit, rent } = depositRent(c);
  return { ...c, depositManwon: deposit, rentManwon: rent };
}

// soco 디렉토리에 보증금↔월세가 뒤바뀌어 입력된 단지가 있다(유벤투스 240: 보증금 25만/
// 월세 6,100만). 보증금이 월세보다 작은 조합은 현실에 없으므로 스왑으로 교정.
function depositRent(c: YouthComplex | undefined): { deposit: number; rent: number } {
  const deposit = manwon(c?.depositLowWon ?? null);
  const rent = manwon(c?.rentLowWon ?? null);
  if (deposit && rent && deposit < rent) return { deposit: rent, rent: deposit };
  return { deposit, rent };
}

export const YOUTH_ADMIN_LISTINGS: Listing[] = (youthNotices as YouthNotice[])
  .filter((n) => n.isPrivate)
  .map((n, i) => {
    const c = matchComplex(n.title);
    const { deposit, rent } = depositRent(c);
    return {
      id: `youth-${n.boardId}`,
      pblancId: String(n.boardId),
      title: n.title.replace(/^\[민간임대\]\s*/, ""),
      type: "youth" as const,
      agency: "서울시" as const,
      districtId: "",
      district: c?.gu || n.gu || "서울",
      lat: c?.lat ?? 0,
      lng: c?.lng ?? 0,
      address: c ? `서울 ${c.address}` : "",
      // 디렉토리 가격은 최저 옵션(저가 컨셉의 대표가) — 상세 범위는 검수(추출)로.
      deposit,
      rent,
      area: "",
      layout: "",
      totalUnits: c?.totalUnits ?? null,
      supplyUnits: null,
      status: statusFromApplyDate(n.applyDate),
      deadline: n.applyDate.replace(/-/g, "."),
      beginDate: n.applyDate.replace(/-/g, "."),
      announceDate: n.postedAt.replace(/-/g, "."),
      eligible: [],
      features: [],
      transit: c?.subway ?? "",
      competition: null,
      thumbSeed: 20000 + i,
      suplyTyNm: "청년안심주택(민간임대)",
      sourceUrl: n.detailUrl,
      noticePdfUrl: n.pdfUrl ?? undefined,
      coverPhotoUrl: c?.photoUrl ?? undefined,
    };
  });

// 공개(지도) 노출용 — 모집중 + 단지 매칭(좌표·가격 확보)된 건만. 정보가 공식 디렉토리
// 출처라 검수 전에도 신뢰 가능. 마감분 98건은 어드민 전용(검수 큐 이력).
export const YOUTH_PUBLIC_LISTINGS: Listing[] = YOUTH_ADMIN_LISTINGS.filter(
  (l) => l.status === "open" && l.lat !== 0 && l.lng !== 0,
);
