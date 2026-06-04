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
