"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

// 단지 3D 모형 + 일조. 해를 DirectionalLight 로 두고 실제 그림자를 드리운다.
// 동 배치는 props.site (조감도·공고문 추출, lib/site-layouts) — 없으면 예시(SAMPLE_SITE).
// 브라우저 API 는 전부 useEffect 안에서만 접근 → SSR 안전.

export type Bldg = { id: string; cx: number; cy: number; w: number; d: number; floors: number; tower?: boolean };

const FLOOR_H = 2.9;
const PIL = 4.5; // 필로티 높이
const SAMPLE_ROT = (12 * Math.PI) / 180; // 예시: 남향에서 서쪽으로 12° 돌아간 배치
// 배치 좌표(m) → 씬 원점: 단지 중심
const centerOf = (site: Bldg[]) => {
  const xs = site.map((b) => b.cx), ys = site.map((b) => b.cy);
  return { OX: (Math.min(...xs) + Math.max(...xs)) / 2, OZ: (Math.min(...ys) + Math.max(...ys)) / 2 };
};

const SAMPLE_SITE: Bldg[] = [
  { id: "101", cx: 150, cy: 130, w: 34, d: 12, floors: 25 },
  { id: "102", cx: 160, cy: 200, w: 34, d: 12, floors: 20 },
  { id: "103", cx: 235, cy: 115, w: 42, d: 12, floors: 25 },
  { id: "104", cx: 250, cy: 205, w: 22, d: 20, floors: 30, tower: true },
];

const SEASONS = [
  { day: 355, label: "동지" },
  { day: 80, label: "춘분" },
  { day: 172, label: "하지" },
] as const;
const LEVELS = [
  { key: "high", label: "고층", floor: (n: number) => n - 1 },
  { key: "mid", label: "중층", floor: (n: number) => Math.round(n / 2) },
  { key: "low", label: "저층", floor: () => 3 },
] as const;
type LevelKey = (typeof LEVELS)[number]["key"];

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

// 해 위치 (근사식). clock 은 한국 표준시, 경도·균시차 보정. az: 북=0 시계방향.
function sunPos(lat: number, lng: number, day: number, clock: number) {
  const phi = rad(lat);
  const decl = rad(23.44) * Math.sin((2 * Math.PI * (284 + day)) / 365);
  const B = (2 * Math.PI * (day - 81)) / 364;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const H = rad(15 * (clock + (4 * (lng - 135) + eot) / 60 - 12));
  const alt = Math.asin(Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) + Math.PI;
  return { alt, az };
}

const corners = (b: Bldg, rot: number): [number, number][] => {
  const c = Math.cos(rot), s = Math.sin(rot);
  return ([[-b.w / 2, -b.d / 2], [b.w / 2, -b.d / 2], [b.w / 2, b.d / 2], [-b.w / 2, b.d / 2]] as const).map(
    ([x, y]) => [b.cx + x * c - y * s, b.cy + x * s + y * c],
  );
};
// 고른 동 남쪽 면 가운데 (배치 좌표)
const unitPt = (b: Bldg, rot: number): [number, number] => [b.cx - (b.d / 2 + 0.5) * Math.sin(rot), b.cy + (b.d / 2 + 0.5) * Math.cos(rot)];

function segHit(o: [number, number], dir: [number, number], a: [number, number], b: [number, number]) {
  const [dx, dy] = dir, ex = b[0] - a[0], ey = b[1] - a[1];
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((a[0] - o[0]) * ey - (a[1] - o[1]) * ex) / den;
  const u = ((a[0] - o[0]) * dy - (a[1] - o[1]) * dx) / den;
  return t > 0 && u >= 0 && u <= 1 ? t : null;
}

