"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { District, Listing } from "@/lib/types";
import { loadNaverMaps } from "@/lib/naver-loader";
import "@/lib/naver-types";
import type { NaverMarker, NaverMap } from "@/lib/naver-types";
import { LocateIcon } from "./icons";
import { effectiveStatus } from "@/lib/dday";

// 진입 기본 뷰 = 전국. 한반도 남부 중앙 + 전 시도 마커가 보이는 줌.
const KOREA_CENTER = { lat: 36.3, lng: 127.8 };
const DEFAULT_ZOOM = 7;
const DISTRICT_ZOOM = 12;
const CLIENT_ID = process.env.NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID;

function sizeClass(count: number): string {
  if (count >= 100) return "size-lg";
  if (count >= 25) return "size-md";
  return "size-sm";
}

// 시도 표준 약칭 (한국 행정 관행). 모두 2자로 통일 → 작은 마커 원에도 잘 들어감.
const SHORT_SIDO_NAMES: Record<string, string> = {
  "충청북도": "충북",
  "충청남도": "충남",
  "전라남도": "전남",
  "경상북도": "경북",
  "경상남도": "경남",
};
function districtShortName(name: string): string {
  if (SHORT_SIDO_NAMES[name]) return SHORT_SIDO_NAMES[name];
  return name
    .replace(/특별자치도$|광역시$|특별자치시$|특별시$/, "")
    .replace(/도$/, "");
}

function makeDistrictEl(id: string, name: string, count: number): HTMLElement {
  const el = document.createElement("div");
  el.className = "map-marker-wrap";
  el.dataset.districtId = id;
  el.innerHTML = `<div class="map-marker ${sizeClass(count)}"><span class="count">${count}</span><span class="label">${districtShortName(name)}</span></div>`;
  return el;
}

function pinClass(type: Listing["type"]): string {
  if (type === "sale") return "map-pin sale";
  if (type === "happy") return "map-pin happy";
  if (type === "nation") return "map-pin nation";
  if (type === "perm") return "map-pin perm";
  if (type === "buy") return "map-pin buy";
  if (type === "jeonse") return "map-pin jeonse";
  if (type === "fifty") return "map-pin fifty";
  if (type === "youth") return "map-pin youth";
  return "map-pin";
}

function pinLabel(p: Listing): string {
  // SH 는 자체 청약유형(청년안심주택 등) 그대로 (개선안1차 M4).
  if (p.agency === "SH" && p.suplyTyNm) return p.suplyTyNm;
  switch (p.type) {
    case "sale": return "공공분양";
    case "happy": return "행복주택";
    case "nation": return "국민임대";
    case "perm": return "영구임대";
    case "buy": return "매입임대";
    case "jeonse": return "전세임대";
    case "fifty": return "50년임대";
    case "integ": return "통합공공임대";
    case "youth": return "청년주택";
    default: return p.suplyTyNm || "LH";
  }
}

function makePinEl(p: Listing, memberCount = 1): HTMLElement {
  const el = document.createElement("div");
  el.className = "map-pin-wrap";
  el.dataset.listingId = p.id;
  // 마감 공고도 지도에 표시하되 회색으로 구분 (개선안 1차).
  const isClosed = effectiveStatus(p.status, p.deadline, p.beginDate) === "closed";
  // 같은 좌표에 N개가 묶이면 배지로 표시 — 헤더 매물 수와 지도가 어긋나 보이지 않게.
  const badge = memberCount > 1 ? `<span class="map-pin-count">${memberCount}</span>` : "";
  el.innerHTML = `<div class="${pinClass(p.type)}${isClosed ? " is-closed" : ""}">${pinLabel(p)}</div>${badge}`;
  return el;
}

function clusterSizeClass(count: number): string {
  if (count >= 50) return "size-lg";
  if (count >= 15) return "size-md";
  return "size-sm";
}

function makeClusterEl(count: number): HTMLElement {
  const el = document.createElement("div");
  el.className = "map-cluster-wrap";
  el.innerHTML = `<div class="map-cluster ${clusterSizeClass(count)}">${count}</div>`;
  return el;
}

