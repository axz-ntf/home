// 로그인/회원가입 좌측 브랜드 패널 — 데스크탑에서만 표시(모바일은 CSS로 숨김).
export function AuthBrandPanel() {
  return (
    <aside className="auth-brand" aria-hidden>
      <div className="auth-brand-inner">
        <div className="auth-brand-logo">
          <strong>공공임대주택 부동산</strong>
        </div>
        <h2 className="auth-brand-title">
          공공임대·청년주택,<br />
          한눈에 찾고 자격까지
        </h2>
        <p className="auth-brand-sub">
          LH·SH·청년안심 공고를 지도에서 모아보고,<br />
          AI가 내 자격을 바로 확인해 드려요.
        </p>
      </div>
    </aside>
  );
}
