"use client";

// 보금 모바일 v1 — 당근 Seed 디자인 시스템 기반 (bogeum-mobile-v1).
// 4 화면: 홈(지도+시트) / 리스트 / 상세 / AI 보금이.
// 데스크탑 캔버스 모드는 default export, 모바일 viewport 용 실제 앱 모드는 MobileApp.

import { useState, type CSSProperties } from "react";
import type { Listing as RealListing, District as RealDistrict } from "@/lib/types";
import { HOUSING_TYPES as REAL_HOUSING_TYPES, STATUS_LABELS as REAL_STATUS_LABELS, ELIGIBILITY_LABELS } from "@/lib/mock-data";
import { depositText, rentText } from "@/lib/price-label";

// ──────────────────────────────────────────────────────────────
// 데이터
// ──────────────────────────────────────────────────────────────
type District = { id: string; name: string; x: number; y: number; count: number };
const DISTRICTS: District[] = [
  { id: "gangseo", name: "강서구", x: 10, y: 52, count: 42 },
  { id: "yangcheon", name: "양천구", x: 18, y: 62, count: 28 },
  { id: "guro", name: "구로구", x: 22, y: 70, count: 36 },
  { id: "geumcheon", name: "금천구", x: 30, y: 82, count: 19 },
  { id: "gwanak", name: "관악구", x: 40, y: 78, count: 31 },
  { id: "dongjak", name: "동작구", x: 44, y: 66, count: 23 },
  { id: "yeongdeungpo", name: "영등포구", x: 30, y: 60, count: 54 },
  { id: "mapo", name: "마포구", x: 32, y: 42, count: 46 },
  { id: "eunpyeong", name: "은평구", x: 30, y: 22, count: 38 },
  { id: "seodaemun", name: "서대문구", x: 40, y: 34, count: 29 },
  { id: "jongno", name: "종로구", x: 49, y: 32, count: 18 },
  { id: "junggu", name: "중구", x: 53, y: 42, count: 14 },
  { id: "yongsan", name: "용산구", x: 50, y: 52, count: 22 },
  { id: "seongbuk", name: "성북구", x: 56, y: 26, count: 34 },
  { id: "gangbuk", name: "강북구", x: 52, y: 14, count: 27 },
  { id: "dobong", name: "도봉구", x: 62, y: 8, count: 21 },
  { id: "nowon", name: "노원구", x: 72, y: 16, count: 49 },
  { id: "jungnang", name: "중랑구", x: 74, y: 30, count: 33 },
  { id: "dongdaemun", name: "동대문구", x: 62, y: 38, count: 26 },
  { id: "seongdong", name: "성동구", x: 60, y: 50, count: 31 },
  { id: "gwangjin", name: "광진구", x: 70, y: 52, count: 24 },
  { id: "gangdong", name: "강동구", x: 88, y: 54, count: 37 },
  { id: "songpa", name: "송파구", x: 80, y: 66, count: 58 },
  { id: "gangnam", name: "강남구", x: 70, y: 68, count: 25 },
  { id: "seocho", name: "서초구", x: 58, y: 72, count: 30 },
];

type HousingType = { id: string; name: string; badge: string };
const HOUSING_TYPES: HousingType[] = [
  { id: "happy", name: "행복주택", badge: "happy" },
  { id: "nation", name: "국민임대", badge: "nation" },
  { id: "integ", name: "통합공공임대", badge: "integ" },
];

type StatusKey = "open" | "upcoming" | "closing" | "closed";
const STATUS_LABELS: Record<StatusKey, { text: string; color: string }> = {
  open: { text: "모집중", color: "#1aa174" },
  upcoming: { text: "모집예정", color: "#c27f29" },
  closing: { text: "마감임박", color: "#ff4133" },
  closed: { text: "마감", color: "#868b94" },
};

type Listing = {
  id: string; title: string; type: string; agency: string;
  districtId: string; district: string; mapX: number; mapY: number; address: string;
  deposit: number; rent: number; area: string; layout: string;
  status: StatusKey; deadline: string;
  eligible: string[]; features: string[]; transit: string; competition: number | null;
  thumbSeed: number;
};

