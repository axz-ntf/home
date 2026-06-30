#!/usr/bin/env node
// LH 청약플러스/KOHOM 상세 페이지에서 좌표와 첨부 이미지(평면도/배치도 등)를 받아
// lib/lh-data.json 의 각 listing.photos / listing.attachments 에 병합한다.
// 사용: node scripts/enrich-lh-photos.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_PATH = path.join(ROOT, "lib/lh-data.json");
const BASE = "https://apply.lh.or.kr";
const HEADERS = {
  "User-Agent": "daum-public-housing-app/1.0 (LH asset enricher; polite crawler; 1req/s)",
  Accept: "text/html",
};
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36",
  Accept: "text/html",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isLhDetailUrl(url) {
  return (
    typeof url === "string" &&
    url.includes("apply.lh.or.kr") &&
    url.includes("selectWrtancInfo.do")
  );
}

function isKohomUrl(url) {
  return typeof url === "string" && url.includes("kohom.or.kr");
}

function textContent(html) {
  return html
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#40;/g, "(")
    .replace(/&#41;/g, ")")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferKind(name) {
  if (!name) return null;
  if (name.includes("평면")) return "평면도";
  if (name.includes("배치")) return "배치도";
  if (name.includes("전경") || name.includes("조감")) return "단지전경";
  if (name.includes("찾아오시는") || name.includes("위치")) return "위치안내";
  if (name.includes("공고")) return "공고문";
  return null;
}

function isImageFile(nameOrUrl) {
  return /\.(png|jpe?g|webp|gif)(?:$|\?)/i.test(nameOrUrl || "");
}

function extractCoord(html) {
  const lat = html.match(/var\s+lat_0\s*=\s*"([\d.]+)"/)?.[1];
  const lng = html.match(/var\s+lng_0\s*=\s*"([\d.]+)"/)?.[1];
  if (!lat || !lng) return null;
  return { lat: Number(lat), lng: Number(lng) };
}

function extractPhotos(html) {
  const out = [];
  const seen = new Set();
  const re = /list\.push\("\{([^"]+)\}"\)/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    const fields = {};
    for (const entry of match[1].split(",")) {
      const [key, ...value] = entry.split("=");
      fields[key.trim()] = value.join("=").trim();
    }
    const fileSn = fields.cmnAhflSn;
    if (!fileSn || seen.has(fileSn)) continue;
    seen.add(fileSn);
    out.push({
      kind: fields.slPanAhflDsCdNm || null,
      name: fields.cmnAhflNm || null,
      url: `${BASE}/lhapply/lhFile.do?fileid=${fileSn}`,
    });
  }
  return out;
}

function extractKohomAssets(html, sourceUrl) {
  const assets = [];
  const re = /<a\b([^>]*class="[^"]*\bfile\b[^"]*"[^>]*)>([\s\S]*?)<\/a>/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    const attrs = match[1];
    const href = attrs.match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&");
    if (!href) continue;
    const name = textContent(match[2]);
    const url = new URL(href, sourceUrl).toString();
    assets.push({
      kind: inferKind(name),
      name,
      url,
      source: "KOHOM",
    });
  }
  return {
    photos: assets.filter((asset) => isImageFile(asset.name) || isImageFile(asset.url)),
    attachments: assets,
  };
}

async function fetchInfo(url) {
  const response = await fetch(url, { headers: isKohomUrl(url) ? BROWSER_HEADERS : HEADERS });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  if (isKohomUrl(url)) {
    return {
      coord: null,
      ...extractKohomAssets(html, url),
    };
  }
  return {
    coord: extractCoord(html),
    photos: extractPhotos(html),
    attachments: [],
  };
}

async function main() {
  const listings = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
  let enriched = 0;
  let skipped = 0;

  for (const listing of listings) {
    if (!isLhDetailUrl(listing.sourceUrl) && !isKohomUrl(listing.sourceUrl)) {
      skipped++;
      continue;
    }

    process.stdout.write(`${listing.id} ${listing.title}: `);
    try {
      const info = await fetchInfo(listing.sourceUrl);
      if (info.coord && info.coord.lat && info.coord.lng) {
        listing.lat = info.coord.lat;
        listing.lng = info.coord.lng;
      }
      if (info.photos.length > 0) {
        listing.photos = info.photos;
      }
      if (info.attachments.length > 0) {
        listing.attachments = info.attachments;
      }
      enriched++;
      console.log(`${info.photos.length} photos, ${info.attachments.length} attachments`);
      await sleep(700);
    } catch (error) {
      console.log(`failed (${error.message})`);
    }
  }

  await fs.writeFile(DATA_PATH, JSON.stringify(listings, null, 2) + "\n", "utf8");
  console.log(`\nupdated ${enriched}, skipped ${skipped}: ${DATA_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
