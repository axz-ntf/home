"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EligibilityFields, INITIAL_FORM, canNext1, canNext2 } from "@/components/eligibility-fields";
import { loadProfileFull, saveProfile } from "@/lib/profile";
import { Button } from "@/components/button";
import type { EligibilityForm } from "@/lib/eligibility";

// 닉네임은 선택값 — 입력했을 때만 검증. (2~20자, 한글·영문·숫자·공백·._-)
function validateNickname(nickname: string): string | null {
  const v = nickname.trim();
  if (!v) return null;
  if (v.length < 2) return "닉네임은 2자 이상이어야 해요.";
  if (v.length > 20) return "닉네임은 20자 이하로 입력해주세요.";
  if (!/^[가-힣a-zA-Z0-9 _.-]+$/.test(v)) return "닉네임에 사용할 수 없는 문자가 있어요.";
  return null;
}

// saveProfile 이 돌려준 원본 에러 메시지를 사용자용 문구로.
function friendlyError(msg: string): string {
  if (/network|fetch|failed to fetch/i.test(msg)) return "네트워크 연결이 불안정해요. 잠시 후 다시 시도해주세요.";
  return "저장에 실패했어요. 잠시 후 다시 시도해주세요.";
}

// 자격 폼+닉네임을 dirty 비교용 문자열로 직렬화.
const snapshot = (form: EligibilityForm, nickname: string) => JSON.stringify({ form, nickname: nickname.trim() });

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
  const [baseline, setBaseline] = useState<string | null>(null); // 마지막 저장(또는 로드) 시점 스냅샷

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await loadProfileFull();
      if (!alive) return;
      if (!r.loggedIn) { router.replace("/login"); return; }
      setEmail(r.email ?? "");
      const loadedForm = r.form ?? INITIAL_FORM;
      const loadedNick = r.nickname ?? "";
      setForm(loadedForm);
      setNickname(loadedNick);
      setBaseline(snapshot(loadedForm, loadedNick));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [router]);

  const update = <K extends keyof EligibilityForm>(k: K, v: EligibilityForm[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const nicknameError = validateNickname(nickname);
  const valid = canNext1(form) && canNext2(form);
  const dirty = !loading && baseline !== null && baseline !== snapshot(form, nickname);

  // 미입력 필드 안내 — 저장이 막힐 때 무엇이 비었는지 표시.
  const missing = useMemo(() => {
    const m: string[] = [];
    if (!form.age) m.push("나이");
    if (form.income === "") m.push("세대 월평균 소득");
    if (form.assets === "") m.push("세대 총자산");
    return m;
  }, [form.age, form.income, form.assets]);

  // 저장 안 한 변경사항이 있으면 브라우저 이탈(새로고침·닫기) 시 경고.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function goBack() {
    if (dirty && !window.confirm("저장하지 않은 변경사항이 있어요. 나가시겠어요?")) return;
    router.back();
  }

  async function save() {
    if (nicknameError || !valid) return;
    setBusy(true);
    setErr(null);
    const { error } = await saveProfile(form, nickname);
    setBusy(false);
    if (error) {
      if (error.includes("로그인")) { router.replace("/login"); return; }
      setErr(friendlyError(error));
      return;
    }
    setBaseline(snapshot(form, nickname)); // 저장 성공 → dirty 해제
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  const canSave = valid && !nicknameError && !loading;

  return (
    <div className="profile-page">
      <div className="profile-topbar">
        <Link href="/" className="profile-logo" aria-label="홈으로">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={24} height={24} />
          <strong>부동산</strong>
        </Link>
        <button type="button" className="profile-back" onClick={goBack}>← 뒤로</button>
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
                      aria-invalid={!!nicknameError}
                    />
                    {nicknameError && <div className="eli-warn">{nicknameError}</div>}
                  </div>
                </div>
              </div>
              <EligibilityFields step={1} form={form} update={update} />
            </section>

            <section className="profile-section">
              <h2>소득·자산</h2>
              <EligibilityFields step={2} form={form} update={update} />
            </section>

            {err && (
              <p className="profile-err">
                {err} <button type="button" className="profile-retry" onClick={save}>다시 시도</button>
              </p>
            )}

            {!loading && !valid && missing.length > 0 && (
              <p className="profile-hint">아직 입력하지 않은 항목이 있어요: {missing.join(", ")}</p>
            )}

            <div className="profile-actions">
              <Button variant="solid" color="primary" size="2xl" fullWidth loading={busy || loading} disabled={!canSave} onClick={save}>
                {saved ? "저장됨 ✓" : "저장하기"}
              </Button>
            </div>
        </>
      </div>
    </div>
  );
}
