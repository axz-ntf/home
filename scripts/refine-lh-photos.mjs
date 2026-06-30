#!/usr/bin/env node
// 다중 단지(같은 pblancId × 여러 houseSn)인 LH 상세 페이지에서
// sbdLgoNo 그룹별로 사진을 분리하고 각 entry.title 과 매칭해 단지별 사진을 정확히 할당한다.
// 단일 단지(houseSn 하나) entries 는 기존 photos 유지.
//
// 결과: 매칭된 entry에는 photos / coverPhotoUrl 갱신, 매칭 안 되면 photos/coverPhotoLocal 비움.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_PATH = path.join(ROOT, "lib/lh-notices-all.json");

const HEADERS = {
  "User-Agent": "daum-public-housing-app/1.0 (LH photo refiner; polite crawler)",
  Accept: "text/html",
};
const DELAY_MS = 700;
const PHOTO_PRIORITY = [
  "단지조감도",
  "단지전경",
  "단지배치도",
  "동호배치도",
  "지구조감도",
  "지역조감도",
  "위치도",
  "교통망도",
  "투시도",
  "평면도",
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseFields(body) {
  const out = {};
  for (const entry of body.split(",")) {
    const idx = entry.indexOf("=");
    if (idx < 0) continue;
    out[entry.slice(0, idx).trim()] = entry.slice(idx + 1).trim();
  }
  return out;
}

function extractPhotoGroups(html) {
  const groups = new Map(); // sbdLgoNo → photos[]
  for (const m of html.matchAll(/list\.push\("\{([^"]+)\}"\)/g)) {
    const f = parseFields(m[1]);
    const key = f.sbdLgoNo || f.sn || "default";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      kind: f.slPanAhflDsCdNm || f.ahflDesc || null,
      name: f.cmnAhflNm || null,
      url: `https://apply.lh.or.kr/lhapply/lhFile.do?fileid=${f.cmnAhflSn}`,
      sn: f.sn,
    });
  }
  return groups;
}

function extractTabNames(html) {
  const tabs = [];
  for (const m of html.matchAll(/<li[^>]*id="tabli(\d+)"[^>]*>([\s\S]{0,400}?)<\/li>/g)) {
    const idx = Number(m[1]);
    const name = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    tabs[idx] = name;
  }
  return tabs;
}

function normalize(s) {
  return (s || "")
    .replace(/[\s()\[\]·,\-_.]/g, "")
    .replace(/BL$|단지$|블록$|구역$|행복$|행복주택$|국민$|영구$|아파트$/g, "")
    .toLowerCase();
}

function tokens(s) {
  return new Set((s || "").match(/[가-힣a-z0-9]{2,}/g) ?? []);
}

function pickPriorityPhoto(photos) {
  if (!photos.length) return null;
  const sorted = [...photos].sort((a, b) => {
    const ai = PHOTO_PRIORITY.findIndex((k) => `${a.kind ?? ""}${a.name ?? ""}`.includes(k));
    const bi = PHOTO_PRIORITY.findIndex((k) => `${b.kind ?? ""}${b.name ?? ""}`.includes(k));
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  return sorted[0];
}

function findFirstAerial(photos) {
  return photos.find((p) => {
    const tag = `${p.kind ?? ""}${p.name ?? ""}`;
    if (!tag.includes("단지조감도")) return false;
    if (/배치도|평면도|동호도|교통|위치|투시/.test(tag)) return false;
    return /\.(jpe?g|png|webp)(?:$|\?)/i.test(p.name ?? "");
  });
}

// title과 사진 그룹들 사이 매칭 — 그룹 내 사진 파일명/탭 라벨에서 단지 키워드 비교
function matchGroup(title, groups, tabNames) {
  const tTok = tokens(normalize(title));
  if (tTok.size === 0) return null;
  let best = { score: -1, key: null };
  for (const [key, photos] of groups) {
    // 그룹 키워드: 파일명 모두 + 가능하면 sn 인덱스 기반 tab
    const blob = photos.map((p) => `${p.kind ?? ""} ${p.name ?? ""}`).join(" ");
    const gTok = tokens(normalize(blob));
    let score = 0;
    for (const t of tTok) if (gTok.has(t)) score += 10;
    if (score > best.score) best = { score, key };
  }
  // 토큰 매칭 점수가 충분하지 않으면 (예: 파일명에 단지명이 없을 때) 매칭 불성공
  if (best.score < 10) return null;
  // 보너스: tab 순서 일치 검증 (선택)
  return best.key;
}

async function processPage(panId, url, entries) {
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();
  const groups = extractPhotoGroups(html);
  const tabs = extractTabNames(html);
  if (groups.size === 0) return { state: "no-groups", matched: 0 };

  let matched = 0;
  for (const n of entries) {
    const matchKey = matchGroup(n.title, groups, tabs);
    if (matchKey) {
      const photos = groups.get(matchKey);
      n.photos = photos.map(({ kind, name, url }) => ({ kind, name, url }));
      const aerial = findFirstAerial(n.photos);
      n.coverPhotoUrl = aerial?.url ?? null;
      // 기존 로컬 크롭 이미지는 신뢰 못 함 (이전 매칭 잘못)
      delete n.coverPhotoLocal;
      matched++;
    } else {
      // 매칭 실패 → 잘못된 사진보다 비우기
      n.photos = [];
      delete n.coverPhotoUrl;
      delete n.coverPhotoLocal;
    }
  }
  return { state: "ok", matched, total: entries.length, groups: groups.size };
}

async function main() {
  const data = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));

  // pblancId별 그룹화
  const byPanId = new Map();
  for (const n of data) {
    if (!n.sourceUrl?.includes("selectWrtancInfo.do")) continue;
    try {
      const panId = new URL(n.sourceUrl).searchParams.get("panId");
      if (!panId) continue;
      if (!byPanId.has(panId)) byPanId.set(panId, []);
      byPanId.get(panId).push(n);
    } catch {}
  }
  const multi = [...byPanId.entries()].filter(([, arr]) => arr.length > 1);
  console.log(`다중 단지 페이지: ${multi.length}건 (총 entries: ${multi.reduce((s, [, a]) => s + a.length, 0)})`);

  let pageOk = 0;
  let pageFail = 0;
  let matchedAll = 0;
  let cleared = 0;
  for (let i = 0; i < multi.length; i++) {
    const [panId, entries] = multi[i];
    try {
      const r = await processPage(panId, entries[0].sourceUrl, entries);
      pageOk++;
      matchedAll += r.matched ?? 0;
      cleared += (r.total ?? 0) - (r.matched ?? 0);
      if ((i + 1) % 5 === 0 || i < 3) {
        console.log(
          `[${i + 1}/${multi.length}] panId=${panId} entries=${entries.length} matched=${r.matched} groups=${r.groups}`,
        );
      }
    } catch (e) {
      pageFail++;
      console.log(`[${i + 1}] panId=${panId} fail: ${e.message}`);
    }
    if ((i + 1) % 20 === 0) {
      await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
    }
    await sleep(DELAY_MS);
  }

  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`\n완료: pageOk=${pageOk} pageFail=${pageFail} matched=${matchedAll} cleared=${cleared}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
