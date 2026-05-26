import { NextResponse, type NextRequest } from "next/server";

// 어드민 (/admin/*) + 어드민 API (/api/admin/*) 보호.
// 단일 비밀번호 (ADMIN_PASSWORD env) — 쿠키 값과 비교만 한다. 내부 검수용 도구 수준이라 단순.
// Next 16 부터 middleware → proxy 로 rename.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 로그인 자체는 보호 해제.
  if (pathname === "/admin/login" || pathname === "/api/admin/login") {
    return NextResponse.next();
  }

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return new NextResponse("ADMIN_PASSWORD 미설정", { status: 500 });
  }
  const session = req.cookies.get("admin_session")?.value;
  if (session && session === expected) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