const seed: Array<[string, string, string, string, string, [number, number], string, string, StatusKey, string, string[], string[], string, number | null]> = [
  ["행복주택 가양9단지", "happy", "SH", "gangseo", "서울 강서구 가양동", [1500, 90], "19.2㎡", "원룸", "open", "2026.04.30", ["청년", "신혼"], ["역세권", "1인가구"], "가양역 도보 4분", 20.7],
  ["국민임대 마곡엠밸리3단지", "nation", "LH", "gangseo", "서울 강서구 마곡동", [4800, 180], "46.9㎡", "투룸", "open", "2026.05.12", ["신혼", "자녀"], ["초품아", "신축"], "마곡나루역 도보 7분", 12.4],
  ["통합공공임대 구로항동", "integ", "LH", "guro", "서울 구로구 항동", [6200, 220], "59.8㎡", "쓰리룸", "open", "2026.05.03", ["가구", "다자녀"], ["공원", "신축"], "천왕역 도보 9분", 6.8],
  ["행복주택 금천한내", "happy", "SH", "geumcheon", "서울 금천구 독산동", [2100, 110], "26.5㎡", "투룸", "closing", "2026.04.22", ["청년", "신혼"], ["역세권", "편의"], "독산역 도보 6분", 18.2],
  ["국민임대 관악신림", "nation", "LH", "gwanak", "서울 관악구 신림동", [3400, 150], "39.7㎡", "투룸", "open", "2026.05.20", ["신혼", "자녀"], ["역세권"], "신림역 도보 5분", 9.5],
  ["행복주택 영등포당산", "happy", "SH", "yeongdeungpo", "서울 영등포구 당산동", [1800, 95], "17.4㎡", "원룸", "open", "2026.05.08", ["청년"], ["역세권", "버스"], "당산역 도보 3분", 25.3],
  ["통합공공임대 영등포문래", "integ", "SH", "yeongdeungpo", "서울 영등포구 문래동", [5500, 200], "49.3㎡", "투룸", "upcoming", "2026.06.01", ["가구", "신혼"], ["공원", "편의"], "문래역 도보 8분", null],
  ["국민임대 상암월드컵", "nation", "SH", "mapo", "서울 마포구 상암동", [4200, 170], "44.2㎡", "투룸", "open", "2026.05.15", ["신혼", "자녀"], ["공원", "학군"], "월드컵경기장역 도보 6분", 7.1],
  ["행복주택 은평뉴타운", "happy", "SH", "eunpyeong", "서울 은평구 진관동", [2400, 120], "29.8㎡", "투룸", "open", "2026.04.29", ["청년", "신혼"], ["공원", "신축"], "구파발역 도보 10분", 15.6],
  ["국민임대 서대문홍은", "nation", "LH", "seodaemun", "서울 서대문구 홍은동", [3800, 160], "41.1㎡", "투룸", "closing", "2026.04.25", ["신혼", "자녀"], ["학군"], "홍제역 도보 12분", 11.2],
  ["통합공공임대 용산청파", "integ", "LH", "yongsan", "서울 용산구 청파동", [6800, 240], "46.5㎡", "투룸", "open", "2026.05.18", ["가구", "신혼"], ["역세권", "신축"], "남영역 도보 4분", 5.3],
  ["행복주택 성북장위", "happy", "SH", "seongbuk", "서울 성북구 장위동", [2000, 105], "18.9㎡", "원룸", "open", "2026.05.06", ["청년", "1인"], ["역세권", "편의"], "돌곶이역 도보 7분", 22.8],
  ["국민임대 노원중계", "nation", "LH", "nowon", "서울 노원구 중계동", [3200, 140], "38.6㎡", "투룸", "open", "2026.05.22", ["신혼", "자녀"], ["학군", "공원"], "중계역 도보 8분", 10.4],
  ["행복주택 도봉창동", "happy", "SH", "dobong", "서울 도봉구 창동", [1900, 100], "17.8㎡", "원룸", "closing", "2026.04.23", ["청년"], ["역세권"], "창동역 도보 3분", 28.5],
  ["통합공공임대 중랑면목", "integ", "LH", "jungnang", "서울 중랑구 면목동", [5200, 190], "52.7㎡", "투룸", "open", "2026.05.25", ["가구", "자녀"], ["초품아"], "사가정역 도보 9분", 8.2],
  ["국민임대 동대문전농", "nation", "SH", "dongdaemun", "서울 동대문구 전농동", [4100, 175], "42.8㎡", "투룸", "open", "2026.05.10", ["신혼", "자녀"], ["역세권", "학군"], "청량리역 도보 11분", 9.8],
  ["행복주택 성수뚝섬", "happy", "SH", "seongdong", "서울 성동구 성수동", [2600, 130], "22.4㎡", "원룸", "closing", "2026.04.21", ["청년", "신혼"], ["역세권", "편의"], "뚝섬역 도보 5분", 31.2],
  ["통합공공임대 광진자양", "integ", "SH", "gwangjin", "서울 광진구 자양동", [5800, 210], "56.3㎡", "쓰리룸", "open", "2026.06.03", ["가구", "다자녀"], ["공원", "학군"], "건대입구역 도보 10분", null],
  ["국민임대 강동성내", "nation", "LH", "gangdong", "서울 강동구 성내동", [3900, 165], "42.1㎡", "투룸", "upcoming", "2026.06.08", ["신혼", "자녀"], ["공원"], "강동구청역 도보 7분", null],
  ["행복주택 송파문정", "happy", "SH", "songpa", "서울 송파구 문정동", [2800, 140], "26.8㎡", "투룸", "open", "2026.05.17", ["청년", "신혼"], ["역세권", "신축"], "문정역 도보 4분", 19.4],
  ["국민임대 송파거여", "nation", "LH", "songpa", "서울 송파구 거여동", [4500, 185], "45.7㎡", "투룸", "open", "2026.05.29", ["신혼", "자녀"], ["학군", "공원"], "거여역 도보 8분", 8.9],
  ["행복주택 강남세곡", "happy", "SH", "gangnam", "서울 강남구 세곡동", [2500, 125], "24.6㎡", "원룸", "open", "2026.04.28", ["청년"], ["공원"], "수서역 도보 14분", 26.7],
  ["통합공공임대 서초내곡", "integ", "SH", "seocho", "서울 서초구 내곡동", [6400, 235], "58.2㎡", "쓰리룸", "open", "2026.05.28", ["가구", "다자녀"], ["공원", "학군"], "양재시민의숲역 도보 15분", 6.2],
  ["행복주택 동작상도", "happy", "SH", "dongjak", "서울 동작구 상도동", [2200, 115], "21.3㎡", "원룸", "closing", "2026.04.24", ["청년", "신혼"], ["역세권"], "상도역 도보 6분", 24.1],
  ["국민임대 양천목동", "nation", "SH", "yangcheon", "서울 양천구 목동", [4400, 180], "43.8㎡", "투룸", "open", "2026.05.11", ["신혼", "자녀"], ["학군", "공원"], "목동역 도보 9분", 11.8],
  ["행복주택 종로창신", "happy", "SH", "jongno", "서울 종로구 창신동", [2100, 108], "19.6㎡", "원룸", "open", "2026.05.04", ["청년", "1인"], ["역세권"], "동묘앞역 도보 5분", 23.5],
];

