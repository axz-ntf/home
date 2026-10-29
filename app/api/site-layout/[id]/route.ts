// GET /api/site-layout/{listingId} — 단지 동 배치(3D 모형·일조용). 없으면 404.
import { NextResponse } from "next/server";
import { getSiteLayout } from "@/lib/site-layout";

export const runtime = "nodejs"; // fs 사용

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = getSiteLayout(id);
  if (!data || !data.buildings?.length) return NextResponse.json({ ok: false }, { status: 404 });
  return NextResponse.json({ ok: true, data });
}
