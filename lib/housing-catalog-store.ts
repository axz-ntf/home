import { promises as fs } from "node:fs";
import path from "node:path";
import { DATASETS, normalizeCatalog, type DatasetId, type CatalogRecord, type RawHousing } from "./housing-catalog";

type Snapshot = { records: CatalogRecord[]; rawCount: number; error: string | null };
const cache = new Map<DatasetId, { stamp: string; snapshot: Snapshot }>();
export async function readCatalog(source: DatasetId): Promise<Snapshot> {
  const config = DATASETS.find(d => d.id === source)!;
  const file = path.join(process.cwd(), "lib", config.file);
  try {
    const stat = await fs.stat(file);
    const stamp = `${stat.mtimeMs}:${stat.size}:${stat.ino}`;
    const previous = cache.get(source);
    if (previous?.stamp === stamp) return previous.snapshot;
    const raw: unknown = JSON.parse(await fs.readFile(file, "utf8"));
    if (!Array.isArray(raw) || raw.some(row => !row || typeof row !== "object" || Array.isArray(row))) throw new Error("Invalid dataset");
    const snapshot = { records: normalizeCatalog(source, raw as RawHousing[]), rawCount: raw.length, error: null };
    cache.set(source, { stamp, snapshot });
    return snapshot;
  } catch (error) {
    cache.delete(source);
    return { records: [], rawCount: 0, error: (error as NodeJS.ErrnoException).code === "ENOENT" ? "이 환경에 수집 파일이 없습니다." : "수집 파일을 읽을 수 없습니다. 파일 형식을 확인해 주세요." };
  }
}
export async function sourceTimes(): Promise<Record<string, string | null>> {
  const times: Record<string, string | null> = {};
  try {
    const meta = JSON.parse(await fs.readFile(path.join(process.cwd(), "lib/_sync-meta.json"), "utf8"));
    for (const key of ["lh", "sh", "youth"]) times[key] = validTime(meta[key]?.at);
  } catch { /* Unknown is shown explicitly; file mtime is not a collection time. */ }
  try {
    const timestamp = Number(await fs.readFile(path.join(process.cwd(), "lib/lh-complexes.json.fetched-at"), "utf8"));
    times.complexes = Number.isFinite(timestamp) && timestamp > 0 ? validTime(new Date(timestamp).toISOString()) : null;
  } catch { times.complexes = null; }
  return times;
}
function validTime(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now() ? value : null;
}
export function displayTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) : "수집 시각 기록 없음";
}
export function sourceIsStale(value: string | null | undefined, days: number): boolean {
  return !!value && Date.now() - Date.parse(value) > days * 86400000;
}
