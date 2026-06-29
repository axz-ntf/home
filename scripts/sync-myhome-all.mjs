#!/usr/bin/env node
// 마이홈 전국 임대주택 + 공공분양 모집공고 수집
// 결과:
//   lib/myhome-rental-notices.json
//   lib/myhome-sale-notices.json
//   lib/myhome-all-notices.json
//
// 사용: DATA_GO_KR_KEY 설정 후 node scripts/sync-myhome-all.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env.local");
const RENTAL_OUT = path.join(ROOT, "lib/myhome-rental-notices.json");
const SALE_OUT = path.join(ROOT, "lib/myhome-sale-notices.json");
const ALL_OUT = path.join(ROOT, "lib/myhome-all-notices.json");

const MYHOME_BASE = "https://www.myhome.go.kr";
const SALE_LIST_URL = `${MYHOME_BASE}/hws/portal/sch/selectLttotHouseList.do`;
const SALE_VIEW_URL = `${MYHOME_BASE}/hws/portal/sch/selectLttotHouseView.do`;

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36",
  Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 공공데이터/마이홈 서버는 간헐적 connect timeout(UND_ERR_CONNECT_TIMEOUT)·5xx 가 잦다.
// 네트워크 throw / 5xx 는 지수 백오프 재시도, 4xx 응답은 호출 측 .ok 처리로 그대로 반환.
async function fetchWithRetry(url, init, label) {
  const MAX = 4;
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.status >= 500 && attempt < MAX) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      if (attempt >= MAX) throw new Error(`${label}: ${attempt}회 시도 실패 — ${error.message}`);
      const wait = 1000 * 2 ** (attempt - 1); // 1s → 2s → 4s
      console.log(`${label} 재시도 ${attempt}/${MAX} (${error.message}) — ${wait}ms 대기`);
      await sleep(wait);
    }
  }
}

async function loadEnvFile() {
  if (process.env.DATA_GO_KR_KEY) return;
  const text = await fs.readFile(ENV_PATH, "utf8").catch(() => "");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    process.env[key] = raw.replace(/^["']|["']$/g, "");
  }
}

function compactObject(value) {
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== null && item !== undefined && item !== "") out[key] = item;
  }
  return out;
}

