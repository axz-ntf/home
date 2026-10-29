import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { noteKey, type CatalogNote, type DatasetId } from "./housing-catalog";

export const noteSchema = z.object({ state: z.enum(["none", "watch", "check", "done"]), note: z.string().trim().max(2000), revision: z.number().int().nonnegative() }).strict();
const storedSchema = noteSchema.extend({ updatedAt: z.string().datetime() });
// Downloaded Vercel env files can contain VERCEL=1 even during local next dev.
export const notesWritable = (environment: { NODE_ENV?: string; VERCEL?: string } = process.env) => environment.NODE_ENV === "development" || !environment.VERCEL;
export class NoteConflict extends Error {}
const defaultFile = () => path.join(process.cwd(), "lib/housing-data-notes.json");
export async function readCatalogNotes(file = defaultFile()): Promise<Record<string, CatalogNote>> {
  try { return z.record(z.string(), storedSchema).parse(JSON.parse(await fs.readFile(file, "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; }
}
// File lock + atomic rename: concurrent requests cannot overwrite another record's memo.
export async function saveCatalogNote(source: DatasetId, id: string, input: z.infer<typeof noteSchema>, file = defaultFile()) {
  const clean = noteSchema.parse(input);
  const lock = `${file}.lock`;
  let handle;
  try { handle = await fs.open(lock, "wx"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new NoteConflict("Another save is in progress"); throw error; }
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const data = await readCatalogNotes(file);
    const key = noteKey(source, id);
    if ((data[key]?.revision ?? 0) !== clean.revision) throw new NoteConflict("This record was updated");
    const saved: CatalogNote = { ...clean, revision: clean.revision + 1, updatedAt: new Date().toISOString() };
    data[key] = saved;
    await fs.writeFile(temporary, JSON.stringify(data, null, 2) + "\n", "utf8");
    await fs.rename(temporary, file);
    return saved;
  } finally { await handle.close(); await fs.rm(temporary, { force: true }); await fs.rm(lock, { force: true }); }
}
