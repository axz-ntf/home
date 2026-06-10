"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { FloorPlanSpec, MaterialRef } from "@/lib/floorplan-spec";

// 스펙(JSON) → 3D 씬. 코드는 여기 한 곳에만 있고, 공고별로 바뀌는 건 spec 데이터뿐.
// 브라우저 API는 전부 useEffect 안에서만 접근 → SSR 안전.
export default function FloorPlan3D({ spec, height = 520 }: { spec: FloorPlanSpec; height?: number }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<{ toggleWall: () => void; toggleSpin: () => void; topView: () => void } | null>(null);
  const [lowWall, setLowWall] = useState(false);
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = spec.meta.widthMm / 1000;
    const D = spec.meta.depthMm / 1000;
    const H = spec.meta.wallHeightMm / 1000;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xefe9df);
    scene.fog = new THREE.Fog(0xefe9df, 18, 40);

    let width = mount.clientWidth || 800;
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const target = new THREE.Vector3(W / 2, 0.4, D / 2);

    // 조명
    scene.add(new THREE.AmbientLight(0xfff6e8, 0.55));
    const sun = new THREE.DirectionalLight(0xfff2dd, 0.95);
    sun.position.set(7, 10, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 8, bottom: -8 });
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xdde6ff, 0.3);
    fill.position.set(-6, 6, -4);
    scene.add(fill);

    // 절차적 텍스처
    function makeTexture(draw: (g: CanvasRenderingContext2D) => void, rx = 1, ry = 1) {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      draw(c.getContext("2d")!);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
      return t;
    }
    const woodTex = makeTexture((g) => {
      g.fillStyle = "#d9b282";
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? "#d2a974" : "#dfba8c";
        g.fillRect(i * 32, 0, 32, 256);
        g.strokeStyle = "rgba(140,100,60,.35)";
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(i * 32, 0);
        g.lineTo(i * 32, 256);
        g.stroke();
        for (let j = 0; j < 3; j++) {
          g.strokeStyle = "rgba(150,110,70,.18)";
          // 결정적 줄무늬 — Math.random 회피(SSR/재현성).
          const y = ((i * 37 + j * 53) % 256);
          g.beginPath();
          g.moveTo(i * 32, y);
          g.lineTo(i * 32 + 32, y);
          g.stroke();
        }
      }
    }, 2, 5);
    const tileTex = makeTexture((g) => {
      g.fillStyle = "#b9bcc0";
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = "#9fa3a8";
      g.lineWidth = 2;
      for (let i = 0; i <= 4; i++) {
        g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke();
        g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke();
      }
    }, 3, 3);
    const entryTex = makeTexture((g) => {
      g.fillStyle = "#cdd1d5";
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = "#b3b8bd";
      g.lineWidth = 2;
      for (let i = 0; i <= 2; i++) {
        g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 256); g.stroke();
        g.beginPath(); g.moveTo(0, i * 128); g.lineTo(256, i * 128); g.stroke();
      }
    }, 2, 2);

    const named: Record<string, THREE.MeshStandardMaterial> = {
      wall: new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.9 }),
      wood: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8 }),
      tile: new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.6 }),
      entry: new THREE.MeshStandardMaterial({ map: entryTex, roughness: 0.7 }),
      white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.5 }),
      door: new THREE.MeshStandardMaterial({ color: 0xc8a06a, roughness: 0.7 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xbcd8e6, transparent: true, opacity: 0.4, roughness: 0.1 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x9aa2a8, roughness: 0.3, metalness: 0.6 }),
    };
    const custom: THREE.MeshStandardMaterial[] = [];
    function mat(ref: MaterialRef): THREE.MeshStandardMaterial {
      if (typeof ref === "string") return named[ref] ?? named.white;
      const m = new THREE.MeshStandardMaterial({ color: ref.color, roughness: ref.roughness ?? 0.7, metalness: ref.metalness ?? 0 });
      custom.push(m);
      return m;
    }

    const geos: THREE.BufferGeometry[] = [];
    function boxGeo(w: number, h: number, d: number) {
      const g = new THREE.BoxGeometry(w, h, d);
      geos.push(g);
      return g;
    }

    // 바닥
    for (const f of spec.floors) {
      const m = new THREE.Mesh(boxGeo(f.w, 0.05, f.d), mat(f.material));
      m.position.set(f.x + f.w / 2, (f.y ?? 0) - 0.025, f.z + f.d / 2);
      m.receiveShadow = true;
      scene.add(m);
    }
    // 대지(그림자 받침)
    const groundGeo = new THREE.PlaneGeometry(40, 40);
    geos.push(groundGeo);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: 0xe7e0d3, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.06;
    ground.receiveShadow = true;
    scene.add(ground);

    // 벽
    const walls = new THREE.Group();
    scene.add(walls);
    for (const w of spec.walls) {
      const h = w.h ?? H;
      const m = new THREE.Mesh(boxGeo(w.w, h, w.d), named.wall);
      m.position.set(w.x + w.w / 2, (w.y ?? 0) + h / 2, w.z + w.d / 2);
      m.castShadow = m.receiveShadow = true;
      walls.add(m);
    }
    // 유리
    for (const g of spec.glass) {
      const m = new THREE.Mesh(boxGeo(g.w, g.h, g.d), named.glass);
      m.position.set(g.cx, g.cy, g.cz);
      walls.add(m);
    }
    // 문
    for (const d of spec.doors) {
      const pivot = new THREE.Group();
      pivot.position.set(d.hingeX, 0, d.hingeZ);
      const panel = new THREE.Mesh(boxGeo(d.w, d.h, 0.045), named.door);
      panel.position.set(d.w / 2, d.h / 2, 0);
      panel.castShadow = true;
      pivot.add(panel);
      pivot.rotation.y = d.angle;
      walls.add(pivot);
    }
    // 가구/설비
    for (const f of spec.fixtures) {
      const m = new THREE.Mesh(boxGeo(f.w, f.h, f.d), mat(f.material));
      m.position.set(f.x + f.w / 2, f.y + f.h / 2, f.z + f.d / 2);
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
    }
    // 라벨
    const labelTextures: THREE.CanvasTexture[] = [];
    for (const l of spec.labels) {
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 160;
      const g = c.getContext("2d")!;
      g.font = '700 64px "Apple SD Gothic Neo","Noto Sans KR",sans-serif';
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "rgba(255,253,248,.88)";
      const tw = g.measureText(l.text).width;
      if (g.roundRect) g.roundRect(256 - tw / 2 - 28, 24, tw + 56, 112, 20);
      else g.rect(256 - tw / 2 - 28, 24, tw + 56, 112);
      g.fill();
      g.fillStyle = "#3a342c";
      g.fillText(l.text, 256, 84);
      const t = new THREE.CanvasTexture(c);
      labelTextures.push(t);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
      sprite.scale.set(1.45, 0.45, 1);
      sprite.position.set(l.x, l.y ?? 1.55, l.z);
      sprite.renderOrder = 10;
      scene.add(sprite);
    }

    // 카메라 오빗
    let theta = -0.7, phi = 0.95, radius = Math.max(W, D) * 1.4 + 3;
    let spin = false, dragging = false, px = 0, py = 0, pinch = 0;
    let wallScale = 1, wallTarget = 1;
    function applyCam() {
      phi = Math.max(0.12, Math.min(Math.PI / 2 - 0.05, phi));
      radius = Math.max(3.5, Math.min(25, radius));
      camera.position.set(
        target.x + radius * Math.sin(phi) * Math.sin(theta),
        target.y + radius * Math.cos(phi),
        target.z + radius * Math.sin(phi) * Math.cos(theta),
      );
      camera.lookAt(target);
    }
    const dom = renderer.domElement;
    const onDown = (e: PointerEvent) => { dragging = true; px = e.clientX; py = e.clientY; };
    const onUp = () => { dragging = false; };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      theta -= (e.clientX - px) * 0.006;
      phi -= (e.clientY - py) * 0.005;
      px = e.clientX; py = e.clientY;
      applyCam();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      radius *= 1 + Math.sign(e.deltaY) * 0.08;
      applyCam();
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2)
        pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dd = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        radius *= pinch / dd;
        pinch = dd;
        applyCam();
      }
    };
    dom.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointermove", onMove);
    dom.addEventListener("wheel", onWheel, { passive: false });
    dom.addEventListener("touchstart", onTouchStart, { passive: true });
    dom.addEventListener("touchmove", onTouchMove, { passive: true });

    // 외부(React 버튼)에서 조작
    ctrlRef.current = {
      toggleWall: () => { wallTarget = wallTarget < 1 ? 1 : 0.32; },
      toggleSpin: () => { spin = !spin; },
      topView: () => { theta = 0; phi = 0.14; radius = Math.max(W, D) * 1.5 + 2; applyCam(); },
    };

    const ro = new ResizeObserver(() => {
      width = mount.clientWidth || width;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    ro.observe(mount);

    applyCam();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (spin && !dragging) { theta += 0.004; applyCam(); }
      wallScale += (wallTarget - wallScale) * 0.12;
      walls.scale.y = wallScale;
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      dom.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointermove", onMove);
      dom.removeEventListener("wheel", onWheel);
      dom.removeEventListener("touchstart", onTouchStart);
      dom.removeEventListener("touchmove", onTouchMove);
      geos.forEach((g) => g.dispose());
      Object.values(named).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      custom.forEach((m) => m.dispose());
      labelTextures.forEach((t) => t.dispose());
      renderer.dispose();
      if (dom.parentNode === mount) mount.removeChild(dom);
      ctrlRef.current = null;
    };
  }, [spec, height]);

  return (
    <div style={{ position: "relative", width: "100%", height, borderRadius: 12, overflow: "hidden", background: "#efe9df" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 6 }}>
        <FpButton
          on={lowWall}
          label={lowWall ? "벽 올리기" : "벽 낮추기"}
          onClick={() => { ctrlRef.current?.toggleWall(); setLowWall((v) => !v); }}
        />
        <FpButton
          on={spinning}
          label="자동 회전"
          onClick={() => { ctrlRef.current?.toggleSpin(); setSpinning((v) => !v); }}
        />
        <FpButton on={false} label="위에서 보기" onClick={() => ctrlRef.current?.topView()} />
      </div>
      <div style={{
        position: "absolute", bottom: 10, right: 12, fontSize: 11, color: "#8a7f6f",
        background: "rgba(255,253,248,.85)", border: "1px solid #d8cfc0", borderRadius: 8, padding: "5px 9px",
      }}>
        {spec.meta.widthMm.toLocaleString()} × {spec.meta.depthMm.toLocaleString()} mm · 벽고 {spec.meta.wallHeightMm.toLocaleString()}
      </div>
    </div>
  );
}

function FpButton({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        font: "inherit", fontSize: 12, padding: "6px 10px", borderRadius: 7, cursor: "pointer",
        border: `1px solid ${on ? "#b5754a" : "#d8cfc0"}`,
        background: on ? "#b5754a" : "#fff",
        color: on ? "#fff" : "#2b2620",
      }}
    >
      {label}
    </button>
  );
}
