#!/usr/bin/env node
// 1차 enrich-lh-details.mjs 에서 빠진 항목 보강
// - apply.lh.or.kr/LH/index.html?gv_param=...PAN_ID:0000060466,... 패턴을
//   표준 selectWrtancInfo.do?panId=xxx URL 로 변환 후 동일 추출 적용

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_PATH = path.join(ROOT, "lib/lh-notices-all.json");

const HEADERS = {
  "User-Agent": "daum-public-housing-app/1.0 (LH detail enricher; polite crawler; 1req/s)",
  Accept: "text/html",
};
const DELAY_MS = 700;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseLegacyUrl(url) {
  if (!url) return null;
  if (!url.includes("apply.lh.or.kr/LH/index.html")) return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const gv = u.searchParams.get("gv_param") || "";
  const params = Object.fromEntries(
    gv.split(",").map((pair) => {
      const [k, v] = pair.split(":");
      return [k?.trim() ?? "", v?.trim() ?? ""];
    }),
  );
  const panId = params.PAN_ID;
  if (!panId) return null;
  const c2 = params.CCR_CNNT_SYS_DS_CD || "02";
  // 분양은 보통 mi=1027, 업무코드 디폴트 추정
  return `https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?panId=${panId}&ccrCnntSysDsCd=${c2}&uppAisTpCd=05&aisTpCd=05&mi=1027`;
}

function extractAllCoords(html) {
  const coords = {};
  for (const m of html.matchAll(/var\s+lat_(\d+)\s*=\s*"([\d.]+)"/g)) {
    coords[m[1]] ??= {};
    coords[m[1]].lat = Number(m[2]);
  }
  for (const m of html.matchAll(/var\s+lng_(\d+)\s*=\s*"([\d.]+)"/g)) {
    coords[m[1]] ??= {};
    coords[m[1]].lng = Number(m[2]);
  }
  return coords;
}

function extractTabNames(html) {
  const tabs = {};
  for (const m of html.matchAll(/<li[^>]*id="tab(?:Plan)?li(\d+)"[^>]*>([\s\S]{0,500}?)<\/li>/g)) {
    const idx = m[1];
    const name = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (name && !tabs[idx]) tabs[idx] = name;
  }
  return tabs;
}

function normalizeForMatch(s) {
  return (s || "")
    .replace(/[\s()\[\]·,\-]/g, "")
    .replace(/블록$|단지$|구역$|행복$|행복주택$|아파트$|국민$|영구$/g, "")
    .toLowerCase();
}

function pickCoordForTitle(coords, tabs, title) {
  const keys = Object.keys(coords).filter((k) => coords[k].lat && coords[k].lng);
  if (keys.length === 0) return { coord: null, matchedTab: null };
  if (keys.length === 1) return { coord: coords[keys[0]], matchedTab: tabs[keys[0]] ?? null };
  const t = normalizeForMatch(title);
  let best = { score: -1, key: keys[0] };
  for (const k of keys) {
    const n = normalizeForMatch(tabs[k] ?? "");
    if (!n || !t) continue;
    let score = 0;
    if (n === t) score = 1000;
    else if (n.includes(t) || t.includes(n)) score = 500 + Math.min(n.length, t.length);
    else {
      const a = new Set(n.match(/[가-힣a-z0-9]{2,}/g) ?? []);
      const b = new Set(t.match(/[가-힣a-z0-9]{2,}/g) ?? []);
      for (const tok of a) if (b.has(tok)) score += 10;
    }
    if (score > best.score) best = { score, key: k };
  }
  return { coord: coords[best.key], matchedTab: tabs[best.key] ?? null };
}

