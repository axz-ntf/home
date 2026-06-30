#!/usr/bin/env node
// LH 청약플러스 단지 상세(selectWrtancInfo.do)에서 좌표 + 단지 사진 추출
// 사용: node scripts/extract-lh-info.mjs <panId> [ccrCnntSysDsCd] [uppAisTpCd] [aisTpCd]

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36";
const BASE = "https://apply.lh.or.kr";

function detailUrl(panId, c2 = "02", c3 = "06", c4 = "08") {
  const p = new URLSearchParams({
    panId,
    ccrCnntSysDsCd: c2,
    uppAisTpCd: c3,
    aisTpCd: c4,
    mi: "1026",
  });
  return `${BASE}/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?${p}`;
}

function extractCoord(html) {
  // 페이지 안 var lat_0 = "37.x"; var lng_0 = "127.y";
  const lat = html.match(/var\s+lat_0\s*=\s*"([\d.]+)"/)?.[1];
  const lng = html.match(/var\s+lng_0\s*=\s*"([\d.]+)"/)?.[1];
  if (!lat || !lng) return null;
  return { lat: parseFloat(lat), lng: parseFloat(lng) };
}

function extractPhotos(html) {
  // 페이지 인라인 list.push("{cmnAhflSn=..., slPanAhflDsCdNm=단지배치도, ...}") 패턴
  const out = [];
  const seen = new Set();
  const re = /list\.push\("\{([^"]+)\}"\)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const body = m[1];
    const fields = {};
    body.split(",").forEach((kv) => {
      const [k, ...v] = kv.split("=");
      fields[k.trim()] = v.join("=").trim();
    });
    const sn = fields.cmnAhflSn;
    const kind = fields.slPanAhflDsCdNm;
    const name = fields.cmnAhflNm;
    if (!sn || seen.has(sn)) continue;
    seen.add(sn);
    out.push({
      kind: kind || null, // "단지배치도" | "단지조감도" | "동호배치도" | "평면도" 등
      name: name || null,
      url: `${BASE}/lhapply/lhFile.do?fileid=${sn}`,
      fileSn: sn,
    });
  }
  return out;
}

function extractTitle(html) {
  // <h2 class="...">...</h2> or panTitle
  const h = html.match(/<h2[^>]*class="[^"]*topTit[^"]*"[^>]*>([\s\S]*?)<\/h2>/);
  if (h) return h[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return null;
}

async function fetchOne(panId, c2 = "02", c3 = "06", c4 = "08") {
  const url = detailUrl(panId, c2, c3, c4);
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();
  return {
    panId,
    sourceUrl: url,
    title: extractTitle(html),
    coord: extractCoord(html),
    photos: extractPhotos(html),
  };
}

async function main() {
  const [panId, c2 = "02", c3 = "06", c4 = "08"] = process.argv.slice(2);
  if (!panId) {
    console.error("usage: node scripts/extract-lh-info.mjs <panId>");
    process.exit(1);
  }
  const result = await fetchOne(panId, c2, c3, c4);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