function gridStepForZoom(zoom: number): number {
  if (zoom <= 9) return 0.4;
  if (zoom <= 10) return 0.2;
  if (zoom <= 11) return 0.1;
  if (zoom <= 12) return 0.05;
  if (zoom <= 13) return 0.025;
  return 0; // 14 이상은 개별 핀
}

// 같은 좌표(같은 건물·주소)의 여러 매물을 지도에선 대표 1개로 묶는다.
// 든든전세처럼 한 단지 N세대가 호별 매물로 분리돼 같은 좌표에 핀 N개로 쌓이는 걸 방지.
// 리스트/상세 데이터(전체 매물)는 그대로 — 지도 렌더에서만 압축한다.
// repOf: 멤버 매물 id → 대표 매물 id (호버/선택 하이라이트를 깨지지 않게 매핑).
// membersOf: 대표 매물 id → 같은 좌표에 묶인 매물 전체 (배지 수·스택 팝오버용).
function groupPinsByLocation(pins: Listing[]): {
  mapPins: Listing[];
  repOf: Map<string, string>;
  membersOf: Map<string, Listing[]>;
} {
  const buckets = new Map<string, Listing[]>();
  for (const p of pins) {
    const key = `${p.lat.toFixed(6)}|${p.lng.toFixed(6)}`;
    const arr = buckets.get(key);
    if (arr) arr.push(p);
    else buckets.set(key, [p]);
  }
  const mapPins: Listing[] = [];
  const repOf = new Map<string, string>();
  const membersOf = new Map<string, Listing[]>();
  for (const group of buckets.values()) {
    const rep = group[0];
    mapPins.push(rep);
    membersOf.set(rep.id, group);
    for (const p of group) repOf.set(p.id, rep.id);
  }
  return { mapPins, repOf, membersOf };
}

function clusterPins(pins: Listing[], zoom: number): Array<
  | { kind: "single"; pin: Listing }
  | { kind: "cluster"; lat: number; lng: number; pins: Listing[] }
> {
  const step = gridStepForZoom(zoom);
  if (step === 0) return pins.map((pin) => ({ kind: "single", pin }));
  const buckets = new Map<string, Listing[]>();
  for (const p of pins) {
    const ky = Math.floor(p.lat / step);
    const kx = Math.floor(p.lng / step);
    const key = `${ky}|${kx}`;
    const arr = buckets.get(key);
    if (arr) arr.push(p);
    else buckets.set(key, [p]);
  }
  const out: ReturnType<typeof clusterPins> = [];
  for (const group of buckets.values()) {
    if (group.length <= 2) {
      for (const pin of group) out.push({ kind: "single", pin });
      continue;
    }
    const lat = group.reduce((s, p) => s + p.lat, 0) / group.length;
    const lng = group.reduce((s, p) => s + p.lng, 0) / group.length;
    out.push({ kind: "cluster", lat, lng, pins: group });
  }
  return out;
}

export type SearchBounds = {
  swLat: number; swLng: number;
  neLat: number; neLng: number;
};

