// DS 적용 전체 캡처: 홈 · 디테일(입지 포함) · 팁 · 로그인.
import { chromium } from "playwright";
const SP = process.argv[2];
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".card", { timeout: 20000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SP}/ds-home.png` });
console.log("home");

// 디테일 패널 전체
const cards = await page.$$(".card");
await cards[0].click();
await page.waitForSelector(".detail-panel.open", { timeout: 6000 }).catch(() => {});
await page.waitForSelector(".insight-summary", { timeout: 14000 }).catch(() => {});
await page.waitForTimeout(1000);
const panel = await page.$(".detail-panel.open");
if (panel) { await panel.screenshot({ path: `${SP}/ds-detail.png` }); console.log("detail"); }

// 팁 / 로그인
for (const [path, name] of [["/tips", "tips"], ["/login", "login"]]) {
  try {
    await page.goto(`http://localhost:3000${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${SP}/ds-${name}.png` });
    console.log(name);
  } catch (e) { console.log(name, "FAIL", e.message); }
}
await b.close();
