// 국토부 전월세 실거래가 키 활성화 확인용.
// 실행: node scripts/test-molit.mjs   (.env.local 의 MOLIT_API_KEY 사용)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
const KEY = (env.match(/^MOLIT_API_KEY=(.*)$/m)?.[1] || "").trim();
if (!KEY) throw new Error("MOLIT_API_KEY 없음");

const qs = new URLSearchParams({
  serviceKey: KEY, // URLSearchParams가 한 번만 인코딩
  LAWD_CD: "11680", // 강남구
  DEAL_YMD: "202604",
  numOfRows: "5",
  pageNo: "1",
});
const url = `https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent?${qs}`;
const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
const text = await r.text();
console.log("HTTP", r.status);
if (r.status === 403 || text.trim() === "Forbidden") {
  console.log("→ 아직 키 미활성 (게이트웨이 차단). 잠시 후 재시도.");
} else {
  console.log(text.slice(0, 900));
}
