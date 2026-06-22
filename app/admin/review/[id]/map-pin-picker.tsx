"use client";

// SH 좌표를 손으로 찍는 모달 (P1 보조) — 지도를 클릭하면 그 지점의 위/경도를 잡아
// 편집기 행에 채워준다. 주소검색·숫자입력 없이 "지도에서 바로 찍기".
// 메인앱과 동일한 네이버 지도 SDK(loadNaverMaps) 재사용.

import { useEffect, useRef, useState } from "react";
import { loadNaverMaps } from "@/lib/naver-loader";
import type { NaverMarker, NaverLatLng } from "@/lib/naver-types";

const CLIENT_ID = process.env.NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID;
const SEOUL = { lat: 37.5665, lng: 126.978 };

export default function MapPinPicker({
  initialLat,
  initialLng,
  label,
  onPick,
  onClose,
}: {
  initialLat: number | null;
  initialLng: number | null;
  label?: string;
  onPick: (lat: number, lng: number) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(
    initialLat != null && initialLng != null ? { lat: initialLat, lng: initialLng } : null,
  );
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!CLIENT_ID) {
      setErr("NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID 가 설정되지 않았습니다");
      return;
    }
    let cancelled = false;
    let marker: NaverMarker | null = null;
    loadNaverMaps(CLIENT_ID)
      .then(() => {
        if (cancelled || !containerRef.current || !window.naver) return;
        const { naver } = window;
        const start = initialLat != null && initialLng != null ? { lat: initialLat, lng: initialLng } : SEOUL;
        const map = new naver.maps.Map(containerRef.current, {
          center: new naver.maps.LatLng(start.lat, start.lng),
          zoom: initialLat != null ? 16 : 12,
          zoomControl: true,
          mapTypeControl: false,
          scaleControl: false,
          logoControl: false,
          mapDataControl: false,
        });
        marker = new naver.maps.Marker({ position: new naver.maps.LatLng(start.lat, start.lng), map });
        // 지도 클릭 → 그 지점으로 마커 이동 + 좌표 캡처.
        naver.maps.Event.addListener(map, "click", (...args: unknown[]) => {
          const coord = (args[0] as { coord: NaverLatLng }).coord;
          const lat = coord.lat();
          const lng = coord.lng();
          marker?.setPosition(coord);
          setPicked({ lat, lng });
        });
      })
      .catch((e) => setErr((e as Error).message));
    return () => {
      cancelled = true;
      marker?.setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="a-mappick-backdrop" onClick={onClose}>
      <div className="a-mappick" onClick={(e) => e.stopPropagation()}>
        <header className="a-mappick-head">
          <strong>지도에서 위치 클릭{label ? ` — ${label}` : ""}</strong>
          <button type="button" onClick={onClose} aria-label="닫기">×</button>
        </header>
        {err ? (
          <div className="a-mappick-err">{err}</div>
        ) : (
          <div ref={containerRef} className="a-mappick-map" />
        )}
        <footer className="a-mappick-foot">
          <span className="a-mappick-coord">
            {picked ? `${picked.lat.toFixed(6)}, ${picked.lng.toFixed(6)}` : "지도를 클릭해 핀을 찍으세요"}
          </span>
          <button
            type="button"
            className="a-btn primary sm"
            disabled={!picked}
            onClick={() => {
              if (picked) {
                onPick(picked.lat, picked.lng);
                onClose();
              }
            }}
          >
            이 위치로
          </button>
        </footer>
      </div>
    </div>
  );
}
