"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { INITIAL_FORM } from "@/components/eligibility-fields";
import { saveProfile } from "@/lib/profile";
import type { EligibilityForm } from "@/lib/eligibility";
import type { IconType } from "react-icons";
import {
  MdOutlineWavingHand,
  MdOutlineFavorite,
  MdOutlineFamilyRestroom,
  MdOutlineVpnKey,
  MdOutlineStars,
  MdOutlinePayments,
  MdOutlineSavings,
  MdOutlineLocationOn,
  MdOutlineCelebration,
} from "react-icons/md";

// 풀스텝 온보딩: 한 화면 = 한 질문 = 한 아이콘.
// 단계별 아이콘은 블루 그라데이션 원 안에 흰색 글리프로 표시.

type StepKey = "age" | "married" | "household" | "houseOwner" | "special" | "income" | "assets" | "region";

const STEPS: {
  key: StepKey;
  Icon: IconType;
  grad: [string, string];
  title: string;
  sub?: string;
  valid: (f: EligibilityForm) => boolean;
}[] = [
  // 그라데이션은 Daum 액센트 팔레트 기준 (Blue/Red/Green/Orange/Purple).
  { key: "age", Icon: MdOutlineWavingHand, grad: ["#1E84FF", "#47A9FF"], title: "나이가 어떻게 되세요?", sub: "만 나이 기준", valid: (f) => !!f.age },
  { key: "married", Icon: MdOutlineFavorite, grad: ["#FF4E33", "#FF7A66"], title: "혼인 상태를 알려주세요", sub: "예비부부도 신청할 수 있어요", valid: (f) => !!f.married },
  { key: "household", Icon: MdOutlineFamilyRestroom, grad: ["#18BA45", "#3ECF6E"], title: "세대 구성원은 몇 명인가요?", sub: "본인 포함", valid: () => true },
  { key: "houseOwner", Icon: MdOutlineVpnKey, grad: ["#FF9429", "#FFB35E"], title: "주택을 소유하고 있나요?", sub: "세대 구성원 전원 기준", valid: () => true },
  { key: "special", Icon: MdOutlineStars, grad: ["#A05CFF", "#BC8AFF"], title: "해당하는 조건이 있나요?", sub: "선택하면 우선공급 대상이 될 수 있어요 · 없으면 건너뛰기", valid: () => true },
  { key: "income", Icon: MdOutlinePayments, grad: ["#9557C0", "#B07FD8"], title: "세대 월평균 소득은요?", sub: "세전, 세대원 합산 (상여 포함)", valid: (f) => f.income !== "" },
  { key: "assets", Icon: MdOutlineSavings, grad: ["#0F9D58", "#18BA45"], title: "세대 총자산은 얼마인가요?", sub: "부동산·금융·자동차 합산 (부채 차감)", valid: (f) => f.assets !== "" },
  { key: "region", Icon: MdOutlineLocationOn, grad: ["#FF6B5C", "#FF8A73"], title: "어디에 거주하세요?", sub: "현재 거주 중인 지역을 선택해주세요", valid: () => true },
];

const DONE_GRAD: [string, string] = ["#A05CFF", "#1E84FF"];

function Mascot({ Icon, grad }: { Icon: IconType; grad: [string, string] }) {
  return (
    <div className="ob-mascot">
      <div
        className="ob-mascot-ph"
        aria-hidden
        style={{
          background: `linear-gradient(160deg, ${grad[0]}, ${grad[1]})`,
          boxShadow: `0 12px 28px ${grad[0]}52`,
        }}
      >
        <Icon />
      </div>
    </div>
  );
}