function yyyymmdd(value) {
  if (!value || String(value).length !== 8) return "";
  const s = String(value);
  return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`;
}

function rentalDetailUrl(item) {
  return item.pcUrl || `${MYHOME_BASE}/hws/portal/sch/selectRsdtRcritNtcDetailView.do?pblancId=${item.pblancId ?? ""}${item.houseSn != null ? `&houseSn=${item.houseSn}` : ""}`;
}

function saleDetailUrl(item) {
  return `${MYHOME_BASE}/hws/portal/sch/selectLttotHouseDetailView.do?pblancId=${item.pblancId ?? ""}`;
}

function normalizeRental(item) {
  return compactObject({
    sourceKind: "rental",
    id: `rental-${item.pblancId ?? "unknown"}-${item.houseSn ?? 0}`,
    pblancId: String(item.pblancId ?? ""),
    houseSn: item.houseSn ?? null,
    status: item.sttusNm ?? "",
    progressStatus: item.endDe ? "" : item.sttusNm ?? "",
    title: item.hsmpNm || item.pblancNm || "",
    noticeTitle: item.pblancNm || "",
    housingType: item.suplyTyNm || "",
    houseType: item.houseTyNm || "",
    provider: item.suplyInsttNm || "",
    sido: item.brtcNm || "",
    sigungu: item.signguNm || "",
    address: item.fullAdres || "",
    pnu: item.pnu || "",
    totalUnits: item.totHshldCo ?? null,
    supplyUnits: item.sumSuplyCo ?? null,
    depositWon: item.rentGtn ?? null,
    monthlyRentWon: item.mtRntchrg ?? null,
    beginDate: yyyymmdd(item.beginDe),
    endDate: yyyymmdd(item.endDe),
    announceDate: yyyymmdd(item.rcritPblancDe),
    winnerDate: yyyymmdd(item.przwnerPresnatnDe),
    sourceUrl: item.url || "",
    detailUrl: rentalDetailUrl(item),
    mobileUrl: item.mobileUrl || "",
    raw: item,
  });
}

function normalizeSale(item) {
  return compactObject({
    sourceKind: "sale",
    id: `sale-${item.pblancId ?? "unknown"}`,
    pblancId: String(item.pblancId ?? ""),
    status: item.sttusNm ?? "",
    progressStatus: item.prgrStts ?? "",
    title: item.pblancNm || "",
    noticeTitle: item.pblancNm || "",
    housingType: "공공분양",
    houseType: item.houseTyNm || "",
    provider: item.suplyInsttNm || item.prvateInsttNm || "",
    sido: item.brtcCodeNm || "",
    regionCount: item.brtcCount ?? null,
    announceDate: yyyymmdd(item.rcritPblancDe),
    winnerDate: yyyymmdd(item.przwnerPresnatnDe),
    moveInNote: item.mvnPresnatnEra || "",
    guidance: item.guidanceCn || "",
    result: item.resultCn || "",
    sourceUrl: item.url || "",
    detailUrl: saleDetailUrl(item),
    attachmentId: item.atchFileId || "",
    raw: item,
  });
}

async function fetchRentalPage(pageNo, numOfRows = 100) {
  const key = process.env.DATA_GO_KR_KEY;
  if (!key) throw new Error("DATA_GO_KR_KEY 가 .env.local 또는 환경변수에 없습니다.");
  const url = new URL("https://apis.data.go.kr/1613000/HWSPR02/rsdtRcritNtcList");
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("_type", "json");
  url.searchParams.set("numOfRows", String(numOfRows));
  url.searchParams.set("pageNo", String(pageNo));
  const response = await fetchWithRetry(url, undefined, `임대 ${pageNo}p`);
  if (!response.ok) throw new Error(`rental page ${pageNo}: HTTP ${response.status}`);
  const json = await response.json();
  const body = json.response?.body ?? {};
  return {
    total: Number(body.totalCount ?? 0),
    items: Array.isArray(body.item) ? body.item : body.item ? [body.item] : [],
  };
}

async function fetchAllRentals() {
  const all = [];
  const pageSize = 100;
  for (let page = 1; ; page++) {
    const { total, items } = await fetchRentalPage(page, pageSize);
    all.push(...items);
    console.log(`임대 ${page}p: ${items.length}건 (${all.length}/${total})`);
    if (all.length >= total || items.length === 0) break;
    await sleep(250);
  }
  const deduped = new Map();
  for (const item of all) {
    deduped.set(`${item.pblancId}-${item.houseSn ?? 0}`, item);
  }
  return [...deduped.values()].map(normalizeRental);
}

async function fetchSalePage(pageIndex) {
  const body = new URLSearchParams({
    pageIndex: String(pageIndex),
    srchbrtcCode: "",
    srchsignguCode: "",
    srchHouseTy: "",
    srchSuplyPrvuseAr: "",
    srchPrgrStts: "",
    srchPblancNm: "",
    srchLttotPblancDeYearMtBegin: "",
    srchLttotPblancDeYearMtEnd: "",
  });
  const response = await fetchWithRetry(SALE_LIST_URL, {
    method: "POST",
    headers: {
      ...BROWSER_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: SALE_VIEW_URL,
    },
    body,
  }, `분양 ${pageIndex}p`);
  if (!response.ok) throw new Error(`sale page ${pageIndex}: HTTP ${response.status}`);
  return response.json();
}

async function fetchAllSales() {
  const all = [];
  let total = 0;
  for (let page = 1; ; page++) {
    const json = await fetchSalePage(page);
    const items = Array.isArray(json.resultList) ? json.resultList : [];
    total = Number(json.resultCnt ?? total);
    all.push(...items);
    console.log(`분양 ${page}p: ${items.length}건 (${all.length}/${total || "?"})`);
    if (items.length === 0 || (total && all.length >= total)) break;
    await sleep(180);
  }
  const deduped = new Map();
  for (const item of all) deduped.set(String(item.pblancId), item);
  return [...deduped.values()].map(normalizeSale);
}

async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`저장: ${path.relative(ROOT, file)} (${data.length}건)`);
}

// 실패한 소스는 기존 파일을 그대로 재사용(빈 배열로 덮어쓰지 않음 → 데이터 유실 방지).
async function readExisting(file) {
  try {
    const v = JSON.parse(await fs.readFile(file, "utf8"));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

async function main() {
  await loadEnvFile();

  // 마이홈/공공데이터 서버가 종종 connect timeout 으로 죽는다. 한 소스가 실패해도
  // 전체 파이프라인(LH API·SH·청년·조감도 등 후속 단계)이 멈추지 않도록 각각 graceful 처리.
  let rentals, rentalsFailed = false;
  try {
    console.log("마이홈 전국 임대 모집공고 수집...");
    rentals = await fetchAllRentals();
  } catch (e) {
    console.error(`⚠️ 임대 수집 실패 — 기존 데이터 유지: ${e.message}`);
    rentals = await readExisting(RENTAL_OUT);
    rentalsFailed = true;
  }

  let sales, salesFailed = false;
  try {
    console.log("\n마이홈 전국 공공분양 모집공고 수집...");
    sales = await fetchAllSales();
  } catch (e) {
    console.error(`⚠️ 분양 수집 실패 — 기존 데이터 유지: ${e.message}`);
    sales = await readExisting(SALE_OUT);
    salesFailed = true;
  }

  const all = [...rentals, ...sales].sort((a, b) =>
    (b.announceDate || "").localeCompare(a.announceDate || ""),
  );
  if (!rentalsFailed) await writeJson(RENTAL_OUT, rentals);
  if (!salesFailed) await writeJson(SALE_OUT, sales);
  await writeJson(ALL_OUT, all);
  const note = rentalsFailed || salesFailed ? " (일부 소스 실패 — 기존 데이터로 보완)" : "";
  console.log(`\n완료: 임대 ${rentals.length}건 + 분양 ${sales.length}건 = 총 ${all.length}건${note}`);

  // 둘 다 실패면 진짜 문제 — 비정상 종료로 알림(부분 실패는 통과).
  if (rentalsFailed && salesFailed) {
    console.error("❌ 임대·분양 모두 수집 실패 — 마이홈/공공데이터 서버 점검 필요");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