export function NaverMapView({
  districts,
  districtCounts,
  activeDistrict,
  onDistrictClick,
  onDistrictClear,
  onSearchHere,
  pins,
  hoveredId,
  selectedId,
  onPinHover,
  onPinClick,
  showLegend,
  overlay,
}: {
  districts: District[];
  districtCounts: Record<string, number>;
  activeDistrict: string | null;
  onDistrictClick: (id: string) => void;
  onSearchHere: (bounds: SearchBounds) => void;
  onDistrictClear: () => void;
  pins: Listing[];
  hoveredId: string | null;
  selectedId: string | null;
  onPinHover: (id: string | null) => void;
  onPinClick: (id: string) => void;
  showLegend: boolean;
  overlay?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<NaverMap | null>(null);
  const districtMarkersRef = useRef<NaverMarker[]>([]);
  const pinMarkersRef = useRef<Map<string, { marker: NaverMarker; el: HTMLElement }>>(new Map());
  const clusterMarkersRef = useRef<NaverMarker[]>([]);
  const myLocationMarkerRef = useRef<NaverMarker | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  // 다음 idle 이벤트를 무시하기 위한 플래그 — 프로그래매틱 morph 후 또는 초기 로드 시
  const ignoreNextIdleRef = useRef(true);

  useEffect(() => {
    if (!CLIENT_ID) {
      setLoadError("NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID 가 설정되지 않았습니다");
      return;
    }
    let cancelled = false;
    loadNaverMaps(CLIENT_ID)
      .then(() => {
        if (cancelled || !containerRef.current || !window.naver) return;
        const { naver } = window;
        const map = new naver.maps.Map(containerRef.current, {
          center: new naver.maps.LatLng(KOREA_CENTER.lat, KOREA_CENTER.lng),
          zoom: DEFAULT_ZOOM,
          scaleControl: false,
          logoControl: true,
          mapDataControl: false,
          zoomControl: false,
          mapTypeControl: false,
        });
        // 일부 SDK 빌드/HMR 케이스에서 초기 옵션 무시되는 경우가 있어 한 번 더 강제
        map.setOptions({ zoomControl: false, scaleControl: false, mapDataControl: false, mapTypeControl: false });
        mapRef.current = map;
        naver.maps.Event.addListener(map, "zoom_changed", () => {
          setZoom(map.getZoom());
        });
        // idle 은 pan/zoom 등 모든 움직임이 끝난 뒤 한 번 발생.
        // ignoreNextIdleRef 가 true 면 (초기 로드 / 프로그래매틱 morph 후) 무시.
        naver.maps.Event.addListener(map, "idle", () => {
          if (ignoreNextIdleRef.current) {
            ignoreNextIdleRef.current = false;
            return;
          }
          setHasMoved(true);
        });
        setReady(true);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // District-level aggregate markers (visible only when zoomed out and no district selected)
  const showDistrictMarkers = !activeDistrict && zoom <= 10;
  useEffect(() => {
    if (!ready || !mapRef.current || !window.naver) return;
    const { naver } = window;
    const map = mapRef.current;

    districtMarkersRef.current.forEach((m) => m.setMap(null));
    districtMarkersRef.current = [];

    if (!showDistrictMarkers) return;

    districts.forEach((d) => {
      const count = districtCounts[d.id] ?? 0;
      if (count === 0) return;
      const el = makeDistrictEl(d.id, d.name, count);
      el.addEventListener("click", () => onDistrictClick(d.id));
      const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(d.lat, d.lng),
        map,
        icon: { content: el, anchor: { x: 0, y: 0 } },
        clickable: true,
        // 수도권(서울·인천·경기)처럼 마커가 겹칠 때 큰 카운트가 위로 — 서울이 안 가리게.
        zIndex: count,
      });
      districtMarkersRef.current.push(marker);
    });
  }, [ready, showDistrictMarkers, districtCounts, districts, onDistrictClick]);

  // 같은 좌표 매물은 지도에서 대표 1개로 — 호별 분리 매물이 한 점에 쌓이는 것 방지.
  const { mapPins, repOf, membersOf } = useMemo(() => groupPinsByLocation(pins), [pins]);
  // 같은 좌표에 여러 매물이 묶인 핀 클릭 시 띄울 목록.
  const [stack, setStack] = useState<Listing[] | null>(null);

  // Individual listing pin markers + clustering
  useEffect(() => {
    if (!ready || !mapRef.current || !window.naver) return;
    const { naver } = window;
    const map = mapRef.current;

    pinMarkersRef.current.forEach(({ marker }) => marker.setMap(null));
    pinMarkersRef.current = new Map();
    clusterMarkersRef.current.forEach((m) => m.setMap(null));
    clusterMarkersRef.current = [];

    // zoom <= 10 그리고 시도 미선택 일 때는 district 마커만 — 핀 안 그림
    if (!activeDistrict && zoom <= 10) return;

    // 시도 선택 모드에선 클러스터 없이 모두 개별 핀, 그 외엔 줌 기반 그리드 클러스터
    const groups = clusterPins(mapPins, activeDistrict ? 99 : zoom);
    for (const g of groups) {
      if (g.kind === "single") {
        const p = g.pin;
        const members = membersOf.get(p.id) ?? [p];
        const el = makePinEl(p, members.length);
        el.addEventListener("mouseenter", () => onPinHover(p.id));
        el.addEventListener("mouseleave", () => onPinHover(null));
        // 묶인 매물이 여럿이면 목록을 띄워 고르게, 하나면 바로 상세.
        el.addEventListener("click", () => (members.length > 1 ? setStack(members) : onPinClick(p.id)));
        const marker = new naver.maps.Marker({
          position: new naver.maps.LatLng(p.lat, p.lng),
          map,
          icon: { content: el, anchor: { x: 0, y: 0 } },
          clickable: true,
          zIndex: 2,
        });
        pinMarkersRef.current.set(p.id, { marker, el });
      } else {
        // 클러스터 숫자는 묶인 매물 총수 — 헤더 매물 수와 합이 맞게.
        const total = g.pins.reduce((s, p) => s + (membersOf.get(p.id)?.length ?? 1), 0);
        const el = makeClusterEl(total);
        const lat = g.lat;
        const lng = g.lng;
        el.addEventListener("click", () => {
          map.morph(new naver.maps.LatLng(lat, lng), Math.min(map.getZoom() + 2, 16));
        });
        const marker = new naver.maps.Marker({
          position: new naver.maps.LatLng(lat, lng),
          map,
          icon: { content: el, anchor: { x: 0, y: 0 } },
          clickable: true,
          zIndex: 1,
        });
        clusterMarkersRef.current.push(marker);
      }
    }
  }, [ready, activeDistrict, mapPins, membersOf, zoom, onPinHover, onPinClick]);

  // Sync hovered/selected visual state onto existing pin elements.
  // 멤버 매물 id 는 대표 핀 id 로 변환 — 묶인 세대 중 하나를 가리켜도 대표 핀이 하이라이트됨.
  useEffect(() => {
    const repHovered = hoveredId ? repOf.get(hoveredId) ?? hoveredId : null;
    const repSelected = selectedId ? repOf.get(selectedId) ?? selectedId : null;
    pinMarkersRef.current.forEach(({ el }, id) => {
      el.classList.toggle("hovered", id === repHovered);
      el.classList.toggle("selected", id === repSelected);
    });
  }, [hoveredId, selectedId, repOf]);

  // Pan/zoom to active district
  useEffect(() => {
    if (!ready || !mapRef.current || !window.naver) return;
    const { naver } = window;
    // 프로그래매틱 morph 다음에 발생할 idle 은 무시 — "지도 움직였음" 으로 잡으면 안 됨
    ignoreNextIdleRef.current = true;
    if (activeDistrict) {
      const d = districts.find((x) => x.id === activeDistrict);
      if (d) mapRef.current.morph(new naver.maps.LatLng(d.lat, d.lng), DISTRICT_ZOOM);
    } else {
      mapRef.current.morph(new naver.maps.LatLng(KOREA_CENTER.lat, KOREA_CENTER.lng), DEFAULT_ZOOM);
    }
    setHasMoved(false);
  }, [ready, activeDistrict, districts]);

  // Focus map on selected listing (e.g. when user clicks a card).
  // 이미 화면 안에 보이는 핀이면 카메라를 움직이지 않는다 — morph 애니메이션이 클릭마다 끼어들면서 끊겨 보이는 버벅임 방지.
  useEffect(() => {
    if (!ready || !mapRef.current || !window.naver || !selectedId) return;
    const pin = pins.find((p) => p.id === selectedId);
    if (!pin) return;
    const { naver } = window;
    const map = mapRef.current;
    const target = new naver.maps.LatLng(pin.lat, pin.lng);
    if (map.getBounds().hasLatLng(target)) return;
    const targetZoom = Math.max(map.getZoom(), 15);
    map.morph(target, targetZoom);
  }, [ready, selectedId, pins]);

  const handleLocate = () => {
    if (!navigator.geolocation || !mapRef.current || !window.naver) {
      alert("이 브라우저는 위치 확인을 지원하지 않아요");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const map = mapRef.current;
        if (!map || !window.naver) {
          setLocating(false);
          return;
        }
        const { naver } = window;
        const latlng = new naver.maps.LatLng(latitude, longitude);
        map.morph(latlng, 14);
        if (myLocationMarkerRef.current) {
          myLocationMarkerRef.current.setPosition(latlng);
        } else {
          const el = document.createElement("div");
          el.className = "map-me";
          el.innerHTML = '<div class="map-me-dot"></div><div class="map-me-ring"></div>';
          myLocationMarkerRef.current = new naver.maps.Marker({
            position: latlng,
            map,
            icon: { content: el, anchor: { x: 0, y: 0 } },
            zIndex: 5,
          });
        }
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        const msg =
          err.code === 1
            ? "위치 권한이 차단됐어요. 브라우저 주소창의 자물쇠 → 위치 허용으로 바꿔주세요."
            : "위치를 가져오지 못했어요";
        alert(msg);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <div className="map-wrap">
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      {overlay && <div className="map-overlay-top">{overlay}</div>}

      {/* 같은 위치 매물 N개 — 핀 클릭 시 목록에서 선택 */}
      {stack && stack.length > 1 && (
        <>
          <div className="map-stack-scrim" onClick={() => setStack(null)} />
          <div className="map-stack" role="dialog" aria-label="같은 위치 공고 목록">
            <div className="map-stack-head">
              <span>이 위치 공고 <em>{stack.length}</em>개</span>
              <button type="button" onClick={() => setStack(null)} aria-label="닫기">✕</button>
            </div>
            <div className="map-stack-list">
              {stack.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="map-stack-row"
                  onClick={() => { onPinClick(p.id); setStack(null); }}
                >
                  <span className="map-stack-type">{pinLabel(p)}</span>
                  <span className="map-stack-title">{p.complexName || p.title}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {loadError && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: "var(--seed-scale-color-gray-100)",
            color: "var(--seed-semantic-color-ink-text-low)",
            fontSize: 13,
            textAlign: "center",
          }}
        >
          지도를 불러올 수 없어요
          <br />
          <span style={{ fontSize: 11, marginTop: 4, display: "block" }}>{loadError}</span>
        </div>
      )}

      {hasMoved && ready && (
        <button
          className="map-research"
          onClick={() => {
            const map = mapRef.current;
            if (!map) return;
            const b = map.getBounds();
            const sw = b.getSW();
            const ne = b.getNE();
            onSearchHere({
              swLat: sw.lat(), swLng: sw.lng(),
              neLat: ne.lat(), neLng: ne.lng(),
            });
            setHasMoved(false);
          }}
        >
          이 지역에서 다시 검색
        </button>
      )}

      {!activeDistrict && showLegend && (
        <div className="map-legend">
          <div className="legend-title">모집중 단지 수</div>
          <div className="legend-row">
            <span className="legend-dot sm" style={{ background: "#ff6f0f" }} />
            ~24개
          </div>
          <div className="legend-row">
            <span className="legend-dot" style={{ background: "#ff6f0f" }} />
            25~49개
          </div>
          <div className="legend-row">
            <span className="legend-dot lg" style={{ background: "#ff6f0f" }} />
            50개 이상
          </div>
        </div>
      )}

      <button
        className="map-recenter"
        onClick={handleLocate}
        disabled={locating}
        aria-label={locating ? "위치 찾는 중" : "내 위치로 이동"}
      >
        <LocateIcon size={13} />
        <span className="map-recenter-label">{locating ? "위치 찾는 중…" : "내 위치"}</span>
      </button>
    </div>
  );
}
