// listings-api.json 의 각 listing 에 대해 LH 페이지에서 "단지조감도" 만 추출 → 다운로드.
// 기존 로직(파일명 첫 8자리를 날짜로 추정) 이 잘못된 평면도/배치도를 가져오던 버그 수정.
//
// LH 페이지 구조:
//   - HTML 안 `list.push("{cmnAhflSn=..., slPanAhflDsCdNm=단지조감도, ...}")` 문자열로 이미지 메타 직렬화
//   - 실제 다운로드 경로는 `POST /lhapply/getFilePath.do` 로 cmnAhflSn 보내면 받음
//   - 최종 URL: https://apply.lh.or.kr/upload + cmnAhflPth + cmnPhyAhflNm  (Referer 필수)
//
// 우선순위: 단지조감도 > 지역조감도 (그 외는 cover 로 부적절해서 제외)
//
// 환경변수:
//   FORCE_RECRAWL=1  → 기존 coverPhotoLocal 무시하고 전체 재크롤링
//   SKIP_REGIONAL=1  → scope === "regional" 인 매물 건너뜀 (기본 on)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = path.join(ROOT, "lib/listings-api.json");
const OUT_DIR = path.join(ROOT, "public/lh-covers");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 doongji-app/1.0";
const LH_BASE = "https://apply.lh.or.kr";
const DELAY_MS = 400;
const FORCE = process.env.FORCE_RECRAWL === "1";
const SKIP_REGIONAL = process.env.SKIP_REGIONAL !== "0";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// HTML 안 `list.push("{k=v, k=v, ...}")` 문자열들을 객체 배열로 파싱.
// LH 페이지 형식이 두 종류 (분양 / 잔여세대) — 필드명도 다르고 description 안에 콤마/HTML 도 포함.
// split(", ") 대신 "다음 key= 패턴" 까지를 value 로 잡아 더 견고하게.
function parseLooseObject(body) {
  const obj = {};
  const keyRe = /(?:^|,\s+)([a-zA-Z][a-zA-Z0-9]*)=/g;
  const matches = [...body.matchAll(keyRe)];
  for (let i = 0; i < matches.length; i++) {
    const key = matches[i][1];
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : body.length;
    const value = body.slice(start, end).trim();
    obj[key] = value === "null" || value === "" ? null : value;
  }
  return obj;
}

function extractImageEntries(html) {
  const entries = [];
  // 비탐욕 매칭 + `}");` 종결자로 description 안의 `}` 와 구분
  const re = /list\.push\("\{([\s\S]*?)\}"\)\s*;/g;
  let m;
  while ((m = re.exec(html))) {
    const obj = parseLooseObject(m[1]);
    if (obj.cmnAhflSn) entries.push(obj);
  }
  return entries;
}

// 단지조감도 > 지역조감도 만 선택. 페이지 형식 차이로 라벨 필드명이 둘 (slPanAhflDsCdNm / lsSplInfUplFlDsCdNm)
// 또는 ahflDesc 에 들어가는 경우도 있어 셋 다 확인.
function findByCategory(entries, label) {
  return entries.find((e) =>
    e.slPanAhflDsCdNm === label ||
    e.lsSplInfUplFlDsCdNm === label ||
    e.ahflDesc === label
  );
}

function pickIllustration(entries) {
  return findByCategory(entries, "단지조감도") ||
         findByCategory(entries, "지역조감도") ||
         null;
}

// cmnAhflSn → 실제 다운로드 URL 해석.
async function resolveFilePath(cmnAhflSn, referer) {
  const res = await fetch(`${LH_BASE}/lhapply/getFilePath.do`, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: referer,
    },
    body: `cmnAhflSn=${encodeURIComponent(cmnAhflSn)}`,
  });
  if (!res.ok) return null;
  let json;
  try { json = await res.json(); } catch { return null; }
  if (!json?.cmnAhflPth || !json?.cmnPhyAhflNm) return null;
  return `${LH_BASE}/upload${json.cmnAhflPth}${json.cmnPhyAhflNm}`;
}

async function downloadImage(url, referer, destPath) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Referer: referer } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 10000) throw new Error(`too small (${buf.length}B)`);
  // 컨텐츠 시작이 HTML 이면 오류 페이지
  const head = buf.slice(0, 10).toString("utf8");
  if (head.startsWith("<!DOCTYPE") || head.startsWith("<html")) throw new Error("html error page");
  fs.writeFileSync(destPath, buf);
  return buf.length;
}

async function main() {
  const listings = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));

  let targets = listings.filter((l) => l.sourceUrl && l.sourceUrl.includes("selectWrtancInfo.do"));
  if (SKIP_REGIONAL) targets = targets.filter((l) => l.scope !== "regional");
  if (!FORCE) targets = targets.filter((l) => !l.coverPhotoLocal);

  console.log(`mode: FORCE=${FORCE} SKIP_REGIONAL=${SKIP_REGIONAL}`);
  console.log(`target listings: ${targets.length} / total ${listings.length}`);

  let ok = 0, noImg = 0, fail = 0;
  for (const [i, l] of targets.entries()) {
    const prefix = `[${i + 1}/${targets.length}] ${l.id}`;
    try {
      const res = await fetch(l.sourceUrl, { headers: { "User-Agent": UA } });
      if (!res.ok) { fail++; console.warn(`${prefix} page HTTP ${res.status}`); await sleep(DELAY_MS); continue; }
      const html = await res.text();

      const entries = extractImageEntries(html);
      const pick = pickIllustration(entries);
      if (!pick) {
        // 조감도 없으면 기존 사진 정리 (옛 잘못된 평면도 등이 남지 않게)
        if (FORCE) { l.coverPhotoLocal = null; l.coverPhotoUrl = null; }
        noImg++;
        await sleep(DELAY_MS);
        continue;
      }

      const url = await resolveFilePath(pick.cmnAhflSn, l.sourceUrl);
      await sleep(200);
      if (!url) { fail++; await sleep(DELAY_MS); continue; }

      const ext = (url.match(/\.(png|jpe?g)$/i) || ["", "jpg"])[1].toLowerCase();
      const fn = `${l.id}.${ext === "jpeg" ? "jpg" : ext}`;
      const dest = path.join(OUT_DIR, fn);
      try {
        const size = await downloadImage(url, l.sourceUrl, dest);
        l.coverPhotoLocal = `/lh-covers/${fn}`;
        l.coverPhotoUrl = url;
        ok++;
        if (ok % 10 === 0) console.log(`${prefix} ✓ ${pick.slPanAhflDsCdNm} (${(size / 1024).toFixed(0)}KB)`);
      } catch (e) {
        fail++;
        if (fail < 5) console.warn(`${prefix} download fail: ${e.message}`);
      }
    } catch (e) {
      fail++;
      if (fail < 5) console.warn(`${prefix} error: ${e.message}`);
    }
    await sleep(DELAY_MS);
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(listings, null, 2));
  console.log("---");
  console.log({ ok, noImg, fail, total: targets.length });
  console.log(`saved → ${DATA_PATH}`);
  console.log(`images → ${OUT_DIR}`);
}

export { main };

// 직접 실행할 때만 자동 구동 (sync-lh-api 가 import 할 땐 호출 안 함)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
