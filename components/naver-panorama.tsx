"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { loadNaverMaps } from "@/lib/naver-loader";
import type { NaverPanorama as NaverPanoramaInstance } from "@/lib/naver-types";

const CLIENT_ID = process.env.NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID;

export function NaverPanorama({
  lat,
  lng,
  fallback,
}: {
  lat: number;
  lng: number;
  fallback?: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panoRef = useRef<NaverPanoramaInstance | null>(null);
  const latRef = useRef(lat);
  const lngRef = useRef(lng);
  latRef.current = lat;
  lngRef.current = lng;
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  // SDK 로드 + 파노라마 인스턴스 1회 생성 (마운트 시). 좌표 변화는 아래 effect 가 setPosition으로 처리.
  useEffect(() => {
    if (!CLIENT_ID) {
      setFailed(true);
      return;
    }
    let cancelled = false;

    loadNaverMaps(CLIENT_ID)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const naver = window.naver;
        if (!naver?.maps?.Panorama) {
          setFailed(true);
          return;
        }
        try {
          const pano = new naver.maps.Panorama(containerRef.current, {
            position: new naver.maps.LatLng(latRef.current, lngRef.current),
            pov: { pan: 0, tilt: 5, fov: 100 },
            flightSpot: false,
            logoControl: false,
            zoomControl: true,
            aroundControl: true,
          });
          panoRef.current = pano;

          naver.maps.Event.addListener(pano, "pano_changed", () => {
            const id = pano.getPanoId?.();
            setFailed(!id);
            setLoading(false);
          });
        } catch (e) {
          console.error("Naver panorama init failed", e);
          setFailed(true);
        }
      })
      .catch((e) => {
        console.error("Naver SDK load failed", e);
        setFailed(true);
      });

    return () => {
      cancelled = true;
      if (panoRef.current?.destroy) {
        try {
          panoRef.current.destroy();
        } catch {
          /* ignore */
        }
      }
      panoRef.current = null;
    };
  }, []);

  // 좌표 변경 시 인스턴스 재사용 — setPosition 만 호출
  useEffect(() => {
    const pano = panoRef.current;
    const naver = window.naver;
    if (!pano || !naver?.maps?.LatLng) return;
    try {
      pano.setPosition(new naver.maps.LatLng(lat, lng));
    } catch (e) {
      console.error("Naver panorama setPosition failed", e);
      setFailed(true);
    }
  }, [lat, lng]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          visibility: failed ? "hidden" : "visible",
        }}
      />
      {failed && (
        <div style={{ position: "absolute", inset: 0 }}>{fallback ?? null}</div>
      )}
      {!failed && loading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--dds-background-base)",
            color: "var(--dds-text-quaternary)",
            fontSize: "var(--dds-typography-label-normal-size)",
            pointerEvents: "none",
          }}
        >
          거리뷰 불러오는 중…
        </div>
      )}
    </div>
  );
}
