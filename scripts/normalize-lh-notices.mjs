#!/usr/bin/env node
// LH 공고만 추출 + 정규화
// 입력: lib/myhome-all-notices.json  (sync-myhome-all.mjs 결과)
// 출력:
//   lib/lh-notices-all.json — 정규화된 LH 공고 전체
//   (인덱스는 콘솔 요약으로만 출력 — lh-notices-index.json 은 reader 가 없어 제거)

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const IN_PATH = path.join(ROOT, "lib/myhome-all-notices.json");
const OUT_NOTICES = path.join(ROOT, "lib/lh-notices-all.json");

const HOUSING_CATEGORY = {
  공공분양: "분양",
  국민임대: "임대",
  행복주택: "임대",
  영구임대: "임대",
  매입임대: "임대",
  전세임대: "임대",
  "50년임대": "임대",
};

const HOUSING_TYPE_ID = {
  공공분양: "sale",
  국민임대: "nation",
  행복주택: "happy",
  영구임대: "perm",
  매입임대: "buy",
  전세임대: "jeonse",
  "50년임대": "fifty",
};

function parseYmdDot(s) {
  if (!s || s.length !== 10) return null;
  const d = new Date(`${s.slice(0, 4)}-${s.slice(5, 7)}-${s.slice(8, 10)}T00:00:00+09:00`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function daysBetween(a, b) {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

function computeActiveStatus(begin, end, today) {
  const b = parseYmdDot(begin);
  const e = parseYmdDot(end);
  if (b && today < b) return "upcoming";
  if (e && today > e) return "closed";
  if (e) {
    const left = daysBetween(e, today);
    if (left <= 3) return "closing";
  }
  if (b || e) return "open";
  return "open";
}

function normalize(item, today) {
  const housingType = item.housingType || "";
  const category = HOUSING_CATEGORY[housingType] ?? (item.sourceKind === "sale" ? "분양" : "임대");
  const typeId = HOUSING_TYPE_ID[housingType] ?? "integ";

  const begin = item.beginDate || "";
  const end = item.endDate || "";
  const activeStatus = computeActiveStatus(begin, end, today);
  const endDate = parseYmdDot(end);
  const daysToDeadline = endDate ? daysBetween(endDate, today) : null;

  const houseSn = item.houseSn ?? null;
  const id =
    item.sourceKind === "sale"
      ? `lh-sale-${item.pblancId}`
      : `lh-rental-${item.pblancId}-${houseSn ?? 0}`;

  return {
    id,
    pblancId: item.pblancId,
    houseSn,
    category,
    typeId,
    housingType,
    houseType: item.houseType || "",
    title: item.title || item.noticeTitle || "",
    noticeTitle: item.noticeTitle || item.title || "",
    provider: "LH",
    sido: item.sido || "",
    sigungu: item.sigungu || "",
    address: item.address || "",
    pnu: item.pnu || "",
    totalUnits: item.totalUnits ?? null,
    supplyUnits: item.supplyUnits ?? null,
    depositWon: item.depositWon ?? null,
    monthlyRentWon: item.monthlyRentWon ?? null,
    depositManwon: item.depositWon != null ? Math.round(item.depositWon / 10000) : null,
    monthlyRentManwon: item.monthlyRentWon != null ? Math.round(item.monthlyRentWon / 10000) : null,
    announceDate: item.announceDate || "",
    beginDate: begin,
    endDate: end,
    winnerDate: item.winnerDate || "",
    noticeStatus: item.status || "",
    progressStatus: item.progressStatus || "",
    activeStatus,
    daysToDeadline,
    sourceUrl: item.sourceUrl || "",
    detailUrl: item.detailUrl || "",
    mobileUrl: item.mobileUrl || "",
    attachmentId: item.attachmentId || "",
  };
}

function activeRank(status) {
  return { closing: 0, open: 1, upcoming: 2, closed: 3 }[status] ?? 4;
}

function compareNotices(a, b) {
  const ra = activeRank(a.activeStatus);
  const rb = activeRank(b.activeStatus);
  if (ra !== rb) return ra - rb;
  return (b.announceDate || "").localeCompare(a.announceDate || "");
}

function buildIndex(notices) {
  const byCategory = {};
  const byHousingType = {};
  const bySido = {};
  const byActive = {};
  for (const n of notices) {
    byCategory[n.category] = (byCategory[n.category] || 0) + 1;
    byHousingType[n.housingType] = (byHousingType[n.housingType] || 0) + 1;
    bySido[n.sido || "(미상)"] = (bySido[n.sido || "(미상)"] || 0) + 1;
    byActive[n.activeStatus] = (byActive[n.activeStatus] || 0) + 1;
  }
  return {
    total: notices.length,
    generatedAt: new Date().toISOString(),
    byCategory,
    byHousingType,
    bySido,
    byActiveStatus: byActive,
  };
}

async function loadPrior() {
  try {
    const arr = JSON.parse(await fs.readFile(OUT_NOTICES, "utf8"));
    const map = new Map();
    for (const item of arr) map.set(item.id, item);
    return map;
  } catch {
    return new Map();
  }
}

async function main() {
  const raw = JSON.parse(await fs.readFile(IN_PATH, "utf8"));
  const today = new Date();
  const lh = raw.filter((x) => x.provider === "LH");
  const prior = await loadPrior();

  const normalized = lh
    .map((x) => {
      const fresh = normalize(x, today);
      const old = prior.get(fresh.id);
      if (!old) return fresh;
      // enrichment 결과(좌표, details, photos, geocoded 플래그) 보존
      if (old.lat && old.lng) {
        fresh.lat = old.lat;
        fresh.lng = old.lng;
      }
      if (old.details) fresh.details = old.details;
      if (old.photos?.length) fresh.photos = old.photos;
      if (old.geocoded) fresh.geocoded = old.geocoded;
      return fresh;
    })
    .sort(compareNotices);

  await fs.writeFile(OUT_NOTICES, JSON.stringify(normalized, null, 2) + "\n", "utf8");
  console.log(
    `저장: ${path.relative(ROOT, OUT_NOTICES)} (${normalized.length}건, 이전 enrichment 보존: ${prior.size}건)`,
  );

  const index = buildIndex(normalized);
  console.log("\n=== 정규화 결과 요약 ===");
  console.log(`총 LH 공고: ${index.total}`);
  console.log("\n카테고리:");
  Object.entries(index.byCategory)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, c]) => console.log(`  ${c.toString().padStart(4)}  ${k}`));
  console.log("\n주택유형:");
  Object.entries(index.byHousingType)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, c]) => console.log(`  ${c.toString().padStart(4)}  ${k}`));
  console.log("\n활성 상태:");
  Object.entries(index.byActiveStatus)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, c]) => console.log(`  ${c.toString().padStart(4)}  ${k}`));
  console.log("\n지역(상위 5):");
  Object.entries(index.bySido)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([k, c]) => console.log(`  ${c.toString().padStart(4)}  ${k}`));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
