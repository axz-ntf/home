import type { NextConfig } from "next";

// Catalog files are selected from a registry at runtime, so trace them explicitly.
// The 66 MB LH complex cache remains local-only under the existing global exclusion.
const housingCatalogFiles = [
  "./lib/listings-api.json", "./lib/lh-notices-all.json", "./lib/sh-notices.json",
  "./lib/youth-notices.json", "./lib/youth-complexes.json", "./lib/_sync-meta.json",
  "./lib/housing-data-notes.json",
];

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // 구 자동도메인(doongji-liard.vercel.app)으로 들어온 요청을 새 도메인으로 영구 리다이렉트.
  // host 조건이라 새 도메인(daum-public-housing) 요청은 매칭 안 됨 → 루프 없음.
  async rewrites() { return { beforeFiles: [{source:"/notice-files/:filename",destination:"/api/admin/notice-files/:filename"}] }; },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "doongji-liard.vercel.app" }],
        destination: "https://public-housing-map.vercel.app/:path*",
        permanent: true,
      },
    ];
  },
  outputFileTracingIncludes: {
    "/admin/data": [...housingCatalogFiles, "./lib/notice-information/**/*.json", "./lib/notice-locations/**/*.json"],
    "/admin/data/**": [...housingCatalogFiles, "./lib/notice-information/**/*.json", "./lib/notice-locations/**/*.json"],
    "/api/admin/housing-data/**": housingCatalogFiles,
    "/admin/review/*": ["./lib/notice-information/**/*.json"],
    "/admin/automation": ["./lib/notice-information/**/*.json"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "apply.lh.or.kr",
        pathname: "/lhapply/lhFile.do",
      },
      {
        protocol: "https",
        hostname: "www.kohom.or.kr",
      },
    ],
  },
  // 서버 함수 번들 size 줄이기 — pdf-parse / sharp 등은 sync 스크립트 전용,
  // 런타임 함수 (api/*) 와 무관. 데이터 디렉토리도 동적 require 만이라 명시적 제외.
  outputFileTracingExcludes: {
    "/api/chat": [
      "node_modules/pdf-parse/**/*",
      "node_modules/sharp/**/*",
      "node_modules/typescript/**/*",
      "lib/notice-texts/**/*",
      "lib/notice-embeddings/vectors.bin",
      "public/lh-covers/**/*",
      "scripts/**/*",
      ".next/cache/**/*",
    ],
    "/api/eligibility/**": [
      "node_modules/pdf-parse/**/*",
      "node_modules/sharp/**/*",
      "lib/notice-texts/**/*",
      "lib/notice-embeddings/**/*",
      "public/lh-covers/**/*",
      "scripts/**/*",
    ],
    "*": [
      "node_modules/pdf-parse/**/*",
      "node_modules/sharp/**/*",
      "lib/notice-texts/**/*",
      "public/lh-covers/**/*",
      "scripts/**/*",
      // sync 스크립트 전용 대형 데이터 — 런타임 함수 미사용인데 트레이싱에 끌려와
      // 함수 크기 한도 초과로 배포 실패 (lh-complexes 66MB 등). 명시적 제외.
      "lib/lh-complexes.json",
      "lib/myhome-all-notices.json",
      "lib/myhome-sale-notices.json",
      "lib/notice-embeddings/vectors.bin",
    ],
  },
};

export default nextConfig;
