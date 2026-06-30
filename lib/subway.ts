import stations from "./subway-stations.json";

// 전국 지하철역 690개 (name/line/lat/lng). 매물 좌표에서 가장 가까운 역 + 거리.
interface Station { name: string; line: string; lat: number; lng: number; }
const STATIONS = stations as Station[];

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

export interface NearStation { name: string; line: string; distM: number; walkMin: number; }

// 역세권 판정 — maxM(기본 800m, 도보권) 이내 가장 가까운 역. 없으면 null.
// walkMin: 도보 분 (≈67m/분, 4km/h). 실제 직선거리 기준이라 보수적으로 표기.
export function nearestStation(
  lat: number | null | undefined,
  lng: number | null | undefined,
  maxM = 800,
): NearStation | null {
  if (!lat || !lng) return null;
  let best: Station | null = null;
  let bestD = Infinity;
  for (const s of STATIONS) {
    const d = haversineM(lat, lng, s.lat, s.lng);
    if (d < bestD) { bestD = d; best = s; }
  }
  if (!best || bestD > maxM) return null;
  return { name: best.name, line: best.line, distM: Math.round(bestD), walkMin: Math.max(1, Math.round(bestD / 67)) };
}

// 도보 시간(분) — 직선거리에 경로 보정 ×1.3 후 67m/분(≈4km/h)으로 환산. 보수적 표기.
function walkMinutes(distM: number): number {
  return Math.max(1, Math.round((distM * 1.3) / 67));
}

// 주변 역세권 — 도보 maxWalkMin(기본 15분, 경로보정 반영) 이내 역들을 가까운 순으로. 같은 역명은 1회.
export function nearbyStations(
  lat: number | null | undefined,
  lng: number | null | undefined,
  maxWalkMin = 15,
  limit = 3,
): NearStation[] {
  if (!lat || !lng) return [];
  const within: { s: Station; d: number; w: number }[] = [];
  for (const s of STATIONS) {
    const d = haversineM(lat, lng, s.lat, s.lng);
    const w = walkMinutes(d);
    if (w <= maxWalkMin) within.push({ s, d, w });
  }
  within.sort((a, b) => a.d - b.d);
  const seen = new Set<string>();
  const out: NearStation[] = [];
  for (const { s, d, w } of within) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    out.push({ name: s.name, line: s.line, distM: Math.round(d), walkMin: w });
    if (out.length >= limit) break;
  }
  return out;
}
