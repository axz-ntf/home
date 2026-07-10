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

// 위치 기준 정정공고 우선 처리용 느슨한 키: 괄호 안 부가정보((17형)·(입주자격완화,선게약) 등)까지 제거.
// 정정본에 흔한 괄호 안 오타·잔여물량 표기 때문에 keyOf 로는 원본과 어긋나는 경우를 흡수한다.
const looseKeyOf = (l: Listing) => keyOf(l).replace(/\([^)]*\)/g, "");
const coordKey = (l: Listing) =>
  l.lat && l.lng ? `${l.lat.toFixed(4)},${l.lng.toFixed(4)}` : null;

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

  // 2차(위치 기준): 같은 좌표에 정정공고가 있으면, looseKey 가 같은 일반 공고는 숨긴다.
  // keyOf 가 괄호 안 오타/부가표기로 어긋나 1차에서 못 지운 원본을 흡수. looseKey 가 다르면
  // (주택유형·단지 다름) 좌표가 같아도 유지 — 서로 다른 공고는 합치지 않는다.
  const corrLooseByCoord = new Map<string, Set<string>>();
  for (const l of out) {
    const ck = coordKey(l);
    if (!ck || !isCorrection(l)) continue;
    let s = corrLooseByCoord.get(ck);
    if (!s) corrLooseByCoord.set(ck, (s = new Set()));
    s.add(looseKeyOf(l));
  }
  return out.filter((l) => {
    if (isCorrection(l)) return true;
    const ck = coordKey(l);
    if (!ck) return true;
    return !corrLooseByCoord.get(ck)?.has(looseKeyOf(l));
  });
}
