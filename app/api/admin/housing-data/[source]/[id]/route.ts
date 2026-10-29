import { datasetById } from "@/lib/housing-catalog";
import { readCatalog } from "@/lib/housing-catalog-store";
import { noteSchema, saveCatalogNote, NoteConflict, notesWritable } from "@/lib/housing-data-notes";
export const runtime = "nodejs";
type Context = { params: Promise<{ source: string; id: string }> };
async function target(context: Context) {
  const params = await context.params;
  const source = datasetById(params.source);
  if (!source) return null;
  const snapshot = await readCatalog(source.id);
  const record = snapshot.records.find(r => r.id === params.id);
  return record ? { source, record } : null;
}
export async function GET(_request: Request, context: Context) {
  const result = await target(context);
  if (!result) return Response.json({ error: "데이터를 찾을 수 없습니다." }, { status: 404 });
  return Response.json({ dataset: result.source.id, id: result.record.id, rows: result.record.rows }, { headers: { "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="housing-record.json"` } });
}
export async function POST(request: Request, context: Context) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  if (!notesWritable()) return Response.json({ error: "이 환경에는 메모 저장소가 연결되지 않았습니다." }, { status: 503 });
  const input = noteSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "관리 표시와 2,000자 이하 메모를 확인해 주세요." }, { status: 400 });
  const result = await target(context);
  if (!result) return Response.json({ error: "데이터를 찾을 수 없습니다." }, { status: 404 });
  try {
    const saved = await saveCatalogNote(result.source.id, result.record.id, input.data);
    return Response.json({ saved });
  } catch (error) {
    return Response.json({ error: error instanceof NoteConflict ? "다른 저장과 충돌했습니다. 페이지를 새로고침한 후 다시 저장해 주세요." : "메모를 저장하지 못했습니다. 기존 데이터는 유지됩니다." }, { status: error instanceof NoteConflict ? 409 : 500 });
  }
}
