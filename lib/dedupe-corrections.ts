import type { Listing } from "./types";

// 정정공고가 있으면 그 공고의 "일반" 버전은 지도/목록에서 숨긴다 (정정공고가 원본을 대체).
// 같은 공고 판별: 제목에서 [정정공고]·[재게시]·(날짜)·공백 제거한 정규화 키.
// 서로 다른 공고(제목 다름)는 좌표가 겹쳐도 합쳐지지 않는다.
const isCorrection = (l: Listing) => (l.title ?? "").includes("정정공고");
const keyOf = (l: Listing) =>
  (l.title ?? "")
    .replace(/\[?\s*정정공고\s*\]?/g, "")
    .replace(/\[\s*재게시\s*\]/g, "")
    .replace(/\(20\d\d[.\-]\d\d[.\-]\d\d\)/g, "")
    .replace(/\s+/g, "")
    .trim();

export function dedupeCorrections(listings: Listing[]): Listing[] {
  const groups = new Map<string, Listing[]>();
  for (const l of listings) {
    const k = keyOf(l) || l.id;
    const g = groups.get(k);
    if (g) g.push(l);
    else groups.set(k, [l]);
  }
  const out: Listing[] = [];
  for (const g of groups.values()) {
    // 정정공고가 하나라도 있으면 정정만, 없으면 그대로.
    const corrections = g.filter(isCorrection);
    const candidates = corrections.length ? corrections : g;
    // 같은 단지(제목)가 같은 좌표에 중복 등재(여러 메가공고에 같은 단지) → 핀 하나만.
    // 좌표 없는 건 id 로 보존(서로 다른 산재형까지 합치지 않게).
    const seen = new Set<string>();
    for (const l of candidates) {
      const ck = l.lat && l.lng ? `${l.lat.toFixed(4)},${l.lng.toFixed(4)}` : `id:${l.id}`;
      if (seen.has(ck)) continue;
      seen.add(ck);
      out.push(l);
    }
  }
  return out;
}
