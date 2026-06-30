// 전국 초등학교 6,303개 (name/lat/lng). 매물 좌표에서 가까운 학교 + 도보 거리.
// 출처: 공공데이터포털 전국초중등학교위치표준데이터(초등학교만 추출).
// 주의: 한국 초등학교는 학구(주소 기준 배정)라 최단거리 ≠ 배정 학교 — "거리순"으로만 표시.
// schools.json(~389KB)은 동적 import 로 별도 청크 분리 — detail 패널 열 때만 로드(메인 번들 제외).
interface School { name: string; lat: number; lng: number; }

let cache: School[] | null = null;
async function getSchools(): Promise<School[]> {
  if (!cache) cache = (await import("./schools.json")).default as School[];
  return cache;
}

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// 도보 시간(분) — 직선거리에 경로 보정 ×1.3 후 67m/분(≈4km/h). subway 와 동일 기준.
function walkMinutes(distM: number): number {
  return Math.max(1, Math.round((distM * 1.3) / 67));
}

export interface NearSchool { name: string; distM: number; walkMin: number; }

// 주변 초등학교 — 도보 maxWalkMin(기본 15분) 이내, 가까운 순. 같은 학교명은 1회.
export async function nearbySchools(
  lat: number | null | undefined,
  lng: number | null | undefined,
  maxWalkMin = 15,
  limit = 3,
): Promise<NearSchool[]> {
  if (!lat || !lng) return [];
  const SCHOOLS = await getSchools();
  const within: { s: School; d: number; w: number }[] = [];
  for (const s of SCHOOLS) {
    const d = haversineM(lat, lng, s.lat, s.lng);
    const w = walkMinutes(d);
    if (w <= maxWalkMin) within.push({ s, d, w });
  }
  within.sort((a, b) => a.d - b.d);
  const seen = new Set<string>();
  const out: NearSchool[] = [];
  for (const { s, d, w } of within) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    out.push({ name: s.name, distM: Math.round(d), walkMin: w });
    if (out.length >= limit) break;
  }
  return out;
}
