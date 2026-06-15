// 청년안심주택(민간임대) 공고문 PDF → markdown 캐시 (lib/notice-texts/youth-{boardId}.md).
// embed-notice-texts.mjs 가 notice-texts/*.md 를 전부 임베딩하므로, 여기서 youth md 만 채우면
// RAG 인덱스에 청년안심 공고가 포함된다(현재는 LH·SH 만 임베딩됨).
// 이미 캐시된 건 skip — 증분. resolveMarkdown(youth-) 가 youth pdfUrl→Document Parse 처리.
//
// 실행: npx tsx scripts/enrich-youth-text.ts [--limit N] [--force]
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMarkdown } from "../lib/notice-markdown";
import youthNotices from "../lib/youth-notices.json";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "lib/notice-texts");

// SOLAR_API_KEY 는 호출 측 env 로 주입 (CI: secrets, 로컬: node --env-file=.env.local).
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const LIMIT = Number(process.argv.includes("--limit") ? process.argv[process.argv.indexOf("--limit") + 1] : 0);
const FORCE = process.argv.includes("--force");

interface YouthNotice { boardId: number; title?: string; pdfUrl?: string | null }

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  let pool = (youthNotices as YouthNotice[]).filter((n) => n.boardId != null && n.pdfUrl);
  if (!FORCE) {
    const existing = new Set(await fs.readdir(OUT_DIR));
    pool = pool.filter((n) => !existing.has(`youth-${n.boardId}.md`));
  }
  if (LIMIT > 0) pool = pool.slice(0, LIMIT);
  console.log(`청년안심 공고문 추출 대상: ${pool.length}건`);

  let ok = 0, err = 0;
  for (const n of pool) {
    const id = `youth-${n.boardId}`;
    try {
      const { markdown } = await resolveMarkdown(id);
      if (!markdown || markdown.trim().length < 50) { console.log(`✗ ${id} 본문 비어있음 — 스킵`); err++; continue; }
      await fs.writeFile(path.join(OUT_DIR, `${id}.md`), markdown + "\n", "utf8");
      ok++;
      console.log(`✓ ${id} (${markdown.length}자) | ${(n.title ?? "").slice(0, 30)}`);
    } catch (e) {
      err++;
      console.log(`✗ ${id} 실패: ${(e as Error).message}`);
    }
    await sleep(300);
  }
  console.log(`\n완료 — 저장 ${ok} / 실패 ${err} / 대상 ${pool.length}`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
