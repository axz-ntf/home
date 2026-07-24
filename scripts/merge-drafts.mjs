#!/usr/bin/env node
// rebase 중 lib/extract-drafts.json 충돌을 키 단위 dict 병합으로 해소.
// (CI 데이터 커밋과 사람 푸시가 같은 창구에 겹치면 양쪽 다 초안을 추가해 충돌남 —
//  둘 다 유효한 추가라서 한쪽을 버리면 안 되고, 같은 키는 최신 at 이 이긴다.)
// 사용: 충돌 상태에서 node scripts/merge-drafts.mjs  → 병합본을 파일에 기록 (add 는 호출자가)
import { execSync } from "node:child_process";
import fs from "node:fs";

const PATH = "lib/extract-drafts.json";
// rebase 중 stage2 = upstream(원격, 사람 푸시 포함), stage3 = 재생 중인 커밋(CI 산출).
const read = (stage) =>
  JSON.parse(execSync(`git show :${stage}:${PATH}`, { maxBuffer: 64 * 1024 * 1024 }).toString());

const ours = read(2);
const theirs = read(3);
const merged = { ...ours };
for (const [k, v] of Object.entries(theirs)) {
  if (!(k in merged) || String(v?.at ?? "") > String(merged[k]?.at ?? "")) merged[k] = v;
}
fs.writeFileSync(PATH, JSON.stringify(merged, null, 2) + "\n");
console.log(
  `drafts 병합: 원격 ${Object.keys(ours).length} + CI ${Object.keys(theirs).length} → ${Object.keys(merged).length}건`,
);
