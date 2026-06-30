"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmSent, setConfirmSent] = useState(false);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/");
    });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (pw !== pw2) { setErr("비밀번호가 일치하지 않아요."); return; }
    if (pw.length < 6) { setErr("비밀번호는 6자 이상이어야 해요."); return; }
    setBusy(true);
    const { data, error } = await createClient().auth.signUp({
      email: email.trim(),
      password: pw,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding` },
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    if (data.session) router.replace("/onboarding");   // 이메일 확인 OFF → 즉시 로그인 → 온보딩
    else setConfirmSent(true);                // 이메일 확인 ON → 인증 메일
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <Link href="/" className="login-brand" aria-label="홈으로">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="다음" width={28} height={28} />
          <strong>부동산</strong>
        </Link>

        {confirmSent ? (
          <div>
            <h1 className="login-title">인증 메일을 보냈어요</h1>
            <p className="login-sub"><strong>{email}</strong> 메일의 인증 링크를 누르면 가입이 완료돼요.</p>
            <p className="login-switch"><Link href="/login">로그인으로 돌아가기</Link></p>
          </div>
        ) : (
          <>
            <h1 className="login-title">회원가입</h1>
            <p className="login-sub">이메일과 비밀번호로 가입하세요.</p>

            <form onSubmit={submit}>
              <label className="login-label">이메일</label>
              <input type="email" required autoFocus className="login-input" placeholder="you@example.com"
                value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />

              <label className="login-label">비밀번호</label>
              <input type="password" required className="login-input" placeholder="6자 이상"
                value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />

              <label className="login-label">비밀번호 확인</label>
              <input type="password" required className="login-input" placeholder="비밀번호 재입력"
                value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />

              {err && <div className="login-err">{err}</div>}

              <button type="submit" className="login-submit" disabled={busy}>{busy ? "처리 중…" : "회원가입"}</button>
            </form>

            <p className="login-switch">
              이미 계정이 있으신가요? <Link href="/login">로그인</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