// 고른 세대 창에 직사광이 드는지 — 창 방향 ±90° 안이고, 다른 동에 가리지 않을 때.
function isLit(site: Bldg[], rot: number, sel: Bldg, floor: number, lat: number, lng: number, day: number, clock: number) {
  const FACADE_AZ = Math.PI + rot; // 남쪽 면이 바라보는 방위
  const s = sunPos(lat, lng, day, clock);
  if (s.alt <= 0) return false;
  const diff = Math.abs(((s.az - FACADE_AZ + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
  if (diff >= Math.PI / 2 - 0.05) return false;
  const o = unitPt(sel, rot), z = (floor - 0.5) * FLOOR_H, dir: [number, number] = [Math.sin(s.az), -Math.cos(s.az)];
  for (const b of site) {
    if (b === sel) continue;
    const pts = corners(b, rot);
    let tMin = Infinity;
    for (let i = 0; i < 4; i++) {
      const t = segHit(o, dir, pts[i], pts[(i + 1) % 4]);
      if (t != null && t < tMin) tMin = t;
    }
    if (tMin < Infinity && z + tMin * Math.tan(s.alt) < b.floors * FLOOR_H) return false;
  }
  return true;
}

const COMPASS = ["북", "북북동", "북동", "동북동", "동", "동남동", "남동", "남남동", "남", "남남서", "남서", "서남서", "서", "서북서", "북서", "북북서"];
const fmtClock = (t: number) => {
  const h = Math.floor(t + 1e-6), m = Math.round((t - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m === 60 ? 0 : m).padStart(2, "0")}`;
};
const T0 = 6, T1 = 19;

type Scene3D = { update: (sel: Bldg, floor: number, day: number, clock: number, lit: boolean) => void; dispose: () => void };

function buildScene(mount: HTMLDivElement, site: Bldg[], rot: number, lat: number, lng: number): Scene3D {
  const ROT = rot;
  const { OX, OZ } = centerOf(site);
  const width = mount.clientWidth, height = Math.round((width * 3) / 4);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  mount.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "none";

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#eaf0f6");
  scene.fog = new THREE.Fog("#eaf0f6", 520, 1100);
  const camera = new THREE.PerspectiveCamera(35, width / height, 1, 3000);
  scene.add(new THREE.HemisphereLight("#f4f7ff", "#9a9080", 1.6));
  const light = new THREE.DirectionalLight("#ffffff", 2.4);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, { left: -260, right: 260, top: 260, bottom: -260, near: 1, far: 1200 });
  light.shadow.bias = -0.0005;
  scene.add(light, light.target);

  const lambert = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  // 모형 대지판: 잔디 판 + 나무 테두리
  const ground = new THREE.Mesh(new THREE.BoxGeometry(360, 3, 320), lambert("#c9d8b6"));
  ground.position.y = -1.5; ground.receiveShadow = true; scene.add(ground);
  const base = new THREE.Mesh(new THREE.BoxGeometry(368, 8, 328), lambert("#c8b596"));
  base.position.y = -5.1; scene.add(base);
  const pathMat = lambert("#e6e9dc");
  for (const [w, d, x, z] of [[340, 8, 0, 8], [8, 300, 32, 0]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), pathMat);
    p.rotation.set(-Math.PI / 2, 0, -ROT); p.position.set(x, 0.05, z); p.receiveShadow = true; scene.add(p);
  }

  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  };
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: number[][], parent: THREE.Object3D) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
    list.forEach((p, i) => { o.position.set(p[0], p[1], p[2]); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.castShadow = im.receiveShadow = true; parent.add(im); return im;
  };
  const label = (text: string, parent: THREE.Object3D, y: number) => {
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 96;
    const g = cv.getContext("2d")!;
    g.fillStyle = "rgba(255,255,255,0.94)"; g.beginPath(); g.roundRect(8, 8, 240, 80, 14); g.fill();
    g.fillStyle = "#161718"; g.font = "700 44px Pretendard, 'Apple SD Gothic Neo', sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 128, 50);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(26, 9.75, 1); sp.position.y = y; sp.renderOrder = 10; parent.add(sp); return sp;
  };

  // 아파트 모형: 필로티 + 본체 + 남측 발코니(슬래브·유리난간) + 세대 구분벽 + 북측 창 + 옥탑
  const models = site.map((b) => {
    const M = { wall: lambert("#f3f1ec"), glass: lambert("#a9c4d8", { transparent: true, opacity: 0.55 }), win: lambert("#7f93a3"), roof: lambert("#8a5a44") };
    const g = new THREE.Group(); g.position.set(b.cx - OX, 0, b.cy - OZ); g.rotation.y = -ROT; scene.add(g);
    const h = b.floors * FLOOR_H, bodyH = h - PIL, UNIT = b.tower ? b.w / 2 : 8.5;
    box(b.w, bodyH, b.d - 1.6, M.wall, 0, PIL + bodyH / 2, -0.8, g);
    const cols: number[][] = [];
    for (let x = -b.w / 2 + 0.6; x <= b.w / 2 - 0.5; x += UNIT) for (const z of [-b.d / 2 + 0.6, b.d / 2 - 2.2]) cols.push([x, PIL / 2, z]);
    inst(new THREE.BoxGeometry(0.7, PIL, 0.7), M.wall, cols, g);
    box(5, PIL, 6, M.wall, 0, PIL / 2, -2, g);
    const slabs: number[][] = [], glass: number[][] = [], wins: number[][] = [], fins: number[][] = [];
    for (let f = 1; f < b.floors - 1; f++) {
      const y = PIL + (f - 1) * FLOOR_H;
      slabs.push([0, y + 0.12, b.d / 2 - 0.8]); glass.push([0, y + 0.8, b.d / 2 - 0.1]);
      for (let x = -b.w / 2 + UNIT / 2; x < b.w / 2; x += UNIT) wins.push([x, y + 1.6, -b.d / 2 - 0.02]);
    }
    for (let x = -b.w / 2; x <= b.w / 2 + 0.01; x += UNIT) fins.push([x, PIL + bodyH / 2, b.d / 2 - 0.8]);
    inst(new THREE.BoxGeometry(b.w, 0.24, 1.6), M.wall, slabs, g);
    inst(new THREE.BoxGeometry(b.w - 0.4, 1.1, 0.08), M.glass, glass, g);
    inst(new THREE.BoxGeometry(0.35, bodyH, 1.7), M.wall, fins, g);
    inst(new THREE.BoxGeometry(UNIT * 0.45, 1.2, 0.1), M.win, wins, g);
    box(b.w, 1.1, 0.3, M.wall, 0, h + 0.55, b.d / 2 - 1.75, g);
    box(b.w, 1.1, 0.3, M.wall, 0, h + 0.55, -b.d / 2 + 0.15, g);
    box(5.5, 4.2, 6.5, M.wall, 0, h + 2.1, -2, g);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 5.2, 2.6, 4, 1), M.roof);
    roof.rotation.y = Math.PI / 4; roof.position.set(0, h + 5.5, -2); roof.scale.set(1, 1, 1.2); roof.castShadow = true; g.add(roof);
    const tag = label(`${b.id}동`, g, h + 12);
    return { b, M, tag };
  });

  // 조경: 모형 나무 (고정 시드 — 새로고침해도 같은 자리)
  const inBldg = (x: number, z: number) => site.some((b) => Math.abs(x - (b.cx - OX)) < b.w / 2 + 6 && Math.abs(z - (b.cy - OZ)) < b.d / 2 + 6);
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const trees: number[][] = [];
  while (trees.length < 90) {
    const x = -168 + rnd() * 336, z = -148 + rnd() * 296;
    if (!inBldg(x, z) && Math.abs(z - 8) > 7 && Math.abs(x - 32) > 7) trees.push([x, 0, z]);
  }
  inst(new THREE.SphereGeometry(3.4, 14, 10), lambert("#7fa36b"), trees.filter((_, i) => i % 3).map(([x, , z]) => [x, 6.2, z]), scene);
  inst(new THREE.SphereGeometry(2.6, 12, 8), lambert("#a4bd8f"), trees.filter((_, i) => !(i % 3)).map(([x, , z]) => [x, 5.2, z]), scene);
  inst(new THREE.CylinderGeometry(0.4, 0.5, 3, 5), lambert("#7a6250"), trees.map(([x, , z]) => [x, 1.5, z]), scene);

  const unit = new THREE.Mesh(new THREE.BoxGeometry(6, FLOOR_H * 0.8, 1), new THREE.MeshBasicMaterial());
  scene.add(unit);
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 16), new THREE.MeshBasicMaterial({ color: "#ffb020" }));
  scene.add(sunBall);
  const north = new THREE.Mesh(new THREE.ConeGeometry(6, 16, 3), new THREE.MeshBasicMaterial({ color: "#202122" }));
  north.rotation.x = -Math.PI / 2; north.position.set(160, 1, -140); scene.add(north);

  // 카메라: 고른 동을 중심으로 궤도. 드래그로 회전.
  const view = { yaw: rad(-25), pitch: rad(24), dist: 300 };
  let focus = new THREE.Vector3(-10, 20, 0), anim = 0, selId = "";
  const place = () => {
    camera.position.set(
      focus.x + view.dist * Math.cos(view.pitch) * Math.sin(view.yaw),
      focus.y + view.dist * Math.sin(view.pitch),
      focus.z + view.dist * Math.cos(view.pitch) * Math.cos(view.yaw),
    );
    camera.lookAt(focus);
  };
  const draw = () => renderer.render(scene, camera);
  let drag: { x: number; y: number } | null = null;
  const el = renderer.domElement;
  const onDown = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); };
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    view.yaw -= (e.clientX - drag.x) * 0.008;
    view.pitch = Math.max(rad(12), Math.min(rad(85), view.pitch + (e.clientY - drag.y) * 0.006));
    drag = { x: e.clientX, y: e.clientY }; place(); draw();
  };
  const onUp = () => { drag = null; };
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  const onResize = () => {
    const w = mount.clientWidth, h2 = Math.round((w * 3) / 4);
    renderer.setSize(w, h2); camera.aspect = w / h2; camera.updateProjectionMatrix(); draw();
  };
  const ro = new ResizeObserver(onResize);
  ro.observe(mount);
  place();

  return {
    update(sel, floor, day, clock, lit) {
      // 한 동씩: 고른 동만 진하게, 나머지는 흐리게(그림자는 그대로)
      if (sel.id !== selId) {
        selId = sel.id;
        for (const { b, M, tag } of models) {
          const on = b === sel;
          for (const m of [M.wall, M.win, M.roof]) { m.transparent = !on; m.opacity = on ? 1 : 0.16; m.depthWrite = on; }
          M.glass.opacity = on ? 0.55 : 0.08;
          tag.material.opacity = on ? 1 : 0.35;
        }
        const to = new THREE.Vector3(sel.cx - OX, sel.floors * FLOOR_H * 0.45, sel.cy - OZ), from = focus.clone(), t0 = performance.now();
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        cancelAnimationFrame(anim);
        const step = (now: number) => {
          const k = reduce ? 1 : Math.min(1, (now - t0) / 500), e = 1 - Math.pow(1 - k, 3);
          focus = from.clone().lerp(to, e); place(); draw();
          if (k < 1) anim = requestAnimationFrame(step);
        };
        anim = requestAnimationFrame(step);
      }
      const s = sunPos(lat, lng, day, clock), up = Math.max(s.alt, rad(0.5));
      const dir = new THREE.Vector3(Math.sin(s.az) * Math.cos(up), Math.sin(up), -Math.cos(s.az) * Math.cos(up));
      light.position.copy(dir.clone().multiplyScalar(600));
      light.intensity = s.alt > 0 ? 2.4 : 0; light.castShadow = s.alt > 0;
      sunBall.visible = s.alt > 0; sunBall.position.copy(dir.clone().multiplyScalar(330));
      const p = unitPt(sel, ROT);
      unit.position.set(p[0] - OX, (floor - 0.5) * FLOOR_H, p[1] - OZ); unit.rotation.y = -ROT;
      unit.material.color.set(lit ? "#ffb020" : "#202122");
      draw();
    },
    dispose() {
      cancelAnimationFrame(anim); ro.disconnect();
      el.removeEventListener("pointerdown", onDown); el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerup", onUp);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        mats.forEach((mt) => { (mt as THREE.SpriteMaterial).map?.dispose(); mt.dispose(); });
      });
      renderer.dispose(); el.remove();
    },
  };
}

export function SiteSun3D({ lat, lng, site: siteProp, rot: rotProp }: { lat: number; lng: number; site?: Bldg[]; rot?: number }) {
  const site = siteProp ?? SAMPLE_SITE;
  const rot = rotProp ?? (siteProp ? 0 : SAMPLE_ROT);
  const FACADE_AZ = Math.PI + rot;
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene3D | null>(null);
  const [bid, setBid] = useState(site[0].id);
  // site 가 바뀌면(다른 공고) 첫 동으로
  useEffect(() => { setBid(site[0].id); }, [site]);
  const [lvl, setLvl] = useState<LevelKey>("low");
  const [day, setDay] = useState<number>(355);
  const [clock, setClock] = useState(14);

  const sel = site.find((b) => b.id === bid) ?? site[0];
  const floor = LEVELS.find((l) => l.key === lvl)!.floor(sel.floors);
  const sun = sunPos(lat, lng, day, clock);
  const litNow = isLit(site, rot, sel, floor, lat, lng, day, clock);

  // 하루 햇빛 구간 (5분 간격)
  const { runs, total } = useMemo(() => {
    const runs: [number, number][] = [];
    let start: number | null = null, total = 0;
    const step = 1 / 12;
    for (let t = T0; t <= T1 + 1e-9; t += step) {
      const on = isLit(site, rot, sel, floor, lat, lng, day, t);
      if (on) { total += step; if (start == null) start = t; }
      else if (start != null) { runs.push([start, t]); start = null; }
    }
    if (start != null) runs.push([start, T1]);
    return { runs, total };
  }, [site, rot, sel, floor, lat, lng, day]);

  useEffect(() => {
    if (!mountRef.current) return;
    const s = buildScene(mountRef.current, site, rot, lat, lng);
    sceneRef.current = s;
    return () => { s.dispose(); sceneRef.current = null; };
  }, [site, rot, lat, lng]);

  useEffect(() => {
    sceneRef.current?.update(sel, floor, day, clock, litNow);
  }, [sel, floor, day, clock, litNow]);

  const h = Math.floor(total), m = Math.round(((total - h) * 60) / 10) * 10;
  const season = SEASONS.find((s) => s.day === day)!.label;
  const pct = (t: number) => `${((t - T0) / (T1 - T0)) * 100}%`;
  const sunR = 26 * Math.cos(sun.alt) + 2;

  return (
    <div className="ss3d">
      <div className="ss3d-chips" role="group" aria-label="동 고르기">
        {site.map((b) => (
          <button key={b.id} type="button" aria-pressed={b.id === bid} onClick={() => setBid(b.id)}>
            {b.id}동<small>{b.floors}층{b.tower ? " · 탑상형" : ""}</small>
          </button>
        ))}
      </div>

      <div className="ss3d-stage">
        <div ref={mountRef} className="ss3d-canvas" role="img" aria-label="단지 3D 모형과 그림자. 드래그해서 돌려볼 수 있어요." />
        <div className="ss3d-hud">
          <div className="ss3d-card">
            <span className="ss3d-label">{season} 하루 직사광 · {bid}동 {floor}층</span>
            <span className="ss3d-hours">
              {total < 1 / 12 ? <>0<small>시간</small></> : <>{h}<small>시간</small>{m}<small>분</small></>}
            </span>
          </div>
          <div className="ss3d-card ss3d-sun">
            <svg viewBox="-32 -32 64 64" aria-hidden>
              <circle r={28} fill="none" stroke="#0000001a" strokeWidth={1.5} />
              <text y={-14} textAnchor="middle" fontSize={9} fontWeight={700} fill="#202122">N</text>
              <line x2={16 * Math.sin(FACADE_AZ)} y2={-16 * Math.cos(FACADE_AZ)} stroke="#1e84ff" strokeWidth={3} strokeLinecap="round" />
              {sun.alt > 0 && <circle cx={sunR * Math.sin(sun.az)} cy={-sunR * Math.cos(sun.az)} r={5} fill="#ffb020" />}
              <circle r={2.5} fill="#202122" />
            </svg>
            <div>
              해 방향<b>{sun.alt > 0 ? `${COMPASS[Math.round(deg(sun.az) / 22.5) % 16]} ${Math.round(deg(sun.az))}°` : "해 없음"}</b>
              높이<b>{sun.alt > 0 ? `${Math.round(deg(sun.alt))}°` : "-"}</b>
            </div>
          </div>
        </div>
        <div className="ss3d-floors" role="group" aria-label="층 고르기">
          {LEVELS.map((l) => (
            <button key={l.key} type="button" aria-pressed={l.key === lvl} onClick={() => setLvl(l.key)}>
              {l.label}<b>{l.floor(sel.floors)}층</b>
            </button>
          ))}
        </div>
        <span className="ss3d-badge">{siteProp ? "추정 배치" : "예시 배치"} · 드래그해서 돌려보기</span>
      </div>

      <div className="ss3d-dock">
        <div className="ss3d-dock-top">
          <div className="ss3d-seg" role="group" aria-label="계절">
            {SEASONS.map((s) => (
              <button key={s.day} type="button" aria-pressed={s.day === day} onClick={() => setDay(s.day)}>{s.label}</button>
            ))}
          </div>
          <output className="ss3d-time">{fmtClock(clock)}</output>
        </div>
        <div className="ss3d-scrub">
          <div className="ss3d-track" aria-hidden>
            {runs.map(([a, b]) => <span key={a} style={{ left: pct(a), width: `${((b - a) / (T1 - T0)) * 100}%` }} />)}
          </div>
          <input type="range" min={T0} max={T1} step={1 / 6} value={clock} aria-label="시각" onChange={(e) => setClock(+e.target.value)} />
        </div>
        <div className="ss3d-axis">
          {[6, 9, 12, 15, 19].map((t) => <span key={t} style={{ left: pct(t) }}>{t}시</span>)}
        </div>
      </div>
      <p className="ss3d-note">
        {siteProp
          ? "동 위치·층수는 조감도와 공고문에서 뽑은 추정값이에요. 방위는 정남향으로 가정했어요."
          : "동 배치·층수는 예시예요."}
      </p>
    </div>
  );
}
