// 성남판교대장 오매칭 수정 검증.
// 1) 오프라인: 수정된 findMatchingComplex 가 지역광역 예비공고를 오매칭하지 않는지 + 실단지는 유지 + 전체 매칭율 영향
// 2) 라이브: sigunguQuery + 지오코딩이 각 공고를 올바른 시/군 좌표로 올리는지 (KAKAO/VWORLD 키 필요)
// 사용: node --env-file=.env.local scripts/test-lh-match.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildComplexIndex, findMatchingComplex, noticeKeywords } from "./lib/lh-complex-match.mjs";
import { sigunguQuery, SIDO_SHORT } from "./lib/lh-region.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const complexes = JSON.parse(fs.readFileSync(path.join(ROOT, "lib/lh-complexes.json"), "utf8"));
const admin = JSON.parse(fs.readFileSync(path.join(ROOT, "lib/admin-codes.json"), "utf8"));
const { byKey } = buildComplexIndex(complexes);
const GG = "41"; // 경기도 시도코드

let pass = 0, fail = 0;
const ok = (cond, msg) => { (cond ? pass++ : fail++); console.log(`  ${cond ? "✓" : "✗ FAIL"} ${msg}`); };

// ── 1) 오매칭 방지 ──
console.log("[1] 지역광역 예비공고 오매칭 방지");
const badTitles = [
  "화성서부권 국민임대주택 예비입주자 모집[입주자격완화, 선계약후검증]",
  "[정정공고]연천전곡1단지 국민임대주택 예비입주자 모집공고(2026.7.6.)",
  "남양주시지역 국민임대주택 예비입주자 모집",
  "포천송우4단지 국민임대주택 예비입주자 모집공고(2026.7.6.)",
  "하남풍산1단지 국민임대주택 예비입주자 모집공고(2026. 7. 6.)",
];
for (const t of badTitles) {
  const m = findMatchingComplex({ PAN_NM: t }, byKey, GG);
  const isPangyo = (m?.hsmpNm || "").includes("판교대장");
  ok(!isPangyo, `"${t.slice(0, 18)}…" → ${m ? m.hsmpNm.slice(0, 20) : "매칭없음(→시군구중심)"}`);
}

// ── 2) 실단지 공고는 여전히 매칭 (회귀 방지) ──
console.log("\n[2] 실단지 공고 매칭 유지 (회귀 방지)");
const realComplex = complexes.find((c) => (c.hsmpNm || "").includes("판교대장 A-9"));
const goodTitle = "성남판교대장 A-9블록 국민임대주택 예비입주자 모집공고";
const gm = findMatchingComplex({ PAN_NM: goodTitle }, byKey, GG);
ok((gm?.hsmpNm || "").includes("판교대장"), `"${goodTitle.slice(0, 24)}…" → ${gm ? gm.hsmpNm.slice(0, 24) : "매칭없음"}`);
ok(!!realComplex, `단지DB에 판교대장 A-9 존재: ${realComplex?.hsmpNm?.slice(0, 24) ?? "없음"}`);

// ── 3) 키워드 확인 (주택유형어 제거) ──
console.log("\n[3] noticeKeywords — 주택유형어 제거 확인");
for (const t of ["화성서부권 국민임대주택 예비입주자 모집", "성남판교대장 A-9블록 국민임대주택 입주자모집"]) {
  const kw = noticeKeywords(t);
  ok(!kw.includes("국민임대주택"), `키워드 ${JSON.stringify(kw)}`);
}

// ── 4) 전체 매칭율 영향 (오탐만 줄고 정탐 유지되는지) ──
console.log("\n[4] 경기도 국민임대 공고 전체 매칭 분포 (참고)");
const api = JSON.parse(fs.readFileSync(path.join(ROOT, "lib/listings-api.json"), "utf8"));
const ggNation = api.filter((l) => l.type === "nation" && (l.district || "").includes("경기"));
let matched = 0, pangyoStack = 0;
for (const l of ggNation) {
  const m = findMatchingComplex({ PAN_NM: l.title }, byKey, GG);
  if (m) matched++;
  if ((m?.hsmpNm || "").includes("판교대장")) pangyoStack++;
}
console.log(`   경기 국민임대 ${ggNation.length}건 → 매칭 ${matched} / 판교대장로 뭉침 ${pangyoStack}건`);
ok(pangyoStack <= 1, `판교대장 오뭉침 ${pangyoStack}건 (수정 전 5+건 → 1건 이하 기대)`);

// ── 5) 라이브: 시군구 추출 + 지오코딩 ──
console.log("\n[5] 시군구 중심 지오코딩 (라이브)");
const KAKAO = process.env.KAKAO_REST_API_KEY, KEY = process.env.VWORLD_API_KEY;
const inGyeonggi = (lat, lng) => lat > 36.8 && lat < 38.3 && lng > 126.3 && lng < 127.8;
async function kakao(q) {
  if (!KAKAO) return null;
  for (const ep of ["address", "keyword"]) {
    try {
      const j = await (await fetch(`https://dapi.kakao.com/v2/local/search/${ep}.json?query=${encodeURIComponent(q)}&size=1`, { headers: { Authorization: "KakaoAK " + KAKAO } })).json();
      const d = j.documents?.[0];
      if (d) return { lat: +d.y, lng: +d.x, addr: d.address_name || d.road_address_name || "" };
    } catch {}
  }
  return null;
}
if (!KAKAO && !KEY) {
  console.log("   (키 없음 — 라이브 지오코딩 스킵. `--env-file=.env.local` 로 실행)");
} else {
  const expect = { "화성서부권": "화성", "연천전곡": "연천", "남양주시지역": "남양주", "포천송우": "포천", "하남풍산": "하남" };
  for (const t of badTitles) {
    const q = sigunguQuery(t, "경기도", admin);
    const g = q ? await kakao(q) : null;
    const key = Object.keys(expect).find((k) => t.includes(k));
    const wantSg = expect[key];
    const good = q && q.includes(wantSg) && g && inGyeonggi(g.lat, g.lng);
    ok(good, `"${t.slice(0, 14)}…" → 질의 "${q}" → ${g ? `(${g.lat.toFixed(3)}, ${g.lng.toFixed(3)}) ${g.addr}` : "지오코딩 실패"}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
