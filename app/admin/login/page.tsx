"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "../admin.css";

export default function AdminLoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") || "/admin/review";
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setErr(j.error || "로그인 실패");
      return;
    }
    router.replace(from);
  }

  return (
    <main className="a-login-shell">
      <form onSubmit={submit} className="a-login-card">
        <div className="a-login-brand">
          <div>
            <h1>부동산 어드민</h1>
            <p className="sub">LH 공고 검수 — 내부 도구</p>
          </div>
        </div>
        <div className="a-field">
          <label htmlFor="pw">비밀번호</label>
          <input
            id="pw"
            type="password"
            autoFocus
            placeholder="ADMIN_PASSWORD"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          {err && <span className="a-msg error">{err}</span>}
        </div>
        <button type="submit" disabled={busy || !pw} className="a-btn primary">
          {busy ? "확인 중..." : "로그인"}
        </button>
      </form>
    </main>
  );
}
