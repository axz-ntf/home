// 야간 일괄 추출 (어드민 P5) — 검수 큐(미검수+이슈)를 밤에 미리 추출해 초안으로 저장.
// 검수자는 아침에 검수폼에서 "초안 불러오기"로 90초 대기 없이 확인·저장만 한다.
// lib 의 TS 파이프라인(resolveMarkdown/extractFromMarkdown)을 그대로 재사용하려고
// tsx 로 실행한다 (mjs 로 복제하면 추출 로직이 두 벌이 됨).
//
// 사용: npx tsx scripts/batch-extract.ts [--limit N]   (기본 15 — Solar 비용·CI 시간 캡)
// 출력: lib/extract-drafts.json { [id]: { at, type, fields } }

import fs from "node:fs/promises";
import path from "node:path";
import { LH_ADMIN_LISTINGS, listingIssues } from "../lib/lh-adapter";
import { OVERRIDES } from "../lib/manual-overrides";
import { resolveMarkdown } from "../lib/notice-markdown";
import { extractFromMarkdown } from "../lib/solar-extract";

const DRAFTS_PATH = path.join(process.cwd(), "lib/extract-drafts.json");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : 15;

async function main() {
  let drafts: Record<string, { at: string; type: string; fields: unknown }> = {};
  try {
    drafts = JSON.parse(await fs.readFile(DRAFTS_PATH, "utf8"));
  } catch { /* 첫 실행 */ }

  // 검수 완료된 초안은 정리 (override 저장 = 초안 소비됨)
  for (const id of Object.keys(drafts)) if (id in OVERRIDES) delete drafts[id];

  // 큐: 미검수 + 품질 이슈 — 대시보드 검수 큐와 같은 기준. 이미 초안 있으면 skip.
  const queue = LH_ADMIN_LISTINGS.filter(
    (l) => !(l.id in OVERRIDES) && !(l.id in drafts) && listingIssues(l).length > 0,
  ).slice(0, LIMIT);

  console.log(`일괄 추출 대상: ${queue.length}건 (캡 ${LIMIT}) | 기존 초안 ${Object.keys(drafts).length}건`);
  let ok = 0, fail = 0;
  for (const l of queue) {
    const t0 = Date.now();
    try {
      const { markdown } = await resolveMarkdown(l.id, l.sourceUrl ?? null);
      const fields = await extractFromMarkdown(markdown, { type: l.type, isSale: l.type === "sale" });
      drafts[l.id] = { at: new Date().toISOString(), type: l.type, fields };
      ok++;
      console.log(`✓ ${l.id} (${Math.round((Date.now() - t0) / 1000)}s) — ${l.title.slice(0, 30)}`);
    } catch (e) {
      fail++;
      console.log(`✗ ${l.id} — ${(e as Error).message.slice(0, 80)}`);
    }
    // 매 건 저장 — CI timeout 으로 죽어도 완료분 보존
    await fs.writeFile(DRAFTS_PATH, JSON.stringify(drafts, null, 2) + "\n", "utf8");
  }
  console.log(`\n완료: 성공 ${ok} / 실패 ${fail} / 총 초안 ${Object.keys(drafts).length}건 → ${DRAFTS_PATH}`);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
