import fs from "node:fs";
import path from "node:path";

const TIPS_DIR = path.join(process.cwd(), "content", "tips");

export type TipPost = {
  slug: string;
  title: string;
  summary: string;
  date: string; // YYYY-MM-DD
  tags: string[];
  cover: string; // 썸네일 이미지 경로 (없으면 "" → 그라데이션 폴백)
  content: string; // markdown 본문
};

// 우리가 직접 작성하는 통제된 포맷이라 가벼운 파서로 충분. (gray-matter 의존성 불필요)
function parseFrontmatter(raw: string): { data: Record<string, string | string[]>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: raw };
  const data: Record<string, string | string[]> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (val.startsWith("[")) {
      try {
        data[key] = JSON.parse(val);
        continue;
      } catch {
        /* fallthrough to string */
      }
    }
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    data[key] = val;
  }
  return { data, body: raw.slice(m[0].length) };
}

export function getAllTips(): TipPost[] {
  if (!fs.existsSync(TIPS_DIR)) return [];
  return fs
    .readdirSync(TIPS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const { data, body } = parseFrontmatter(fs.readFileSync(path.join(TIPS_DIR, f), "utf8"));
      return {
        slug: f.replace(/\.md$/, ""),
        title: typeof data.title === "string" ? data.title : f,
        summary: typeof data.summary === "string" ? data.summary : "",
        date: typeof data.date === "string" ? data.date : "",
        tags: Array.isArray(data.tags) ? data.tags : [],
        cover: typeof data.cover === "string" ? data.cover : "",
        content: body.trim(),
      };
    })
    .sort((a, b) => (b.date || "").localeCompare(a.date || "")); // 최신순
}

export function getTip(slug: string): TipPost | null {
  return getAllTips().find((t) => t.slug === slug) ?? null;
}

// cover 이미지 없을 때 slug 기반 그라데이션 폴백 (배포마다 동일).
export function thumbClass(slug: string): string {
  let h = 0;
  for (const c of slug) h += c.charCodeAt(0);
  return `tip-thumb-g${h % 5}`;
}
