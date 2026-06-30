// 실제 앱(localhost:3000)을 띄워 좌표 있는 매물 디테일의 AI 입지 분석 섹션을 캡처.
import { chromium } from "playwright";

const OUT = process.argv[2] || "/tmp/real-detail.png";
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2 });
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".card", { timeout: 20000 });

let done = false;
for (let i = 0; i < 14 && !done; i++) {
  const cards = await page.$$(".card");
  if (i >= cards.length) break;
  await cards[i].click();
  await page.waitForSelector(".detail-panel.open", { timeout: 5000 }).catch(() => {});
  const ok = await page
    .waitForSelector(".insight-summary", { timeout: 14000 })
    .then(() => true)
    .catch(() => false);
  if (ok) {
    const title = await page.$eval(".detail-title, .detail-panel h2, .detail-panel .card-title", (el) => el.textContent).catch(() => "(제목)");
    const sec = await page.$(".insight-section");
    await sec.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await sec.screenshot({ path: OUT });
    console.log("captured:", title, "→", OUT);
    done = true;
  } else {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(300);
  }
}
if (!done) console.log("좌표 있는 매물 디테일을 찾지 못함(앞쪽 14개 내).");
await b.close();
