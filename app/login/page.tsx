"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadProfile } from "@/lib/profile";
import { AuthBrandPanel } from "@/components/auth-brand-panel";
import { Button } from "@/components/button";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/");
    });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password: pw });
    if (error) { setBusy(false); setErr("이메일 또는 비밀번호가 올바르지 않아요."); return; }
    // 자격 미입력 사용자는 온보딩으로.
    const profile = await loadProfile();
    setBusy(false);
    router.replace(profile ? "/" : "/onboarding");
  }

  return (
    <div className="login-page">
      <AuthBrandPanel />
      <div className="login-card">
        <Link href="/" className="login-brand" aria-label="홈으로">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="다음" width={28} height={28} />
          <strong>부동산</strong>
        </Link>

        <h1 className="login-title">로그인</h1>
        <p className="login-sub">이메일과 비밀번호로 로그인하세요.</p>

        <form onSubmit={submit}>
          <label className="login-label">이메일</label>
          <input type="email" required autoFocus className="login-input" placeholder="you@example.com"
            value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />

          <label className="login-label">비밀번호</label>
          <input type="password" required className="login-input" placeholder="비밀번호"
            value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />

          {err && <div className="login-err">{err}</div>}

          <Button variant="solid" color="primary" size="2xl" fullWidth type="submit" loading={busy} className="login-submit-btn">로그인</Button>
        </form>

        <p className="login-switch">
          계정이 없으신가요? <Link href="/signup">회원가입</Link>
        </p>

        <p className="login-foot">
          로그인하면 저장한 자격으로 맞춤 공고를 추천받고,<br />
          AI 자격상담도 내 조건에 맞춰 받을 수 있어요.
        </p>
      </div>
    </div>
  );
}
