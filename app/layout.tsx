import type { Metadata } from "next";
import "./globals.css";
// Figma 디자인 시스템 컬러 전역 테스트 오버라이드 (원복: 이 줄 제거)
import "./tips/figma-theme.css";

export const metadata: Metadata = {
  title: "공공임대주택 부동산",
  description: "행복주택·국민임대·통합공공임대 공고를 한눈에",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        {/* Material Symbols Rounded — next/font/google 미지원 (variable axes 가 특수).
           CDN link 로 전체 폰트 로드 — 캐시되니까 첫 visit 외엔 부담 없음.
           display=block 으로 폰트 로드 전 ligature 텍스트 노출 방지. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-25..200&display=block"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
