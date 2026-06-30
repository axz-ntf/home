"use client";

import { urbanIncomeFor, type EligibilityForm } from "@/lib/eligibility";

// 모달(EligibilityModal)과 온보딩(/onboarding)이 공유하는 자격 입력 폼.
// step 1: 기본 정보 / step 2: 소득·자산.

export const INITIAL_FORM: EligibilityForm = {
  age: "",
  married: "",
  marriedYears: "",
  household: "2",
  income: "",
  assets: "",
  houseOwner: "no",
  region: "seoul",
  specialCase: [],
};

export const canNext1 = (f: EligibilityForm) => Boolean(f.age && f.household && f.houseOwner);
export const canNext2 = (f: EligibilityForm) => f.income !== "" && f.assets !== "";

function Field({ label, subtitle, children }: { label: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="eli-field">
      <div className="eli-field-label">
        <div>{label}</div>
        {subtitle && <div className="eli-field-sub">{subtitle}</div>}
      </div>
      <div>{children}</div>
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

export function EligibilityFields({
  step,
  form,
  update,
}: {
  step: 1 | 2;
  form: EligibilityForm;
  update: <K extends keyof EligibilityForm>(k: K, v: EligibilityForm[K]) => void;
}) {
  const toggleSpecial = (v: string) => {
    if (form.specialCase.includes(v)) update("specialCase", form.specialCase.filter((x) => x !== v));
    else update("specialCase", [...form.specialCase, v]);
  };

  if (step === 1) {
    return (
      <div className="eli-form">
        <Field label="나이" subtitle="만 나이 기준">
          <div className="eli-input-row">
            <input
              type="number"
              className="eli-input"
              placeholder="예: 29"
              value={form.age}
              onChange={(e) => update("age", e.target.value)}
            />
            <span className="eli-suffix">세</span>
          </div>
        </Field>

        <Field label="혼인 상태">
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
            <div className="eli-input-row" style={{ marginTop: 8 }}>
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
        </Field>

        <Field label="세대 구성원 수" subtitle="본인 포함">
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
        </Field>

        <Field label="주택 소유" subtitle="세대 구성원 전원 기준">
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
        </Field>

        <Field label="해당 사항 선택" subtitle="선택한 조건으로 우선공급 대상이 될 수 있어요">
          <div className="eli-chips">
            {[
              { v: "student", label: "대학생" },
              { v: "children", label: "자녀 있음" },
              { v: "multichild", label: "다자녀(3명+)" },
              { v: "parentcare", label: "노부모 부양" },
              { v: "disabled", label: "장애인" },
              { v: "veteran", label: "국가유공자" },
            ].map((c) => (
              <button
                key={c.v}
                className={`eli-chip ${form.specialCase.includes(c.v) ? "on" : ""}`}
                onClick={() => toggleSpecial(c.v)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </Field>
      </div>
    );
  }

  return (
    <div className="eli-form">
      <div className="eli-info-box">
        2026년 기준 {form.household}인 세대의 도시근로자 월평균 소득은{" "}
        <strong>{urbanIncomeFor(form.household).toLocaleString()}만원</strong>으로 산정됩니다.
      </div>

      <Field label="세대 월평균 소득" subtitle="세전, 세대원 합산 (상여 포함)">
        <div className="eli-input-row">
          <input
            type="number"
            className="eli-input"
            placeholder="예: 420"
            value={form.income}
            onChange={(e) => update("income", e.target.value)}
          />
          <span className="eli-suffix">만원 / 월</span>
        </div>
        {form.income && (
          <div className="eli-hint">
            도시근로자 소득의{" "}
            <strong>{Math.round((parseInt(form.income) / urbanIncomeFor(form.household)) * 100)}%</strong> 수준
          </div>
        )}
      </Field>

      <Field label="세대 총자산" subtitle="부동산·금융·자동차 합산 (부채 차감)">
        <div className="eli-input-row">
          <input
            type="number"
            className="eli-input"
            placeholder="예: 8000"
            value={form.assets}
            onChange={(e) => update("assets", e.target.value)}
          />
          <span className="eli-suffix">만원</span>
        </div>
        <div className="eli-hint">
          공공임대 자산 기준: <strong>3억 6,100만원 이하</strong>
        </div>
      </Field>

      <Field label="거주 지역">
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
      </Field>
    </div>
  );
}
