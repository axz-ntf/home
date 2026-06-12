import type { HousingTypeId } from "./types";

export const SEOUL_MAP_SVG = `
<svg viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="grid" width="4" height="4" patternUnits="userSpaceOnUse">
      <path d="M 4 0 L 0 0 0 4" fill="none" stroke="rgba(0,0,0,.025)" stroke-width=".2"/>
    </pattern>
    <linearGradient id="landGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f4f6ee"/>
      <stop offset="100%" stop-color="#eaf1e3"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" fill="url(#landGrad)"/>
  <rect width="100" height="100" fill="url(#grid)"/>
  <path d="M -2,56 Q 12,52 22,56 Q 34,62 44,58 Q 54,52 62,54 Q 72,56 80,58 Q 90,60 102,58 L 102,64 Q 90,66 80,64 Q 72,62 62,60 Q 54,58 44,62 Q 34,66 22,62 Q 12,58 -2,62 Z"
        fill="#cce3f4" stroke="#a8d3ee" stroke-width=".3"/>
  <g fill="none" stroke="rgba(0,0,0,.08)" stroke-width=".15" stroke-dasharray="0.6 0.4">
    <path d="M 0,30 L 25,28 L 30,12 L 42,8 L 50,22 L 60,18 L 70,10 L 78,20 L 80,35 L 90,40 L 95,30 L 100,38" />
    <path d="M 10,48 L 18,50 L 25,55 L 36,48 L 42,54 L 52,48 L 60,50 L 65,42 L 72,48 L 80,52 L 90,48" />
    <path d="M 0,72 L 15,68 L 22,76 L 35,72 L 44,76 L 52,70 L 60,76 L 68,70 L 78,74 L 90,72 L 100,78" />
    <path d="M 20,88 L 32,90 L 44,86 L 55,90 L 66,88 L 78,92 L 88,88" />
  </g>
  <g fill="rgba(68,76,92,.55)" font-size="2.2" font-family="Pretendard, sans-serif" font-weight="500" text-anchor="middle">
    <text x="30" y="20">은평</text>
    <text x="50" y="30">종로</text>
    <text x="65" y="26">성북</text>
    <text x="75" y="16">노원</text>
    <text x="32" y="46">마포</text>
    <text x="52" y="50">용산</text>
    <text x="62" y="50">성동</text>
    <text x="72" y="52">광진</text>
    <text x="30" y="64">영등포</text>
    <text x="45" y="68">동작</text>
    <text x="70" y="68">강남</text>
    <text x="80" y="66">송파</text>
    <text x="88" y="56">강동</text>
    <text x="40" y="80">관악</text>
    <text x="30" y="84">금천</text>
    <text x="58" y="74">서초</text>
  </g>
</svg>
`;

export function thumbnailSVG(seed: number, type: HousingTypeId): string {
  const palettes: Record<HousingTypeId, string[]> = {
    happy: ["#ffd2b9", "#ffbc97", "#ff9e66", "#cc4700"],
    nation: ["#d2edfa", "#87d7ff", "#57c7ff", "#0088cc"],
    integ: ["#c7f2e4", "#96ebc3", "#6adeac", "#077a5e"],
    perm: ["#e5dafa", "#c4b0f0", "#a384e0", "#5b3aa0"],
    buy: ["#fae3c7", "#f5c987", "#e8a847", "#a86c0a"],
    jeonse: ["#cce6ff", "#7fb8ff", "#3d8fff", "#0a4bb8"],
    fifty: ["#e0e6ed", "#a6b0bd", "#6e7886", "#2c333d"],
    sale: ["#ffe2e7", "#ffb0bd", "#ff6f87", "#b00029"],
    youth: ["#c9f5e4", "#86e8c2", "#3fd49b", "#0a8f63"],
  };
  const p = palettes[type] ?? palettes.happy;
  const [sky, bg, fg, ac] = p;
  const variant = seed % 3;
  let buildings: string;
  if (variant === 0) {
    buildings = `
      <rect x="10" y="40" width="28" height="55" fill="${fg}" rx="1"/>
      <rect x="44" y="28" width="24" height="67" fill="${bg}" rx="1"/>
      <rect x="74" y="48" width="20" height="47" fill="${fg}" rx="1"/>
      <g fill="${ac}" opacity=".75">
        ${[46, 54, 62, 70, 78]
          .flatMap((y) => [14, 20, 26, 32].map((x) => `<rect x="${x}" y="${y}" width="3" height="3"/>`))
          .join("")}
        ${[34, 42, 50, 58, 66, 74, 82]
          .flatMap((y) => [48, 54, 60].map((x) => `<rect x="${x}" y="${y}" width="3" height="3"/>`))
          .join("")}
        ${[54, 62, 70, 78]
          .flatMap((y) => [78, 84].map((x) => `<rect x="${x}" y="${y}" width="3" height="3"/>`))
          .join("")}
      </g>
    `;
  } else if (variant === 1) {
    buildings = `
      <polygon points="8,95 24,35 40,95" fill="${fg}"/>
      <polygon points="35,95 52,22 68,95" fill="${bg}"/>
      <polygon points="62,95 78,45 94,95" fill="${fg}"/>
      <g fill="${ac}" opacity=".7">
        ${[50, 60, 70, 80].map((y) => `<circle cx="24" cy="${y}" r="1.2"/>`).join("")}
        ${[38, 48, 58, 68, 78].map((y) => `<circle cx="52" cy="${y}" r="1.2"/>`).join("")}
        ${[58, 68, 78].map((y) => `<circle cx="78" cy="${y}" r="1.2"/>`).join("")}
      </g>
    `;
  } else {
    buildings = `
      <rect x="5"  y="50" width="18" height="45" fill="${bg}"/>
      <rect x="25" y="35" width="20" height="60" fill="${fg}"/>
      <rect x="47" y="20" width="22" height="75" fill="${bg}"/>
      <rect x="71" y="42" width="16" height="53" fill="${fg}"/>
      <rect x="89" y="55" width="10" height="40" fill="${bg}"/>
      <g fill="${ac}" opacity=".75">
        ${[58, 66, 74].flatMap((y) => [8, 14].map((x) => `<rect x="${x}" y="${y}" width="2" height="2"/>`)).join("")}
        ${[42, 50, 58, 66].flatMap((y) => [28, 34, 40].map((x) => `<rect x="${x}" y="${y}" width="2" height="2"/>`)).join("")}
        ${[28, 36, 44, 52, 60, 68].flatMap((y) => [50, 56, 62].map((x) => `<rect x="${x}" y="${y}" width="2" height="2"/>`)).join("")}
        ${[48, 58, 68].flatMap((y) => [74, 80].map((x) => `<rect x="${x}" y="${y}" width="2" height="2"/>`)).join("")}
      </g>
    `;
  }
  return `
    <svg viewBox="0 0 100 95" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax slice" style="overflow:hidden;background:${sky}">
      <rect width="100" height="95" fill="${sky}"/>
      <circle cx="78" cy="18" r="6" fill="#fff" opacity=".6"/>
      ${buildings}
    </svg>
  `;
}
