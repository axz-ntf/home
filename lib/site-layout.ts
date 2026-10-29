// 단지 동 배치 (lib/site-layouts/{id}.json, scripts/extract-site-layout.mjs 가 생성) 의 server-side 로더.
// client 에 직접 import 금지 (fs 의존) — /api/site-layout/[id] 로 받는다.
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "lib/site-layouts");

export type SiteLayoutBuilding = {
  id: string;
  type: "판상형" | "탑상형" | "저층";
  floors: number;
  x: number; // 0~1, 왼→오른
  y: number; // 0~1, 뒤(위)→앞(아래)
  widthRel: number;
  note?: string | null;
};

export type SiteLayout = {
  id: string;
  fromNotice: { dongCount: number | null; maxFloors: number | null; units: number | null };
  buildings: SiteLayoutBuilding[];
  confidence: "high" | "medium" | "low";
};

export function getSiteLayout(id: string): SiteLayout | null {
  if (!/^[\w-]+$/.test(id)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, `${id}.json`), "utf8")) as SiteLayout;
  } catch {
    return null;
  }
}
