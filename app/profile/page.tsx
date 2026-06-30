"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EligibilityFields, INITIAL_FORM, canNext1, canNext2 } from "@/components/eligibility-fields";
import { loadProfileFull, saveProfile } from "@/lib/profile";
import { Button } from "@/components/button";
import type { EligibilityForm } from "@/lib/eligibility";

// 프로필 수정 — 당근 계정화면형 레이아웃(좁은 중앙 컬럼 + 아바타·이름 + 섹션 행),
// 색상은 다음 스타일. 공유 EligibilityFields(step 1·2) 재사용, 미로그인이면 /login.
export default function ProfileEditPage() {
  const router = useRouter();
  const [form, setForm] = useState<EligibilityForm>(INITIAL_FORM);
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await loadProfileFull();
      if (!alive) return;
      if (!r.loggedIn) { router.replace("/login"); return; }
      setEmail(r.email ?? "");
      if (r.form) setForm(r.form);
      if (r.nickname) setNickname(r.nickname);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [router]);

  const update = <K extends keyof EligibilityForm>(k: K, v: EligibilityForm[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  async function save() {
    setBusy(true);
    setErr(null);
    const { error } = await saveProfile(form, nickname);
    setBusy(false);
    if (error) { setErr(error); return; }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  const valid = canNext1(form) && canNext2(form);

  return (
    <div className="profile-page">
      <div className="profile-topbar">
        <Link href="/" className="profile-logo" aria-label="홈으로">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={24} height={24} />
          <strong>부동산</strong>
        </Link>
        <button type="button" className="profile-back" onClick={() => router.back()}>← 뒤로</button>
      </div>

      <div className="profile-content">
        <div className="profile-hero">
          <div className="profile-avatar" aria-hidden>
            <svg viewBox="0 0 24 24" width="38" height="38" fill="none">
              <circle cx="12" cy="8.2" r="3.8" fill="currentColor" />
              <path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" fill="currentColor" />
            </svg>
          </div>
          <div className="profile-hero-name">{nickname || email || "내 프로필"}</div>
        </div>

        {/* 빈 로딩 화면 없이 폼을 즉시 렌더 — 저장한 값은 로드되면 채워짐(저장은 로드 전까지 비활성). */}
        <>
            {email && (
              <section className="profile-section">
                <h2>계정</h2>
                <div className="profile-row">
                  <span className="profile-row-label">이메일</span>
                  <span className="profile-row-value">{email}</span>
                </div>
              </section>
            )}

            <section className="profile-section">
              <h2>기본 정보</h2>
              <div className="eli-form">
                <div className="eli-field">
                  <div className="eli-field-label">닉네임</div>
                  <div>
                    <input
                      type="text"
                      className="profile-input"
                      placeholder="표시될 이름 (선택)"
                      value={nickname}
                      maxLength={20}
                      onChange={(e) => setNickname(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <EligibilityFields step={1} form={form} update={update} />
            </section>

            <section className="profile-section">
              <h2>소득·자산</h2>
              <EligibilityFields step={2} form={form} update={update} />
            </section>

            {err && <p className="profile-err">{err}</p>}

            <div className="profile-actions">
              <Button variant="solid" color="primary" size="2xl" fullWidth loading={busy || loading} disabled={!valid || loading} onClick={save}>
                {saved ? "저장됨 ✓" : "저장하기"}
              </Button>
            </div>
        </>
      </div>
    </div>
  );
}