const LISTINGS: Listing[] = seed.map((row, i) => {
  const [title, type, agency, districtId, address, [deposit, rent], area, layout, status, deadline, eligible, features, transit, competition] = row;
  const dist = DISTRICTS.find((d) => d.id === districtId);
  return {
    id: "listing-" + (i + 1),
    title, type, agency, districtId,
    district: dist?.name || "",
    mapX: (dist?.x || 50) + Math.sin(i * 2.3) * 2.5,
    mapY: (dist?.y || 50) + Math.cos(i * 1.7) * 2.5,
    address,
    deposit, rent, area, layout, status, deadline,
    eligible, features, transit, competition,
    thumbSeed: i,
  };
});

const SEOUL_MAP_SVG = `
<svg viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="grid" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M 4 0 L 0 0 0 4" fill="none" stroke="rgba(0,0,0,.025)" stroke-width=".2"/></pattern>
    <linearGradient id="landGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f4f6ee"/><stop offset="100%" stop-color="#eaf1e3"/></linearGradient>
  </defs>
  <rect width="100" height="100" fill="url(#landGrad)"/>
  <rect width="100" height="100" fill="url(#grid)"/>
  <path d="M -2,56 Q 12,52 22,56 Q 34,62 44,58 Q 54,52 62,54 Q 72,56 80,58 Q 90,60 102,58 L 102,64 Q 90,66 80,64 Q 72,62 62,60 Q 54,58 44,62 Q 34,66 22,62 Q 12,58 -2,62 Z" fill="#cce3f4" stroke="#a8d3ee" stroke-width=".3"/>
  <g fill="none" stroke="rgba(0,0,0,.08)" stroke-width=".15" stroke-dasharray="0.6 0.4">
    <path d="M 0,30 L 25,28 L 30,12 L 42,8 L 50,22 L 60,18 L 70,10 L 78,20 L 80,35 L 90,40 L 95,30 L 100,38"/>
    <path d="M 10,48 L 18,50 L 25,55 L 36,48 L 42,54 L 52,48 L 60,50 L 65,42 L 72,48 L 80,52 L 90,48"/>
    <path d="M 0,72 L 15,68 L 22,76 L 35,72 L 44,76 L 52,70 L 60,76 L 68,70 L 78,74 L 90,72 L 100,78"/>
    <path d="M 20,88 L 32,90 L 44,86 L 55,90 L 66,88 L 78,92 L 88,88"/>
  </g>
  <g fill="rgba(68,76,92,.55)" font-size="2.2" font-family="Pretendard, sans-serif" font-weight="500" text-anchor="middle">
    <text x="30" y="20">은평</text><text x="50" y="30">종로</text><text x="65" y="26">성북</text><text x="75" y="16">노원</text>
    <text x="32" y="46">마포</text><text x="52" y="50">용산</text><text x="62" y="50">성동</text><text x="72" y="52">광진</text>
    <text x="30" y="64">영등포</text><text x="45" y="68">동작</text><text x="70" y="68">강남</text><text x="80" y="66">송파</text>
    <text x="88" y="56">강동</text><text x="40" y="80">관악</text><text x="30" y="84">금천</text><text x="58" y="74">서초</text>
  </g>
</svg>`;

