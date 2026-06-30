"use client";

import { useState } from "react";
import type { HousingTypeId } from "@/lib/types";
import { judge, type EligibilityForm } from "@/lib/eligibility";
import { EligibilityFields, INITIAL_FORM, canNext1, canNext2 } from "./eligibility-fields";
import { CloseIcon } from "./icons";
import { Button } from "./button";

export function EligibilityModal({
  open,
  onClose,
  onApplyFilter,
}: {
  open: boolean;
  onClose: () => void;
  onApplyFilter: (types: HousingTypeId[]) => void;
}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<EligibilityForm>(INITIAL_FORM);

  if (!open) return null;

  const update = <K extends keyof EligibilityForm>(k: K, v: EligibilityForm[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const result = step === 3 ? judge(form) : null;

  const applyToFilter = () => {
    if (!result) return;
    const eligibleTypes = result.results.filter((r) => r.status === "eligible").map((r) => r.id);
    onApplyFilter(eligibleTypes);
    onClose();
  };

  return (
    <div className="eli-overlay" onClick={onClose}>
      <div className="eli-modal" onClick={(e) => e.stopPropagation()}>
        <header className="eli-header">
          <div>
            <div className="eli-kicker">내 자격 확인</div>
            <h2>어떤 공공임대에 지원할 수 있는지 알아볼게요</h2>
          </div>
          <button className="eli-x" onClick={onClose} aria-label="닫기">
            <CloseIcon size={14} />
          </button>
        </header>

        <div className="eli-stepper">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`eli-step ${step >= n ? "on" : ""} ${step === n ? "cur" : ""}`}>
              <span className="eli-step-num">{step > n ? "✓" : n}</span>
              <span className="eli-step-label">{["기본 정보", "소득·자산", "결과"][n - 1]}</span>
            </div>
          ))}
        </div>

        <div className="eli-body">
          {step === 1 && <EligibilityFields step={1} form={form} update={update} />}

          {step === 2 && <EligibilityFields step={2} form={form} update={update} />}

          {step === 3 && result && (
            <div className="eli-result">
              <div className="eli-result-summary">
                <div className="eli-result-kicker">판정 완료</div>
                <div className="eli-result-title">
                  신청 가능한 유형 <em>{result.results.filter((r) => r.status === "eligible").length}개</em>
                </div>
                <div className="eli-result-meta">
                  만 {form.age}세 · {form.household}인 세대 · 월소득{" "}
                  {parseInt(form.income).toLocaleString()}만원 (도시근로자 {result.incomeRatio}%)
                </div>
              </div>

              {result.results.map((r) => (
                <div key={r.id} className={`eli-card ${r.status}`}>
                  <div className="eli-card-head">
                    <span className={`badge ${r.badge}`} style={{ fontSize: 12, padding: "3px 9px" }}>
                      {r.name}
                    </span>
                    <div className={`eli-card-status ${r.status}`}>
                      {r.status === "eligible" ? "✓ 신청 가능" : "× 요건 미충족"}
                    </div>
                  </div>
                  {r.fits.length > 0 && (
                    <ul className="eli-card-fits">
                      {r.fits.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  )}
                  {r.reason && <div className="eli-card-reason">{r.reason}</div>}
                  <div className="eli-card-meta">
                    <span>임대료 {r.rentRatio}</span>
                    <span>·</span>
                    <span>거주 {r.stayYears}</span>
                  </div>
                </div>
              ))}

              <div className="eli-disclaimer">
                * 본 결과는 입력값을 토대로 한 예비 판정이며, 실제 자격은 모집공고별 기준과 심사 결과에 따라 달라질 수 있습니다.
              </div>
            </div>
          )}
        </div>

        <footer className="eli-footer">
          {step > 1 && (
            <Button variant="outline" color="ghost" size="md" onClick={() => setStep(step - 1)}>
              이전
            </Button>
          )}
          <div style={{ flex: 1 }} />
          {step === 1 && (
            <Button variant="solid" color="primary" size="md" disabled={!canNext1(form)} onClick={() => setStep(2)}>
              다음
            </Button>
          )}
          {step === 2 && (
            <Button variant="solid" color="primary" size="md" disabled={!canNext2(form)} onClick={() => setStep(3)}>
              결과 보기
            </Button>
          )}
          {step === 3 && result && (
            <>
              <Button variant="outline" color="ghost" size="md" onClick={() => setStep(1)}>
                다시 입력
              </Button>
              <Button
                variant="solid"
                color="primary"
                size="md"
                disabled={result.results.filter((r) => r.status === "eligible").length === 0}
                onClick={applyToFilter}
              >
                가능한 매물만 보기 →
              </Button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
