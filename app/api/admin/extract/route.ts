import { NextResponse } from "next/server";
import { extractFromMarkdown } from "@/lib/solar-extract";
import { resolveMarkdown, parseUploadedPdf, type MarkdownSource } from "@/lib/notice-markdown";
import type { HousingTypeId } from "@/lib/types";

// 공고문 → Solar 구조화 추출. 디스크 쓰기 없음 → Vercel 배포에서도 동작.
// open2 는 reasoning 모델이라 호출이 수십 초 걸릴 수 있어 maxDuration 넉넉히.
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const t0 = Date.now();
  const ct = req.headers.get("content-type") ?? "";
  try {
    let markdown: string;
    let source: MarkdownSource;
    let isSale: boolean;
    let type: HousingTypeId | undefined;

    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "PDF 파일(file) 필요" }, { status: 400 });
      }
      isSale = form.get("isSale") === "true";
      type = (form.get("type") as HousingTypeId) || undefined;
      markdown = await parseUploadedPdf(Buffer.from(await file.arrayBuffer()), file.name || "upload.pdf");
      source = "upload";
    } else {
      const body = await req.json().catch(() => ({}));
      if (!body?.id || typeof body.id !== "string") {
        return NextResponse.json({ error: "id 필요" }, { status: 400 });
      }
      isSale = body.isSale === true;
      type = typeof body.type === "string" ? (body.type as HousingTypeId) : undefined;
      const resolved = await resolveMarkdown(body.id, typeof body.sourceUrl === "string" ? body.sourceUrl : null);
      markdown = resolved.markdown;
      source = resolved.source;
    }

    if (!markdown.trim()) {
      return NextResponse.json({ error: "공고문 텍스트가 비어 있습니다." }, { status: 422 });
    }

    const fields = await extractFromMarkdown(markdown, { type, isSale });
    return NextResponse.json({
      ok: true,
      source,
      fields,
      markdownChars: markdown.length,
      ms: Date.now() - t0,
    });
  } catch (e) {
    console.error("[admin/extract] error", e);
    return NextResponse.json({ error: (e as Error).message ?? "추출 실패" }, { status: 500 });
  }
}
