import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  // .trim() — vercel env 등 외부에서 값에 trailing newline/whitespace 가 섞이는 경우 방어.
  const password = typeof body?.password === "string" ? body.password.trim() : "";
  const expected = (process.env.ADMIN_PASSWORD ?? "").trim();
  if (!expected) return NextResponse.json({ error: "ADMIN_PASSWORD 미설정" }, { status: 500 });
  if (password !== expected) {
    return NextResponse.json({ error: "비밀번호가 틀렸어요" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin_session", expected, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30일
  });
  return res;
}
