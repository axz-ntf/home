import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeCatalog, queryCatalog, noteKey, safeSourceUrl, textValue, type CatalogNote } from "../lib/housing-catalog";
import { readCatalogNotes, saveCatalogNote, NoteConflict, noteSchema, notesWritable } from "../lib/housing-data-notes";

test("same complex ID groups unit rows without summing or altering original rent", () => {
  const raw = [
    { hsmpSn: 11, hsmpNm: "가람", rnAdres: "서울시 종로구", styleNm: "26", bassRentGtn: 0, hshldCo: 100 },
    { hsmpSn: 11, hsmpNm: "가람", rnAdres: "서울시 종로구", styleNm: "36", bassRentGtn: 5000000, hshldCo: 100 },
    { hsmpSn: 12, hsmpNm: "가람", rnAdres: "부산시", styleNm: "26" },
  ];
  const before = JSON.stringify(raw);
  const records = normalizeCatalog("lh-complexes", raw);
  assert.equal(records.length, 2); assert.equal(records[0].rows.length, 2);
  assert.equal(records[0].rows[0].bassRentGtn, 0); assert.equal(records[0].rows[1].bassRentGtn, 5000000);
  assert.equal(JSON.stringify(raw), before);
});

test("empty API objects are missing, numeric zero stays a value", () => {
  assert.equal(textValue({}), ""); assert.equal(textValue(null), ""); assert.equal(textValue(0), "0");
  const [record] = normalizeCatalog("lh-listings", [{ id: "one", title: {}, address: {}, lat: 0, lng: 0, sourceUrl: "javascript:alert(1)" }]);
  assert.ok(record.issues.includes("이름 미수집")); assert.ok(record.issues.includes("좌표 미수집")); assert.equal(record.sourceUrl, null);
});

test("mixed-supply complexes appear under every supplied housing type", () => {
  const records = normalizeCatalog("lh-complexes", [
    { hsmpSn: 31315673, hsmpNm: "혼합 단지", suplyTyNm: "영구임대" },
    { hsmpSn: 31315673, hsmpNm: "혼합 단지", suplyTyNm: "국민임대" },
    { hsmpSn: 31315673, hsmpNm: "혼합 단지", suplyTyNm: "행복주택" },
  ]);
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].types, ["영구임대", "국민임대", "행복주택"]);
  for (const type of records[0].types) assert.equal(queryCatalog(records, { type }, {}, "lh-complexes").total, 1);
});

test("unsafe external links and credentials are rejected", () => {
  for (const value of ["javascript:alert(1)", "//evil.test", "data:text/html,test", "https://secret:pw@example.com"]) assert.equal(safeSourceUrl(value), null);
  assert.equal(safeSourceUrl("https://apply.lh.or.kr/a?q=1"), "https://apply.lh.or.kr/a?q=1");
});

test("missing IDs have stable content keys rather than positional IDs", () => {
  const a = { title: "첫 공고" }, b = { title: "다른 공고" };
  const first = normalizeCatalog("sh-notices", [a, b]);
  const reversed = normalizeCatalog("sh-notices", [b, a]);
  assert.equal(first[0].id, reversed[1].id); assert.notEqual(first[0].id, first[1].id);
  assert.ok(first[0].issues.includes("식별자 미수집"));
});

test("search covers all grouped unit rows and composes with filters", () => {
  const records = normalizeCatalog("lh-complexes", [
    { hsmpSn: 1, hsmpNm: "군산 내흥", rnAdres: "주소", brtcNm: "전북", suplyTyNm: "행복주택", styleNm: "26A" },
    { hsmpSn: 1, hsmpNm: "군산 내흥", rnAdres: "주소", brtcNm: "전북", suplyTyNm: "행복주택", styleNm: "SPECIAL" },
    { hsmpSn: 2, hsmpNm: "군산내흥", brtcNm: "전북", suplyTyNm: "국민임대" },
  ]);
  assert.equal(queryCatalog(records, { q: "special" }, {}, "lh-complexes").total, 1);
  assert.equal(queryCatalog(records, { q: "군산내흥", region: "전북", type: "행복주택", quality: "complete" }, {}, "lh-complexes").total, 1);
  assert.equal(queryCatalog(records, { quality: "missing" }, {}, "lh-complexes").total, 1);
  assert.equal(queryCatalog(records, { region: "서울" }, {}, "lh-complexes").total, 0);
});

