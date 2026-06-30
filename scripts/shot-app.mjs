// 실제 앱 전체 화면 캡처: 홈 + (매물 클릭) 디테일 패널 상단.
import { chromium } from "playwright";
const SP = process.argv[2];
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".card", { timeout: 20000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SP}/app-home.png` });
console.log("home captured");

// 매물 클릭 → 디테일 패널 전체
const cards = await page.$$(".card");
await cards[0].click();
await page.waitForSelector(".detail-panel.open", { timeout: 6000 }).catch(() => {});
await page.waitForTimeout(1500);
const panel = await page.$(".detail-panel.open");
if (panel) { await panel.screenshot({ path: `${SP}/app-detail.png` }); console.log("detail captured"); }
await b.close();
