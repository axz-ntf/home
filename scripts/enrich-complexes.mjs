// LH 공고 페이지에서 단지별 "주택형 안내" 표를 추출해 매물에 complexes[] 로 저장.
// 한 공고에 여러 단지가 포함된 케이스 (시흥시 10년 공공임대 = 시흥목감 A-3 + A-4) 까지 분리.
// 단일 단지 매물도 같은 구조 (complexes 길이 1) 라 일관된 디테일 노출.

import fs from "node:fs";
import { applyComplexTables } from "./lib/lh-official-tables.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = path.join(ROOT, "lib/listings-api.json");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 daum-public-housing-app/1.0";
const DELAY_MS = 300;
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 5);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 페이지에서 단지 단위로 (제목 h4.tit2 + 직후 주택형 안내 표) 추출.
// 구조 예:
//   <h4 class="tit2 mgt0">시흥목감A-3(공임리츠) A-3</h4>
//   ...
//   <h4 class="tit2">주택형 안내(공공임대)</h4>
//   <table>...</table>
//   <h4 class="tit2 mgt0">시흥목감A-4(공임리츠) 1</h4>
//   <h4 class="tit2">주택형 안내(공공임대)</h4>
//   <table>...</table>
// 페이지 안의 lat_N / lng_N 변수를 인덱스 → 좌표 맵으로 모음.
async function main() {
  const listings = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  // --active: 모집중/예정(마감 안 지난) 공고만. 마감건은 단지표 채워도 노출 안 돼 무의미.
  const ACTIVE = process.argv.includes("--active");
  const TODAY = new Date().toISOString().slice(0, 10).replace(/-/g, ".");
  const targets = listings.filter(
    (l) =>
      l.scope !== "regional" &&
      l.sourceUrl &&
      l.sourceUrl.includes("selectWrtancInfo.do") &&
      (!ACTIVE || ((l.status === "open" || l.status === "upcoming") && (l.deadline || "") >= TODAY))
  );
  console.log(`targets: ${targets.length} / total ${listings.length}`);

  let ok = 0, empty = 0, multi = 0, fail = 0;
  let nextIdx = 0;
  async function worker(wid) {
    while (true) {
      const i = nextIdx++;
      if (i >= targets.length) return;
      const l = targets[i];
      try {
        const res = await fetch(l.sourceUrl, { headers: { "User-Agent": UA } });
        if (!res.ok) { fail++; continue; }
        const html = await res.text();
        if (!applyComplexTables(l, html)) { empty++; continue; }
        const complexes = l.complexes;
        ok++;
        if (complexes.length > 1) multi++;
        if (ok % 20 === 0) console.log(`[${i + 1}/${targets.length}] w${wid} ${l.id} ✓ ${complexes.length}개`);
      } catch (e) {
        fail++;
        if (fail < 5) console.warn(`[${i + 1}] w${wid} ${l.id} error: ${e.message}`);
      }
      await sleep(DELAY_MS);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, w) => worker(w + 1)));

  fs.writeFileSync(DATA_PATH, JSON.stringify(listings, null, 2));
  console.log("---");
  console.log({ ok, empty, multi, fail, total: targets.length });
  if (fail) throw new Error(`${fail}개 공식 상세 수집 실패 — 검증 미완료`);
}

main().catch((e) => { console.error(e); process.exit(1); });