test("pagination is bounded and does not mutate cached record order", () => {
  const records = normalizeCatalog("sh-notices", Array.from({ length: 55 }, (_, i) => ({ seq: String(i), title: `공고 ${55 - i}` })));
  const before = records.map(r => r.id);
  assert.equal(queryCatalog(records, { page: "NaN" }, {}, "sh-notices").page, 1);
  assert.equal(queryCatalog(records, { page: "-1" }, {}, "sh-notices").page, 1);
  const last = queryCatalog(records, { page: "9999" }, {}, "sh-notices");
  assert.equal(last.page, 3); assert.equal(last.records.length, 7); assert.deepEqual(records.map(r => r.id), before);
});

test("management filter uses a source-qualified key", () => {
  const records = normalizeCatalog("sh-notices", [{ seq: 1, title: "공고" }]);
  const note: CatalogNote = { state: "watch", note: "관심", revision: 1, updatedAt: new Date().toISOString() };
  assert.equal(queryCatalog(records, { managed: "watch" }, { [noteKey("youth-notices", "1")]: note }, "sh-notices").total, 0);
  assert.equal(queryCatalog(records, { managed: "watch" }, { [noteKey("sh-notices", "1")]: note }, "sh-notices").total, 1);
});

test("note validation rejects unexpected fields, excessive length and invalid revisions", () => {
  const valid = { state: "watch", note: "메모", revision: 0 };
  assert.ok(noteSchema.safeParse(valid).success);
  for (const payload of [{ ...valid, extra: true }, { ...valid, revision: -1 }, { ...valid, state: "publish" }, { ...valid, note: "a".repeat(2001) }]) assert.ok(!noteSchema.safeParse(payload).success);
});

test("local development remains writable with downloaded deployment env flags", () => {
  assert.equal(notesWritable({ NODE_ENV: "development", VERCEL: "1" }), true);
  assert.equal(notesWritable({ NODE_ENV: "production", VERCEL: "1" }), false);
  assert.equal(notesWritable({ NODE_ENV: "production" }), true);
});

test("memo saves persist across reads and stale revisions cannot overwrite", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "housing-notes-")); const file = path.join(dir, "notes.json");
  try {
    const saved = await saveCatalogNote("sh-notices", "1", { state: "watch", note: "메모", revision: 0 }, file);
    assert.equal(saved.revision, 1);
    await assert.rejects(saveCatalogNote("sh-notices", "1", { state: "done", note: "덮어쓰기", revision: 0 }, file), NoteConflict);
    await saveCatalogNote("youth-notices", "1", { state: "check", note: "별도 출처", revision: 0 }, file);
    const data = await readCatalogNotes(file); assert.equal(data["sh-notices:1"].note, "메모"); assert.equal(Object.keys(data).length, 2);
    await saveCatalogNote("sh-notices", "1", { state: "none", note: "", revision: 1 }, file);
    assert.equal((await readCatalogNotes(file))["sh-notices:1"].note, "");
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("concurrent saves never silently drop another record", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "housing-notes-")); const file = path.join(dir, "notes.json");
  try {
    const jobs = await Promise.allSettled(["1", "2"].map(id => saveCatalogNote("sh-notices", id, { state: "watch", note: id, revision: 0 }, file)));
    for (let i = 0; i < jobs.length; i++) if (jobs[i].status === "rejected") await saveCatalogNote("sh-notices", String(i + 1), { state: "watch", note: String(i + 1), revision: 0 }, file);
    assert.equal(Object.keys(await readCatalogNotes(file)).length, 2);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("corrupt memo files are preserved and locks released on failure", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "housing-notes-")); const file = path.join(dir, "notes.json");
  try {
    await fs.writeFile(file, "not-json");
    await assert.rejects(saveCatalogNote("sh-notices", "1", { state: "watch", note: "메모", revision: 0 }, file));
    assert.equal(await fs.readFile(file, "utf8"), "not-json");
    await assert.rejects(fs.stat(file + ".lock"));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