function thumbnailSVG(seedN: number, type: string): string {
  const palettes: Record<string, string[]> = {
    happy: ["#ffd2b9", "#ffbc97", "#ff9e66", "#cc4700"],
    nation: ["#d2edfa", "#87d7ff", "#57c7ff", "#0088cc"],
    integ: ["#c7f2e4", "#96ebc3", "#6adeac", "#077a5e"],
  };
  const p = palettes[type] || palettes.happy;
  const [sky, bg, fg, ac] = p;
  const variant = seedN % 3;
  let buildings = "";
  if (variant === 0) {
    const positions = [[14, 46], [20, 46], [26, 46], [32, 46], [14, 54], [20, 54], [26, 54], [32, 54], [14, 62], [20, 62], [26, 62], [32, 62], [14, 70], [20, 70], [26, 70], [32, 70], [14, 78], [20, 78], [26, 78], [32, 78], [48, 34], [54, 34], [60, 34], [48, 42], [54, 42], [60, 42], [48, 50], [54, 50], [60, 50], [48, 58], [54, 58], [60, 58], [48, 66], [54, 66], [60, 66], [48, 74], [54, 74], [60, 74], [48, 82], [54, 82], [60, 82], [78, 54], [84, 54], [78, 62], [84, 62], [78, 70], [84, 70], [78, 78], [84, 78]];
    buildings = `<rect x="10" y="40" width="28" height="55" fill="${fg}" rx="1"/><rect x="44" y="28" width="24" height="67" fill="${bg}" rx="1"/><rect x="74" y="48" width="20" height="47" fill="${fg}" rx="1"/><g fill="${ac}" opacity=".75">${positions.map(([x, y]) => `<rect x="${x}" y="${y}" width="3" height="3"/>`).join("")}</g>`;
  } else if (variant === 1) {
    buildings = `<polygon points="8,95 24,35 40,95" fill="${fg}"/><polygon points="35,95 52,22 68,95" fill="${bg}"/><polygon points="62,95 78,45 94,95" fill="${fg}"/>`;
  } else {
    buildings = `<rect x="5" y="50" width="18" height="45" fill="${bg}"/><rect x="25" y="35" width="20" height="60" fill="${fg}"/><rect x="47" y="20" width="22" height="75" fill="${bg}"/><rect x="71" y="42" width="16" height="53" fill="${fg}"/><rect x="89" y="55" width="10" height="40" fill="${bg}"/>`;
  }
  return `<svg viewBox="0 0 100 95" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><rect width="100" height="95" fill="${sky}"/><circle cx="78" cy="18" r="6" fill="#fff" opacity=".6"/>${buildings}</svg>`;
}

// ──────────────────────────────────────────────────────────────
// 공통
// ──────────────────────────────────────────────────────────────
function MBadge({ type }: { type: string }) {
  const t = REAL_HOUSING_TYPES.find((x) => x.id === type);
  if (!t) return null;
  return <span className={`badge ${t.badge}`}>{t.name}</span>;
}

function dDay(deadline: string, status: string): string {
  if (status === "upcoming") return "예정";
  if (!deadline) return "";
  const [y, m, d] = deadline.split(".").map(Number);
  if (!y) return "";
  const diff = Math.round((new Date(y, m - 1, d).getTime() - Date.now()) / 86400000);
  if (diff < 0) return "마감";
  if (diff === 0) return "D-DAY";
  return `D-${diff}`;
}

// 실제 LH Listing + mock Listing 둘 다 받게. 카드/디테일이 사용하는 필드만 강제.
type AnyListing = {
  id: string; title: string; type: string; agency: string;
  districtId: string; district: string; address: string;
  deposit: number; rent: number; area: string;
  status: StatusKey; deadline: string;
  eligible: string[]; thumbSeed: number;
  layout?: string;
  supplyUnits?: number | string | null;
  heatMethod?: string;
  suplyTyNm?: string;
};

function MCard({ item, onClick }: { item: AnyListing; onClick?: (item: AnyListing) => void }) {
  const svg = thumbnailSVG(item.thumbSeed, item.type);
  const dd = dDay(item.deadline, item.status);
  return (
    <article className="m-card" onClick={() => onClick?.(item)}>
      <div className="m-card-thumb" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="m-card-body">
        <div className="m-card-tags">
          <MBadge type={item.type} />
          <span className="agency">{item.agency}</span>
          <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 800, color: REAL_STATUS_LABELS[item.status]?.color }}>{dd}</span>
        </div>
        <div className="m-card-title">{item.title}</div>
        <div className="m-card-price">
          {item.deposit > 0 ? <><strong>보 {depositText(item)}</strong>{rentText(item) && <><span className="sep">·</span>월 {rentText(item)}</>}</> : <span style={{ color: "var(--seed-semantic-color-ink-text-low)" }}>임대조건 공고문 확인</span>}
        </div>
        <div className="m-card-meta">
          {item.layout && <>{item.layout}<span className="dot">·</span></>}
          {item.area}<span className="dot">·</span>{item.district}
        </div>
      </div>
    </article>
  );
}

