import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보처리방침 — 공공임대주택 부동산",
  robots: { index: false },
};

// 확정 목업(claude artifact debe177f) 기준. 국외 이전 고지는 하단 각주로 최소화(운영자 결정).
// [운영자명]·[문의 이메일] 은 게시 전 실제 값으로 치환할 것.

function Card({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="pv-card">
      <h2><span className="pv-num">{n}</span>{title}</h2>
      {children}
    </section>
  );
}

const ShieldIcon = (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

export default function PrivacyPage() {
  return (
    <div style={{ height: "100dvh", overflowY: "auto" }}>
      <div className="pv-page">
        <header className="pv-gnb">
          <Link href="/">
            <strong>공공임대주택 부동산</strong>
          </Link>
        </header>

        <div className="pv-hero">
          <span className="pv-eyebrow">PRIVACY</span>
          <h1>개인정보처리방침</h1>
          <p>꼭 필요한 정보만, 꼭 필요한 만큼만. 이 서비스가 이용자의 정보를 어떻게 다루는지 투명하게 알려드립니다.</p>
          <span className="pv-hero-date">시행일 2026. 7. 24.</span>
        </div>

        <div className="pv-summary" aria-label="개인정보 처리 핵심 요약">
          <div className="pv-summary-tile">
            <div className="pv-ico"><svg viewBox="0 0 24 24" aria-hidden><path d="M20 4 8 16m4-12H4v16h16v-8" /></svg></div>
            <strong>최소 수집</strong>
            <small>회원가입 없이 이용 가능, 필요한 정보만 처리해요</small>
          </div>
          <div className="pv-summary-tile">
            <div className="pv-ico">{ShieldIcon}</div>
            <strong>주민번호 미수집</strong>
            <small>고유식별정보는 받지 않고, 입력돼도 자동 삭제돼요</small>
          </div>
          <div className="pv-summary-tile">
            <div className="pv-ico"><svg viewBox="0 0 24 24" aria-hidden><path d="M21 12a8 8 0 1 1-4-6.9" /><path d="M8 12h.01M12 12h.01M16 12h.01" /></svg></div>
            <strong>AI 대화 미저장</strong>
            <small>상담 내용은 답변 생성 후 서버에 남지 않아요</small>
          </div>
          <div className="pv-summary-tile">
            <div className="pv-ico"><svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></svg></div>
            <strong>광고 추적 없음</strong>
            <small>통계 분석만 하고 맞춤형 광고에 쓰지 않아요</small>
          </div>
        </div>

        <article>
          <Card n={1} title="수집하는 정보와 목적">
            <dl className="pv-rows">
              <div className="pv-row">
                <dt>이용 통계</dt>
                <dd>쿠키·방문 기록<small>서비스 개선 목적 · Google Analytics</small></dd>
              </div>
              <div className="pv-row">
                <dt>AI 상담</dt>
                <dd>나이·소득 구간 등 대화에 직접 쓴 정보<small>답변 생성 목적</small></dd>
              </div>
              <div className="pv-row">
                <dt>위치</dt>
                <dd>&ldquo;내 위치&rdquo; 사용 시 지도 이동에만 일시 사용<small>서버로 보내지 않아요</small></dd>
              </div>
              <div className="pv-row">
                <dt>자격 프로필</dt>
                <dd>연령대·가구·소득 구간<small>저장을 선택한 경우만 · 맞춤 상담 목적</small></dd>
              </div>
            </dl>
            <div className="pv-note">
              {ShieldIcon}
              <span>주민등록번호 등 고유식별정보는 수집하지 않으며, AI 상담에 입력돼도 전송 전에 자동 삭제됩니다.</span>
            </div>
          </Card>

          <Card n={2} title="보관과 파기">
            <ul>
              <li>AI 상담 대화 — 답변 생성 즉시 폐기, 서버에 저장하지 않음</li>
              <li>이용 통계 — 최대 14개월 후 자동 삭제</li>
              <li>자격 프로필 — 삭제를 요청하면 지체 없이 파기</li>
            </ul>
          </Card>

          <Card n={3} title="제3자 제공">
            <p>
              이용자의 개인정보를 제3자에게 제공하지 않습니다.{" "}
              <span className="pv-muted">(별도 동의 또는 법령상 의무가 있는 경우 제외)</span>
            </p>
          </Card>

          <Card n={4} title="이용자의 권리">
            <p>
              언제든지 자신의 정보에 대한 열람·정정·삭제·처리정지를 요구할 수 있고, 지체 없이
              처리합니다. 쿠키는 브라우저 설정에서 거부할 수 있으며 거부해도 이용에 제한이
              없습니다.
            </p>
          </Card>

          <Card n={5} title="문의">
            <div className="pv-contact">
              <span className="pv-chip">보호책임자 <span>[운영자명]</span></span>
              <span className="pv-chip">이메일 <span>[문의 이메일]</span></span>
              <span className="pv-chip">분쟁조정 <span>1833-6972 · KISA 118</span></span>
            </div>
          </Card>
        </article>

        <p className="pv-footnote">
          통계 분석(Google)과 AI 답변 생성(Anthropic 등) 과정에서 입력 정보가 해외(미국) 서버에서
          처리됩니다. 원하지 않는 경우 해당 기능을 사용하지 않거나 문의 연락처로 중단을 요구할 수
          있습니다. 방침이 변경되면 시행 7일 전 본 페이지에서 알립니다.
        </p>

        <Link href="/" className="pv-home">홈으로 돌아가기 →</Link>
      </div>
    </div>
  );
}
