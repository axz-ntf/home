import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 매직링크 클릭 → ?code= 로 돌아옴 → 세션 교환 후 원래 위치로.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/?auth=error`);
}
