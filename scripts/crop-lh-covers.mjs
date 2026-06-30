#!/usr/bin/env node
// 단지조감도 이미지의 상단 텍스트 영역(브로슈어 제목 등)을 휴리스틱으로 감지해
// public/lh-covers/{id}.jpg 로 정리해 저장한다.
// lh-notices-all.json 의 각 항목에 coverPhotoLocal 필드를 추가.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_PATH = path.join(ROOT, "lib/lh-notices-all.json");
const OUT_DIR = path.join(ROOT, "public/lh-covers");

const PHOTO_SAFE_EXT = /\.(jpe?g|png|webp)(?:$|\?)/i;
const HEADERS = {
  "User-Agent": "daum-public-housing-app/1.0 (LH cover cropper)",
  Accept: "image/*",
};
const DELAY_MS = 250;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isAerialRender(p) {
  const tag = `${p.kind ?? ""}${p.name ?? ""}`;
  if (!tag.includes("단지조감도")) return false;
  if (/배치도|평면도|현황도|구조도|투시도|동호도|토지이용|위치도|찾아오시는|교통/.test(tag))
    return false;
  if (p.name && !PHOTO_SAFE_EXT.test(p.name)) return false;
  return true;
}

function pickCoverPhoto(photos) {
  if (!photos?.length) return null;
  const candidates = photos.filter(isAerialRender);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const aEnh = /확대/.test(`${a.kind ?? ""}${a.name ?? ""}`);
    const bEnh = /확대/.test(`${b.kind ?? ""}${b.name ?? ""}`);
    return Number(bEnh) - Number(aEnh);
  });
  return candidates[0];
}

// 행별 brightness 분산을 보고 위/아래의 단색(텍스트/제목 띠)을 잘라낸다.
// - 행 평균 RGB 의 채도가 낮고 픽셀 표준편차가 작으면 단색 영역으로 간주
function detectTextBand(width, height, channels, data) {
  const rowMean = new Float32Array(height);
  const rowStd = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      sum += lum;
      sumSq += lum * lum;
      n++;
    }
    const mean = sum / n;
    const variance = Math.max(0, sumSq / n - mean * mean);
    rowMean[y] = mean;
    rowStd[y] = Math.sqrt(variance);
  }
  // 상단 — 평균 200 이상 + 표준편차 25 이하 = 거의 흰 띠/단색 영역
  let top = 0;
  for (let y = 0; y < Math.floor(height * 0.4); y++) {
    if (rowMean[y] > 200 && rowStd[y] < 30) {
      top = y + 1;
    } else if (top > 0 && rowStd[y] < 45) {
      top = y + 1; // 텍스트가 들어간 단색 띠 (분산 약간 증가)도 이어서 포함
    } else if (top > 0) {
      break;
    }
  }
  // 너무 적게 잡혔으면 무시
  if (top < height * 0.04) top = 0;
  // 너무 많이 잡혔으면 신뢰 안 함 (이미지 절반 이상 흰 띠 = 이상)
  if (top > height * 0.4) top = 0;

  // 하단도 동일한 패턴 (드물지만 LH 브로슈어 하단에 푸터가 있는 경우)
  let bottom = height;
  for (let y = height - 1; y > Math.floor(height * 0.6); y--) {
    if (rowMean[y] > 200 && rowStd[y] < 30) {
      bottom = y;
    } else if (bottom < height && rowStd[y] < 45) {
      bottom = y;
    } else if (bottom < height) {
      break;
    }
  }
  if (bottom > height - height * 0.04) bottom = height;
  if (bottom < height * 0.6) bottom = height;
  return { top, bottom };
}

async function processOne(notice) {
  const photo = pickCoverPhoto(notice.photos);
  if (!photo) return { state: "no-photo" };

  const outName = `${notice.id}.jpg`;
  const outPath = path.join(OUT_DIR, outName);
  try {
    await fs.access(outPath);
    return { state: "exists", path: `/lh-covers/${outName}` };
  } catch {}

  const resp = await fetch(photo.url, { headers: HEADERS });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());

  const img = sharp(buf, { failOn: "none" });
  const meta = await img.metadata();
  if (!meta.width || !meta.height) throw new Error("no metadata");
  // 분석 효율 위해 작은 사이즈로 리샘플
  const sampleH = Math.min(meta.height, 600);
  const sampleW = Math.round((meta.width * sampleH) / meta.height);
  const { data, info } = await img
    .clone()
    .resize({ width: sampleW, height: sampleH, fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { top, bottom } = detectTextBand(info.width, info.height, info.channels, data);
  const topRatio = top / info.height;
  const bottomRatio = (info.height - bottom) / info.height;
  const cropTop = Math.round(meta.height * topRatio);
  const cropBottom = Math.round(meta.height * bottomRatio);
  const cropHeight = meta.height - cropTop - cropBottom;

  let pipeline = sharp(buf, { failOn: "none" });
  if (cropTop > 0 || cropBottom > 0) {
    pipeline = pipeline.extract({
      left: 0,
      top: cropTop,
      width: meta.width,
      height: cropHeight,
    });
  }
  await pipeline.jpeg({ quality: 82, progressive: true }).toFile(outPath);
  return {
    state: "cropped",
    path: `/lh-covers/${outName}`,
    cropTop,
    cropBottom,
  };
}

async function main() {
  const notices = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
  const targets = notices.filter((n) => {
    const photo = pickCoverPhoto(n.photos);
    return Boolean(photo);
  });
  console.log(`크롭 대상 (단지조감도 보유): ${targets.length}건`);

  let cropped = 0;
  let exists = 0;
  let fail = 0;
  let processed = 0;
  for (const n of targets) {
    processed++;
    try {
      const r = await processOne(n);
      n.coverPhotoLocal = r.path;
      if (r.state === "cropped") cropped++;
      else if (r.state === "exists") exists++;
      if (processed % 20 === 0 || processed <= 5) {
        console.log(
          `[${processed}/${targets.length}] ${n.id} ${r.state}` +
            (r.cropTop ? ` top=-${r.cropTop}px` : "") +
            (r.cropBottom ? ` bottom=-${r.cropBottom}px` : ""),
        );
      }
    } catch (e) {
      fail++;
      console.log(`[${processed}] ${n.id} fail: ${e.message}`);
    }
    if (processed % 30 === 0) {
      await fs.writeFile(DATA_PATH, JSON.stringify(notices, null, 2) + "\n", "utf8");
    }
    await sleep(DELAY_MS);
  }

  await fs.writeFile(DATA_PATH, JSON.stringify(notices, null, 2) + "\n", "utf8");
  console.log(`\n완료: cropped=${cropped} exists=${exists} fail=${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
