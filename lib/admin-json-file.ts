// 어드민 검수 데이터 JSON 파일의 read-modify-write — overrides/mapped 라우트 공용.
//   - 로컬 dev: fs 직접 write (커밋은 사람이).
//   - 배포(Vercel): fs 가 read-only 라 GitHub Contents API 커밋 → 자동 재배포 → 메인앱 반영(~1분).
// 메인앱은 대상 JSON 을 빌드시 static import 하므로 읽기 경로는 변경 불필요.
import { promises as fs } from "node:fs";
import path from "node:path";

const GH_TOKEN = (process.env.GITHUB_TOKEN ?? "").trim();
const GH_REPO = process.env.GITHUB_REPO ?? "bobbypark-axz/home";
const GH_BRANCH = process.env.GITHUB_BRANCH ?? "main";
// Vercel 런타임(VERCEL=1)이고 토큰이 있을 때만 GitHub 모드. 그 외(로컬)는 fs.
const useGitHub = Boolean(GH_TOKEN) && Boolean(process.env.VERCEL);

const GH_HEADERS = {
  Authorization: `Bearer ${GH_TOKEN}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "daum-public-housing-admin",
  "X-GitHub-Api-Version": "2022-11-28",
};

// 안정적 키 정렬 — 검수 diff 가 git 에서 깔끔하게.
function serialize(data: Record<string, unknown>): string {
  const ordered: Record<string, unknown> = {};
  for (const k of Object.keys(data).sort()) ordered[k] = data[k];
  return JSON.stringify(ordered, null, 2) + "\n";
}

async function readJson(relPath: string): Promise<{ data: Record<string, unknown>; sha: string | null }> {
  if (useGitHub) {
    const url = `https://api.github.com/repos/${GH_REPO}/contents/${relPath}?ref=${GH_BRANCH}`;
    const r = await fetch(url, { headers: GH_HEADERS, cache: "no-store" });
    if (r.status === 404) return { data: {}, sha: null };
    if (!r.ok) throw new Error(`GitHub 읽기 실패 (${r.status}): ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const decoded = Buffer.from(j.content ?? "", "base64").toString("utf8");
    return { data: decoded.trim() ? JSON.parse(decoded) : {}, sha: j.sha };
  }
  try {
    return { data: JSON.parse(await fs.readFile(path.join(process.cwd(), relPath), "utf8")), sha: null };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { data: {}, sha: null };
    throw e;
  }
}

async function writeJson(relPath: string, data: Record<string, unknown>, sha: string | null, message: string) {
  const content = serialize(data);
  if (!useGitHub) {
    await fs.writeFile(path.join(process.cwd(), relPath), content, "utf8");
    return;
  }
  const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${relPath}`, {
    method: "PUT",
    headers: { ...GH_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch: GH_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!r.ok) throw new Error(`GitHub 커밋 실패 (${r.status}): ${(await r.text()).slice(0, 200)}`);
}

/** sha 충돌(다른 커밋이 끼어듦) 시 1회 재시도하며 read-modify-write.
 *  mutator 가 false 를 반환하면(변경 없음) write/commit 을 건너뛴다 — 빈 커밋 방지. */
export async function mutateJsonFile(
  relPath: string,
  message: string,
  mutator: (data: Record<string, unknown>) => boolean,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, sha } = await readJson(relPath);
    if (!mutator(data)) return;
    try {
      await writeJson(relPath, data, sha, message);
      return;
    } catch (e) {
      const conflict = /\b409\b/.test((e as Error).message);
      if (conflict && attempt === 0) continue;
      throw e;
    }
  }
}

export const persistMode = (): "github" | "fs" => (useGitHub ? "github" : "fs");