function cleanCell(s) {
  return s
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tableByCaption(html, captionRegex) {
  const re = new RegExp(
    `<caption[^>]*>\\s*(${captionRegex.source}[\\s\\S]*?)</caption>([\\s\\S]*?)</table>`,
    "i",
  );
  const m = html.match(re);
  if (!m) return null;
  const rows = [...m[2].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((row) =>
    [...row[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => cleanCell(c[1])),
  );
  return rows.filter((r) => r.length > 0);
}

function rowsToObjects(rows) {
  if (!rows || rows.length < 2) return [];
  const headers = rows[0].map((h) => h.replace(/\s+/g, ""));
  return rows
    .slice(1)
    .map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        const v = row[i];
        if (h && v && v !== "상세보기") obj[h] = v;
      });
      return obj;
    })
    .filter((obj) => Object.values(obj).some((v) => v && v.length > 0));
}

function extractPageAddress(html) {
  return html.match(/var\s+address\s*=\s*"([^"]+)"/)?.[1] ?? "";
}

const PHOTO_KIND_PRIORITY = ["단지조감도", "단지전경", "단지배치도", "지역조감도", "지구조감도", "위치도", "동호배치도", "평면도"];

function extractPhotos(html) {
  const out = [];
  const seen = new Set();
  for (const m of html.matchAll(/list\.push\("\{([^"]+)\}"\)/g)) {
    const fields = {};
    for (const entry of m[1].split(",")) {
      const [k, ...v] = entry.split("=");
      fields[k.trim()] = v.join("=").trim();
    }
    const sn = fields.cmnAhflSn;
    if (!sn || seen.has(sn)) continue;
    seen.add(sn);
    out.push({
      kind: fields.slPanAhflDsCdNm || fields.ahflDesc || null,
      name: fields.cmnAhflNm || null,
      url: `https://apply.lh.or.kr/lhapply/lhFile.do?fileid=${sn}`,
    });
  }
  out.sort((a, b) => {
    const ai = PHOTO_KIND_PRIORITY.indexOf(a.kind ?? "");
    const bi = PHOTO_KIND_PRIORITY.indexOf(b.kind ?? "");
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  return out;
}

async function main() {
  const notices = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
  const targets = notices.filter((n) => !n.details && parseLegacyUrl(n.sourceUrl));
  console.log(`레거시 URL 보강 대상: ${targets.length}건`);

  let ok = 0;
  let fail = 0;
  let processed = 0;

  for (const n of targets) {
    processed++;
    const canonical = parseLegacyUrl(n.sourceUrl);
    try {
      const r = await fetch(canonical, { headers: HEADERS });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const html = await r.text();
      const coords = extractAllCoords(html);
      const tabs = extractTabNames(html);
      const { coord, matchedTab } = pickCoordForTitle(coords, tabs, n.title);
      if (coord && coord.lat && coord.lng) {
        n.lat = coord.lat;
        n.lng = coord.lng;
      }
      const housingTypes = rowsToObjects(tableByCaption(html, /주택형\s*안내/));
      const schedule = rowsToObjects(tableByCaption(html, /공급일정/)).filter(
        (r) => r["신청일시"] || r["신청 일시"],
      );
      const photos = extractPhotos(html);
      if (photos.length > 0) n.photos = photos;
      n.details = {
        pageAddress: extractPageAddress(html),
        matchedTab,
        coordCount: Object.keys(coords).length,
        housingTypes,
        schedule,
        canonicalUrl: canonical,
        enrichedAt: new Date().toISOString(),
      };
      ok++;
      if (processed % 30 === 0 || processed <= 3) {
        const pct = ((processed / targets.length) * 100).toFixed(1);
        console.log(
          `[${processed}/${targets.length} ${pct}%] ${n.id} → coord=${coord?.lat ?? "-"},${coord?.lng ?? "-"}`,
        );
      }
    } catch (error) {
      fail++;
      console.log(`[${processed}] ${n.id} fail: ${error.message}`);
    }
    if (processed % 50 === 0) {
      await fs.writeFile(DATA_PATH, JSON.stringify(notices, null, 2) + "\n", "utf8");
    }
    await sleep(DELAY_MS);
  }

  await fs.writeFile(DATA_PATH, JSON.stringify(notices, null, 2) + "\n", "utf8");
  console.log(`\n레거시 보강 완료: ok=${ok} fail=${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
