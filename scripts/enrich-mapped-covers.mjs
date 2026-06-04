// 다지점(mapped-regional) 공고의 단지별 조감도 크롤 → 각 point.coverPhotoLocal 매칭.
// LH 페이지의 "단지조감도" 이미지를 단지명으로 매칭(없으면 비움=공유 조감도 안 씀).
// 사용: node scripts/enrich-mapped-covers.mjs [--ids pid1,pid2]
// 이후 upload-covers-to-blob.mjs 로 Blob 업로드 → blob-covers.json.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LH = "https://apply.lh.or.kr";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36";
const COVERS = path.join(ROOT, "public/lh-covers");

const listings = JSON.parse(await fs.readFile(path.join(ROOT, "lib/listings-api.json"), "utf8"));
const mapPath = path.join(ROOT, "lib/mapped-regional.json");
const mapped = JSON.parse(await fs.readFile(mapPath, "utf8"));
const idArg = (process.argv.find((a) => a.startsWith("--ids=")) || "").split("=")[1];
const targetPids = idArg ? idArg.split(",") : Object.keys(mapped);

function parseLoose(body) {
  const re = /([a-zA-Z0-9_]+)=/g; let m; const ms = [], o = {};
  while ((m = re.exec(body))) ms.push(m);
  for (let i = 0; i < ms.length; i++) { const k = ms[i][1], s = ms[i].index + ms[i][0].length, e = i + 1 < ms.length ? ms[i + 1].index : body.length; const v = body.slice(s, e).replace(/,\s*$/, "").trim(); o[k] = v === "null" || v === "" ? null : v; }
  return o;
}
function illustrations(html) {
  const re = /list\.push\("\{([\s\S]*?)\}"\)\s*;/g; let m; const out = [];
  while ((m = re.exec(html))) { const o = parseLoose(m[1]); if (o.cmnAhflSn && (o.slPanAhflDsCdNm === "단지조감도" || o.lsSplInfUplFlDsCdNm === "단지조감도" || o.ahflDesc === "단지조감도")) out.push(o); }
  return out;
}
// 단지명 정규화 — 영문블록(A10→10)·접미어 제거해 매칭률↑
const norm = (s) => (s || "").replace(/[A-Za-z]/g, "").replace(/국민임대|행복주택|공공임대|영구임대|블럭|블록|단지|주택|국민|\s/g, "").trim();

async function filePath(sn, referer) {
  const r = await fetch(`${LH}/lhapply/getFilePath.do`, { method: "POST", headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", "Content-Type": "application/x-www-form-urlencoded", Referer: referer }, body: `cmnAhflSn=${encodeURIComponent(sn)}` });
  if (!r.ok) return null; let j; try { j = await r.json(); } catch { return null; }
  return j?.cmnAhflPth && j?.cmnPhyAhflNm ? `${LH}/upload${j.cmnAhflPth}${j.cmnPhyAhflNm}` : null;
}

await fs.mkdir(COVERS, { recursive: true });
const stats = { matched: 0, none: 0 };
for (const pid of targetPids) {
  const cfg = mapped[pid]; if (!cfg) continue;
  const l = listings.find((x) => x.pblancId === pid); if (!l?.sourceUrl) continue;
  let html; try { html = await (await fetch(l.sourceUrl, { headers: { "User-Agent": UA } })).text(); } catch { continue; }
  const imgs = illustrations(html).map((e) => ({ e, key: norm(e.imgAhflDesc || e.cmnAhflNm || e.lccNtFlNm) }));
  for (const p of cfg.points) {
    const pk = norm(p.label);
    const hit = imgs.find((x) => x.key && pk && (x.key.includes(pk) || pk.includes(x.key)));
    if (!hit) { delete p.coverPhotoLocal; stats.none++; continue; }
    const url = await filePath(hit.e.cmnAhflSn, l.sourceUrl);
    if (!url) { delete p.coverPhotoLocal; stats.none++; continue; }
    const fn = `lh-${pid}-${hit.e.cmnAhflSn}.jpg`;
    try {
      const buf = Buffer.from(await (await fetch(url, { headers: { "User-Agent": UA, Referer: l.sourceUrl } })).arrayBuffer());
      await fs.writeFile(path.join(COVERS, fn), buf);
      p.coverPhotoLocal = `/lh-covers/${fn}`;
      stats.matched++;
      console.log(`✓ ${pid} ${p.label} → ${fn}`);
    } catch { delete p.coverPhotoLocal; stats.none++; }
  }
}
await fs.writeFile(mapPath, JSON.stringify(mapped, null, 2) + "\n");
console.log(`\n완료: 매칭 ${stats.matched} / 없음(비움) ${stats.none}`);
