import type { Metadata } from "next";
import Script from "next/script";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";

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
      <body>
        {children}
        {/* DDS icons and controls use the same pinned snapshot as globals.css. */}
        <Script
          src="/vendor/dds/dds.js"
          strategy="afterInteractive"
        />
      </body>
      <GoogleAnalytics gaId="G-X690DWC31H" />
    </html>
  );
}