// ──────────────────────────────────────────────────────────────
// 화면 1: 홈
// ──────────────────────────────────────────────────────────────
function HomeScreen() {
  const visibleDistricts = DISTRICTS.filter((d) => ["eunpyeong", "mapo", "yongsan", "gangnam", "songpa", "nowon", "seongbuk", "gangseo", "seocho"].includes(d.id));
  const peekItem = LISTINGS.find((l) => l.status === "open" || l.status === "closing");
  return (
    <div className="m-screen">
      <div className="m-topbar">
        <div className="m-search">
          <span className="m-search-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/><path d="M 10.5 10.5 L 14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg></span>
          <div className="s-text">서울시 전체 <small>지하철·동·단지 검색</small></div>
        </div>
      </div>
      <div className="m-filterrow">
        <button className="m-fchip on">임대유형 1<svg width="8" height="8" viewBox="0 0 8 8"><path d="M 2 3 L 4 5 L 6 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg></button>
        <button className="m-fchip">모집상태<svg width="8" height="8" viewBox="0 0 8 8"><path d="M 2 3 L 4 5 L 6 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg></button>
        <button className="m-fchip">교통<svg width="8" height="8" viewBox="0 0 8 8"><path d="M 2 3 L 4 5 L 6 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg></button>
        <button className="m-fchip on">청년<svg width="8" height="8" viewBox="0 0 8 8"><path d="M 2 3 L 4 5 L 6 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg></button>
        <button className="m-fchip">월세<svg width="8" height="8" viewBox="0 0 8 8"><path d="M 2 3 L 4 5 L 6 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg></button>
        <button className="m-fchip">입주 시기<svg width="8" height="8" viewBox="0 0 8 8"><path d="M 2 3 L 4 5 L 6 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg></button>
      </div>
      <div className="m-map">
        <div className="m-map-svg" dangerouslySetInnerHTML={{ __html: SEOUL_MAP_SVG }} />
        <div className="m-region-pill">
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M 7 1 C 4.5 1 2.5 3 2.5 5.5 C 2.5 8.5 7 13 7 13 C 7 13 11.5 8.5 11.5 5.5 C 11.5 3 9.5 1 7 1 Z" stroke="currentColor" strokeWidth="1.3"/><circle cx="7" cy="5.5" r="1.5" fill="currentColor"/></svg>
          서울특별시
          <svg width="9" height="9" viewBox="0 0 10 10" style={{ marginLeft: 2 }}><path d="M 2 4 L 5 7 L 8 4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/></svg>
        </div>
        {visibleDistricts.map((d) => {
          const sz = d.count >= 50 ? "lg" : d.count >= 25 ? "" : "sm";
          const active = d.id === "mapo";
          return (
            <div key={d.id} className={`m-map-marker ${sz} ${active ? "active" : ""}`} style={{ left: `${d.x}%`, top: `${d.y}%` }}>
              {d.count}<span className="lbl">{d.name.replace("구", "")}</span>
            </div>
          );
        })}
        <div className="m-map-floats">
          <button className="m-map-fab"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3"/><path d="M 8 1 V 3 M 8 13 V 15 M 1 8 H 3 M 13 8 H 15" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg></button>
          <button className="m-map-fab"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M 7 1 V 13 M 1 7 H 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></button>
          <button className="m-map-fab" style={{ background: "var(--seed-semantic-color-primary)", color: "white" } as CSSProperties}><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M 3 8 C 3 5 5 3 8 3 C 11 3 13 5 13 8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/><circle cx="8" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M 5 12.5 L 11 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg></button>
        </div>
        <div className="m-sheet peek">
          <div className="m-sheet-handle" />
          <div className="m-sheet-head">
            <div className="m-sheet-title">서울 전체 <em>647</em>건 모집중</div>
            <div className="m-sheet-sort">마감임박순<svg width="9" height="9" viewBox="0 0 10 10"><path d="M 2 4 L 5 7 L 8 4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/></svg></div>
          </div>
          <div className="m-sheet-list">{peekItem && <MCard item={peekItem} />}</div>
        </div>
      </div>
      <TabBar active="map" />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// 화면 2: 리스트
// ──────────────────────────────────────────────────────────────
function ListScreen({ items = [] }: { items?: AnyListing[] }) {
  const listings = items.slice(0, 30);
  return (
    <div className="m-screen">
      <div className="m-topbar">
        <div className="m-search">
          <span className="m-search-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/><path d="M 10.5 10.5 L 14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg></span>
          <div className="s-text">서울시 전체 <small>지하철·동·단지 검색</small></div>
        </div>
      </div>
      <div className="m-filterrow">
        <button className="m-fchip on">임대유형 1<svg width="8" height="8" viewBox="0 0 8 8"><path d="M 2 3 L 4 5 L 6 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg></button>
        <button className="m-fchip on">모집중<svg width="8" height="8" viewBox="0 0 8 8"><path d="M 2 3 L 4 5 L 6 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg></button>
        <button className="m-fchip">교통<svg width="8" height="8" viewBox="0 0 8 8"><path d="M 2 3 L 4 5 L 6 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg></button>
        <button className="m-fchip">입주자격<svg width="8" height="8" viewBox="0 0 8 8"><path d="M 2 3 L 4 5 L 6 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg></button>
        <button className="m-fchip">월세<svg width="8" height="8" viewBox="0 0 8 8"><path d="M 2 3 L 4 5 L 6 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg></button>
      </div>
      <div className="m-listscreen-head">
        <div className="m-listscreen-count">총 <em>647</em>건 모집중</div>
        <div className="m-listscreen-sort">마감임박순<svg width="9" height="9" viewBox="0 0 10 10"><path d="M 2 4 L 5 7 L 8 4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/></svg></div>
      </div>
      <div className="m-listscreen-content">{listings.map((item) => <MCard key={item.id} item={item as AnyListing} />)}</div>
      <button className="m-floating-map-cta"><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M 1 3 L 5 1.5 L 9 3 L 13 1.5 V 11 L 9 12.5 L 5 11 L 1 12.5 Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M 5 1.5 V 11 M 9 3 V 12.5" stroke="currentColor" strokeWidth="1.3"/></svg>지도로 보기</button>
      <TabBar active="map" />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// 화면 3: 상세
// ──────────────────────────────────────────────────────────────
function DetailScreen({ item: propItem }: { item?: AnyListing }) {
  if (!propItem) {
    return <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" } as CSSProperties}>매물을 선택해주세요</div>;
  }
  const item = propItem;
  const svg = thumbnailSVG(item.thumbSeed, item.type);
  const typeLabel = REAL_HOUSING_TYPES.find((t) => t.id === item.type)?.name || item.type;
  return (
    <div className="m-screen no-top-pad">
      <div className="m-detail-hero" dangerouslySetInnerHTML={{ __html: svg }} />
      <button className="m-detail-back" style={{ position: "absolute", top: 56 } as CSSProperties}><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M 10 3 L 5 8 L 10 13" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
      <button className="m-detail-share" style={{ position: "absolute", top: 56 } as CSSProperties}><svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M 10 3 V 13 M 10 3 L 6 7 M 10 3 L 14 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M 4 12 V 16 H 16 V 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></button>
      <div className="m-photo-counter">1 / 8</div>
      <div className="m-detail-body">
        <div className="m-detail-eyebrow">{item.agency} · {item.district}</div>
        <h1 className="m-detail-title">{item.title}</h1>
        <div className="m-detail-addr">{item.address}</div>
        <div className="m-detail-badges">
          <span className={`badge ${item.type}`}>{typeLabel}</span>
          <span className="badge agency">{item.agency} 공급</span>
          <span className="badge status">{REAL_STATUS_LABELS[item.status]?.text || item.status}</span>
        </div>
        <div className="m-dday-card">
          <div>
            <div className="l">모집 마감</div>
            <div className="d">{item.deadline.replace(/\./g, ". ")} 18:00</div>
          </div>
          <div className="v" suppressHydrationWarning>{dDay(item.deadline, item.status)}</div>
        </div>
        <div className="m-price-grid">
          <div className="m-price-cell"><div className="m-price-label">보증금</div><div className="m-price-value">{depositText(item) ?? "공고문 확인"}</div></div>
          <div className="m-price-cell"><div className="m-price-label">월 임대료</div><div className="m-price-value">{rentText(item) ?? "—"}</div></div>
          <div className="m-price-cell"><div className="m-price-label">관리비</div><div className="m-price-value">별도</div></div>
        </div>
        <section className="m-section">
          <h3>입주 자격</h3>
          <div className="m-eli-row">
            {item.eligible.map((e) => (
              <span key={e} className="m-eli-pill">{ELIGIBILITY_LABELS[e] ?? e}</span>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--seed-semantic-color-ink-text-low)", marginTop: 6 } as CSSProperties}>정확한 자격은 LH 공고문을 확인하세요</div>
        </section>
        <section className="m-section">
          <h3>기본 정보</h3>
          <dl className="m-specs">
            {item.supplyUnits && <><dt>공급 세대수</dt><dd>{item.supplyUnits}세대</dd></>}
            <dt>전용면적</dt><dd>{item.area}</dd>
            {item.heatMethod && <><dt>난방</dt><dd>{item.heatMethod}</dd></>}
            {item.suplyTyNm && <><dt>주택유형</dt><dd>{item.suplyTyNm}</dd></>}
            <dt>마감일</dt><dd>{item.deadline.replace(/\./g, ". ")}</dd>
          </dl>
        </section>
      </div>
      <div className="m-detail-actions">
        <button className="heart"><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M 10 17 C 10 17 3 12 3 7.5 C 3 5 5 3 7.5 3 C 8.8 3 10 4 10 4 C 10 4 11.2 3 12.5 3 C 15 3 17 5 17 7.5 C 17 12 10 17 10 17 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none"/></svg></button>
        <button className="cta">청약 신청하기 →</button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// 화면 4: AI 보금이
// ──────────────────────────────────────────────────────────────
function AgentScreen({ items = [] }: { items?: AnyListing[] }) {
  const matchItem = items[0];
  if (!matchItem) {
    return <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" } as CSSProperties}>매물 데이터 로딩 중...</div>;
  }
  const svg = thumbnailSVG(matchItem.thumbSeed, matchItem.type);
  return (
    <div className="m-agent m-screen">
      <header className="m-agent-head">
        <button className="m-agent-back"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M 10 3 L 5 8 L 10 13" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
        <div className="m-agent-av">
          <svg viewBox="0 0 32 32" width="36" height="36">
            <defs><radialGradient id="mbg" cx=".4" cy=".4"><stop offset="0%" stopColor="#ffd2b9"/><stop offset="100%" stopColor="#ff6f0f"/></radialGradient></defs>
            <circle cx="16" cy="16" r="16" fill="url(#mbg)"/>
            <circle cx="11" cy="14" r="1.6" fill="#3d1d05"/><circle cx="21" cy="14" r="1.6" fill="#3d1d05"/>
            <path d="M 11 20 Q 16 23 21 20" stroke="#3d1d05" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
            <circle cx="11" cy="13.4" r=".5" fill="white"/><circle cx="21" cy="13.4" r=".5" fill="white"/>
          </svg>
        </div>
        <div>
          <div className="m-agent-name">보금이 <span className="ai-tag">AI</span></div>
          <div className="m-agent-sub">공공임대 상담사 · 응답 2초 내</div>
        </div>
      </header>
      <div className="m-chat-body">
        <div className="m-msg bot"><div className="m-bubble">
          <p>안녕하세요, 공공임대 상담사 <strong>보금이</strong>예요.</p>
          <p>편하게 상황을 말씀해 주시면 어떤 집을 신청할 수 있는지 같이 찾아드릴게요.</p>
        </div></div>
        <div className="m-msg user"><div className="m-bubble">29살 직장인이고 미혼이에요. 월 320만원 정도 벌어요</div></div>
        <div className="m-msg bot"><div className="m-bubble">
          <p>좋아요, 청년 계층으로 <strong>행복주택</strong> 신청이 가능해 보여요.</p>
          <p>몇 가지만 더 확인해볼게요. 보증금은 얼마까지 마련 가능하세요?</p>
        </div></div>
        <div className="m-msg user"><div className="m-bubble">2천만원까지요</div></div>
        <div className="m-msg bot"><div className="m-bubble">
          <p>딱 맞는 단지가 있어요. 강서구 가양역 도보 4분의 행복주택이에요.</p>
          <div className="m-chat-card">
            <div className="thumb" dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="info">
              <div className="title">{matchItem.title}</div>
              <div className="price"><strong>보 {matchItem.deposit.toLocaleString()}</strong> · 월 {matchItem.rent}만</div>
              <div className="meta">19.2㎡ · 청년 · 마감 D-11</div>
            </div>
          </div>
          <div className="m-bot-actions">
            <button className="m-bot-action">매물 상세 보기<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M 4 2 L 8 6 L 4 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></button>
            <button className="m-bot-action">비슷한 청년 매물 12개 더 보기<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M 4 2 L 8 6 L 4 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></button>
          </div>
        </div></div>
      </div>
      <div className="m-chat-input">
        <div className="m-chat-input-row">
          <input type="text" placeholder="상황을 자유롭게 적어보세요" />
          <button className="m-chat-send"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M 2 8 L 14 2 L 11 14 L 8 9 L 2 8 Z" fill="currentColor"/></svg></button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// 탭바
// ──────────────────────────────────────────────────────────────
type TabId = "home" | "map" | "agent" | "fav" | "mypage";

function TabBar({ active, onChange }: { active: TabId; onChange?: (id: TabId) => void }) {
  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "home", label: "홈", icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M 3 9 L 10 3 L 17 9 V 17 H 12 V 12 H 8 V 17 H 3 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg> },
    { id: "map", label: "지도", icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M 2 5 L 7 3 L 13 5 L 18 3 V 15 L 13 17 L 7 15 L 2 17 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M 7 3 V 15 M 13 5 V 17" stroke="currentColor" strokeWidth="1.5"/></svg> },
    { id: "agent", label: "보금이", icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M 7 9 L 7 9.5 M 13 9 L 13 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M 7 12 Q 10 14 13 12" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg> },
    { id: "fav", label: "관심", icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M 10 17 C 10 17 3 12 3 7.5 C 3 5 5 3 7.5 3 C 8.8 3 10 4 10 4 C 10 4 11.2 3 12.5 3 C 15 3 17 5 17 7.5 C 17 12 10 17 10 17 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg> },
    { id: "mypage", label: "마이", icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.5"/><path d="M 3 17 C 3 13.5 6 11 10 11 C 14 11 17 13.5 17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  ];
  return (
    <nav className="m-tabbar">
      {tabs.map((t) => (
        <button key={t.id} className={`m-tab ${active === t.id ? "on" : ""}`} onClick={() => onChange?.(t.id)}>
          {t.icon}{t.label}
        </button>
      ))}
    </nav>
  );
}

// ──────────────────────────────────────────────────────────────
// 실제 모바일 앱 모드 (반응형) — 탭 state, 화면 전환, frame 없음.
// 모바일 viewport 에서 page.tsx 가 이걸 직접 렌더.
// ──────────────────────────────────────────────────────────────
export function MobileApp({ listings = [], districts = [] }: { listings?: AnyListing[]; districts?: RealDistrict[] }) {
  const [tab, setTab] = useState<TabId>("home");
  const [selectedItem, setSelectedItem] = useState<AnyListing | null>(null);

  // 활성 매물만 (closed 제외) — 카드와 시트에 보이는 게 mock 처럼 신선
  const activeItems = listings.filter((l) => l.status !== "closed");
  const openDetail = (item: AnyListing) => { setSelectedItem(item); setTab("fav"); };

  return (
    <div style={{ height: "100%", minHeight: "100vh", background: "#fff", display: "flex", flexDirection: "column", position: "relative" } as CSSProperties}>
      {/* DEBUG — 매물 수 확인용 */}
      <div style={{ position: "fixed", top: 0, left: 0, zIndex: 9999, background: "red", color: "white", padding: "2px 8px", fontSize: 11, fontWeight: 700 } as CSSProperties}>
        listings: {listings.length} / active: {activeItems.length}
      </div>
      {tab === "home" && <MobileScreenWithTab screen={<HomeScreenInline items={activeItems} districts={districts} onCardClick={openDetail} />} tab={tab} onChange={setTab} />}
      {tab === "map" && <MobileScreenWithTab screen={<ListScreen items={activeItems} />} tab={tab} onChange={setTab} />}
      {tab === "agent" && <MobileScreenWithTab screen={<AgentScreen items={activeItems} />} tab={tab} onChange={setTab} />}
      {tab === "fav" && <MobileScreenWithTab screen={<DetailScreen item={selectedItem ?? activeItems[0]} />} tab={tab} onChange={setTab} />}
      {tab === "mypage" && <MobileScreenWithTab screen={<EmptyScreen label="마이페이지" />} tab={tab} onChange={setTab} />}
    </div>
  );
}

// 탭 변경 가능한 home 화면 — 실제 LH_DISTRICTS 의 lat/lng 를 % 좌표로 변환해 마커.
function HomeScreenInline({ items = [], districts = [], onCardClick }: { items?: AnyListing[]; districts?: RealDistrict[]; onCardClick?: (item: AnyListing) => void }) {
  // 실제 시도 좌표 → SVG % (한국 lat 33-39, lng 124-132 범위 매핑)
  const realMarkers = districts.length > 0
    ? districts.map((d) => ({
        id: d.id, name: d.name,
        x: Math.max(5, Math.min(95, ((d.lng - 124) / 8) * 100)),
        y: Math.max(5, Math.min(95, ((39 - d.lat) / 6) * 100)),
        count: d.count,
      }))
    : DISTRICTS.filter((d) => ["eunpyeong", "mapo", "yongsan", "gangnam", "songpa", "nowon", "seongbuk", "gangseo", "seocho"].includes(d.id));
  const peekItem = items[0];
  return (
    <>
      <div className="m-topbar">
        <div className="m-search">
          <span className="m-search-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/><path d="M 10.5 10.5 L 14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg></span>
          <div className="s-text">서울시 전체 <small>지하철·동·단지 검색</small></div>
        </div>
      </div>
      <div className="m-filterrow">
        <button className="m-fchip on">임대유형 1<svg width="8" height="8" viewBox="0 0 8 8"><path d="M 2 3 L 4 5 L 6 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg></button>
        <button className="m-fchip">모집상태<svg width="8" height="8" viewBox="0 0 8 8"><path d="M 2 3 L 4 5 L 6 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg></button>
        <button className="m-fchip">교통<svg width="8" height="8" viewBox="0 0 8 8"><path d="M 2 3 L 4 5 L 6 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg></button>
        <button className="m-fchip on">청년<svg width="8" height="8" viewBox="0 0 8 8"><path d="M 2 3 L 4 5 L 6 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg></button>
        <button className="m-fchip">월세<svg width="8" height="8" viewBox="0 0 8 8"><path d="M 2 3 L 4 5 L 6 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg></button>
      </div>
      <div className="m-map">
        <div className="m-map-svg" dangerouslySetInnerHTML={{ __html: SEOUL_MAP_SVG }} />
        <div className="m-region-pill">
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M 7 1 C 4.5 1 2.5 3 2.5 5.5 C 2.5 8.5 7 13 7 13 C 7 13 11.5 8.5 11.5 5.5 C 11.5 3 9.5 1 7 1 Z" stroke="currentColor" strokeWidth="1.3"/><circle cx="7" cy="5.5" r="1.5" fill="currentColor"/></svg>
          전국
        </div>
        {realMarkers.map((d) => {
          const sz = d.count >= 50 ? "lg" : d.count >= 25 ? "" : "sm";
          return (
            <div key={d.id} className={`m-map-marker ${sz}`} style={{ left: `${d.x}%`, top: `${d.y}%` }}>
              {d.count}<span className="lbl">{d.name.replace(/(특별시|광역시|특별자치|시|도)$/, "")}</span>
            </div>
          );
        })}
        <div className="m-sheet peek">
          <div className="m-sheet-handle" />
          <div className="m-sheet-head">
            <div className="m-sheet-title">전국 <em>{items.length}</em>건 모집중</div>
          </div>
          <div className="m-sheet-list">{peekItem && <MCard item={peekItem} onClick={onCardClick} />}</div>
        </div>
      </div>
    </>
  );
}

function MobileScreenWithTab({ screen, tab, onChange }: { screen: React.ReactNode; tab: TabId; onChange: (id: TabId) => void }) {
  return (
    <div className="m-screen" style={{ height: "100%", minHeight: "100vh", flex: 1 } as CSSProperties}>
      {screen}
      <TabBar active={tab} onChange={onChange} />
    </div>
  );
}

function EmptyScreen({ label }: { label: string }) {
  return (
    <div style={{ flex: 1, display: "grid", placeItems: "center", color: "#9ca3af" } as CSSProperties}>
      <div>{label} (준비 중)</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// 캔버스
// ──────────────────────────────────────────────────────────────
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: 402, height: 874, borderRadius: 44, background: "#000", padding: 14, boxShadow: "0 30px 60px -20px rgba(0,0,0,.3)", flex: "0 0 auto" } as CSSProperties}>
      <div style={{ width: "100%", height: "100%", borderRadius: 30, overflow: "hidden", background: "white", display: "flex", flexDirection: "column" } as CSSProperties}>
        {children}
      </div>
    </div>
  );
}

function Artboard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" } as CSSProperties}>
      <div style={{ fontSize: 13, color: "#666", fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  );
}

export default function MobileV1() {
  return (
    <div className="canvas-bg" style={{ minHeight: "100vh", padding: 40, background: "#f5f5f7" } as CSSProperties}>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>보금 · 모바일 UI</h1>
      <p style={{ fontSize: 14, color: "#666", margin: "4px 0 24px" }}>당근 Seed 디자인 · iPhone 16 (402×874)</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, max-content))", gap: 32 } as CSSProperties}>
        <Artboard label="① 홈 — 지도 + 시트 peek"><Frame><HomeScreen /></Frame></Artboard>
        <Artboard label="② 매물 리스트"><Frame><ListScreen /></Frame></Artboard>
        <Artboard label="③ 매물 상세"><Frame><DetailScreen /></Frame></Artboard>
        <Artboard label="④ AI 상담사 보금이"><Frame><AgentScreen /></Frame></Artboard>
      </div>
    </div>
  );
}