function Seg<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { v: T; label: string }[];
}) {
  return (
    <div className="eli-seg">
      {options.map((o) => (
        <button key={o.v} className={value === o.v ? "on" : ""} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const SPECIAL_OPTIONS = [
  { v: "student", label: "대학생" },
  { v: "children", label: "자녀 있음" },
  { v: "multichild", label: "다자녀(3명+)" },
  { v: "parentcare", label: "노부모 부양" },
  { v: "disabled", label: "장애인" },
  { v: "veteran", label: "국가유공자" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [i, setI] = useState(0);
  const [form, setForm] = useState<EligibilityForm>(INITIAL_FORM);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (!data.user) router.replace("/login");
      else setReady(true);
    });
  }, [router]);

  const update = <K extends keyof EligibilityForm>(k: K, v: EligibilityForm[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const toggleSpecial = (v: string) =>
    update(
      "specialCase",
      form.specialCase.includes(v) ? form.specialCase.filter((x) => x !== v) : [...form.specialCase, v],
    );

  const isLast = i === STEPS.length - 1;
  const step = STEPS[i];

  async function next() {
    if (!isLast) {
      setI(i + 1);
      return;
    }
    setBusy(true);
    setErr("");
    const { error } = await saveProfile(form);
    setBusy(false);
    if (error) {
      setErr("저장에 실패했어요. 잠시 후 다시 시도해주세요.");
      return;
    }
    setDone(true);
  }

  function back() {
    if (i === 0) router.replace("/");
    else setI(i - 1);
  }

  if (!ready) return null;

  if (done) {
    return (
      <div className="ob">
        <div className="ob-main">
          <div className="ob-card">
            <Mascot Icon={MdOutlineCelebration} grad={DONE_GRAD} />
            <h1 className="ob-q">자격 입력 완료!</h1>
            <p className="ob-q-sub">이제 신청 가능한 공공임대만 골라서 보여드릴게요.</p>
            <div className="ob-foot">
              <button className="eli-btn-primary" onClick={() => router.replace("/")}>
                공고 보러가기
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ob">
      <header className="ob-top">
        <Link href="/" className="ob-brand" aria-label="홈으로">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="다음" width={26} height={26} />
          <strong>부동산</strong>
        </Link>
        <div className="ob-progress" aria-label={`${i + 1} / ${STEPS.length} 단계`}>
          {STEPS.map((s, n) => (
            <span key={s.key} className={`ob-dot ${n === i ? "on" : n < i ? "done" : ""}`} />
          ))}
        </div>
      </header>

      <div className="ob-main">
        <div className="ob-card" key={step.key}>
          <Mascot Icon={step.Icon} grad={step.grad} />
          <h1 className="ob-q">{step.title}</h1>
          <p className="ob-q-sub">{step.sub ?? " "}</p>

          <div className="ob-field">
            {step.key === "age" && (
              <div className="eli-input-row">
                <input
                  type="number"
                  className="eli-input"
                  placeholder="예: 29"
                  autoFocus
                  value={form.age}
                  onChange={(e) => update("age", e.target.value)}
                />
                <span className="eli-suffix">세</span>
              </div>
            )}

            {step.key === "married" && (
              <>
                <Seg
                  value={form.married}
                  onChange={(v) => update("married", v)}
                  options={[
                    { v: "single", label: "미혼" },
                    { v: "yes", label: "기혼" },
                    { v: "planning", label: "예비부부" },
                  ]}
                />
                {form.married === "yes" && (
                  <div className="eli-input-row">
                    <input
                      type="number"
                      className="eli-input"
                      placeholder="혼인 기간"
                      value={form.marriedYears}
                      onChange={(e) => update("marriedYears", e.target.value)}
                    />
                    <span className="eli-suffix">년차</span>
                  </div>
                )}
              </>
            )}

            {step.key === "household" && (
              <Seg
                value={form.household}
                onChange={(v) => update("household", v)}
                options={[
                  { v: "1", label: "1인" },
                  { v: "2", label: "2인" },
                  { v: "3", label: "3인" },
                  { v: "4", label: "4인" },
                  { v: "5", label: "5인+" },
                ]}
              />
            )}

            {step.key === "houseOwner" && (
              <>
                <Seg
                  value={form.houseOwner}
                  onChange={(v) => update("houseOwner", v)}
                  options={[
                    { v: "no", label: "무주택" },
                    { v: "yes", label: "유주택" },
                  ]}
                />
                {form.houseOwner === "yes" && (
                  <div className="eli-warn">⚠️ 유주택 세대는 공공임대 신청이 원칙적으로 불가합니다.</div>
                )}
              </>
            )}

            {step.key === "special" && (
              <div className="eli-chips">
                {SPECIAL_OPTIONS.map((c) => (
                  <button
                    key={c.v}
                    className={`eli-chip ${form.specialCase.includes(c.v) ? "on" : ""}`}
                    onClick={() => toggleSpecial(c.v)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            {step.key === "income" && (
              <div className="eli-input-row">
                <input
                  type="number"
                  className="eli-input"
                  placeholder="예: 420"
                  autoFocus
                  value={form.income}
                  onChange={(e) => update("income", e.target.value)}
                />
                <span className="eli-suffix">만원 / 월</span>
              </div>
            )}

            {step.key === "assets" && (
              <div className="eli-input-row">
                <input
                  type="number"
                  className="eli-input"
                  placeholder="예: 8000"
                  autoFocus
                  value={form.assets}
                  onChange={(e) => update("assets", e.target.value)}
                />
                <span className="eli-suffix">만원</span>
              </div>
            )}

            {step.key === "region" && (
              <Seg
                value={form.region}
                onChange={(v) => update("region", v)}
                options={[
                  { v: "seoul", label: "서울" },
                  { v: "gyeonggi", label: "경기" },
                  { v: "incheon", label: "인천" },
                  { v: "other", label: "기타" },
                ]}
              />
            )}
          </div>

          {err && <div className="login-err">{err}</div>}

          <div className="ob-foot">
            <button className="eli-btn-ghost" onClick={back}>
              {i === 0 ? "나중에 하기" : "이전"}
            </button>
            <button className="eli-btn-primary" disabled={!step.valid(form) || busy} onClick={next}>
              {busy ? "저장 중…" : isLast ? "완료" : "다음"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
