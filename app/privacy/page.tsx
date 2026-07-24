import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보처리방침 — 공공임대주택 부동산",
  robots: { index: false },
};

// 개인정보 보호법 필수 고지 사항만 간결하게. 위탁·국외이전(§26·§28-8)은 법정 필수라 유지.
// [운영자명]·[문의 이메일] 은 게시 전 실제 값으로 치환할 것.

function Card({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="pv-card">
      <h2><span className="pv-num">{n}</span>{title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div style={{ height: "100dvh", overflowY: "auto" }}>
      <div className="post-page">
        <header className="post-nav">
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", color: "inherit" }}>
            <strong style={{ fontSize: 16, letterSpacing: "-0.02em" }}>공공임대주택 부동산</strong>
          </Link>
        </header>

        <div className="post-head">
          <h1 className="post-title">개인정보처리방침</h1>
        </div>

        <div className="pv-dates">
          <span>시행일자 2026. 7. 24.</span>
        </div>

        {/* 한눈에 보기 — 핵심 원칙 4가지 */}
        <div className="pv-summary" aria-label="개인정보 처리 핵심 요약">
          <div className="pv-summary-tile">
            <span className="pv-ico" aria-hidden>🪶</span>
            <strong>최소 수집</strong>
            <span>회원가입 없이 이용 가능, 필요한 정보만 처리해요</span>
          </div>
          <div className="pv-summary-tile">
            <span className="pv-ico" aria-hidden>🛡️</span>
            <strong>주민번호 미수집</strong>
            <span>고유식별정보는 받지 않고, 입력돼도 자동 삭제돼요</span>
          </div>
          <div className="pv-summary-tile">
            <span className="pv-ico" aria-hidden>💬</span>
            <strong>AI 대화 미저장</strong>
            <span>상담 내용은 답변 생성 후 서버에 남지 않아요</span>
          </div>
          <div className="pv-summary-tile">
            <span className="pv-ico" aria-hidden>🚫</span>
            <strong>광고 추적 없음</strong>
            <span>통계 분석만 하고 맞춤형 광고에 쓰지 않아요</span>
          </div>
        </div>

        <article>
          <Card n={1} title="수집하는 정보와 목적">
            <ul>
              <li><strong>이용 통계</strong> — 쿠키·방문 기록 (Google Analytics, 서비스 개선 목적)</li>
              <li><strong>AI 상담 입력 내용</strong> — 나이·소득 구간 등 이용자가 대화에 직접 쓴 정보 (답변 생성 목적)</li>
              <li><strong>위치</strong> — &ldquo;내 위치&rdquo; 사용 시 지도 이동에만 일시 사용, 서버로 보내지 않음</li>
              <li><strong>자격 프로필</strong> — 저장을 선택한 경우만 (맞춤 상담 목적)</li>
            </ul>
            <p className="pv-note">
              주민등록번호 등 고유식별정보는 수집하지 않으며, AI 상담에 입력돼도 전송 전에 자동
              삭제됩니다.
            </p>
          </Card>

          <Card n={2} title="보유 기간과 파기">
            <ul>
              <li>AI 상담 대화 — 답변 생성 즉시 폐기, 서버에 저장하지 않음</li>
              <li>이용 통계 — 최대 14개월 후 자동 삭제</li>
              <li>자격 프로필 — 이용자가 삭제를 요청하면 지체 없이 파기</li>
            </ul>
          </Card>

          <Card n={3} title="제3자 제공">
            <p>이용자의 개인정보를 제3자에게 제공하지 않습니다. (별도 동의 또는 법령상 의무가 있는 경우 제외)</p>
          </Card>

          <Card n={4} title="처리 위탁 및 국외 이전">
            <p>
              아래 업체가 서비스 기능을 대신 처리하며, 서버가 국외(미국)에 있어 해당 정보가 국외로
              이전됩니다. 이 고지는 개인정보 보호법상 필수 항목입니다.
            </p>
            <div className="pv-table-wrap">
              <table className="pv-table">
                <thead>
                  <tr><th>수탁자 (국가)</th><th>업무</th><th>이전되는 정보</th><th>보유</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Google LLC (미국)</td>
                    <td>방문 통계 분석</td>
                    <td>쿠키, 이용기록</td>
                    <td>최대 14개월</td>
                  </tr>
                  <tr>
                    <td>Anthropic PBC 등 AI 업체 (미국)</td>
                    <td>AI 상담 답변 생성</td>
                    <td>상담 입력 내용</td>
                    <td>미보관 · 학습에 사용 안 함</td>
                  </tr>
                  <tr>
                    <td>Supabase Inc. (미국)</td>
                    <td>데이터 저장</td>
                    <td>자격 프로필 (저장 선택 시)</td>
                    <td>삭제 요청 시까지</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              국외 이전을 원하지 않으면 해당 기능(AI 상담·프로필 저장)을 사용하지 않거나 아래
              연락처로 중단을 요구할 수 있습니다.
            </p>
          </Card>

          <Card n={5} title="이용자의 권리">
            <p>
              언제든지 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 아래 연락처로 요구할 수
              있으며, 지체 없이 처리합니다.
            </p>
          </Card>

          <Card n={6} title="쿠키와 안전 조치">
            <p>
              쿠키는 브라우저 설정에서 거부·삭제할 수 있고, 거부해도 이용에 제한이 없습니다.
              모든 통신은 암호화(HTTPS)되며, 수집 항목 최소화와 주민등록번호 자동 마스킹을
              적용하고 있습니다.
            </p>
          </Card>

          <Card n={7} title="문의 및 보호책임자">
            <ul>
              <li>개인정보 보호책임자: [운영자명]</li>
              <li>문의: [문의 이메일]</li>
            </ul>
            <p>
              별도 구제가 필요한 경우 개인정보분쟁조정위원회(1833-6972) 또는
              개인정보침해신고센터(118)에 문의할 수 있습니다.
            </p>
          </Card>

          <Card n={8} title="방침의 변경">
            <p>내용이 바뀌는 경우 시행 7일 전부터 본 페이지를 통해 알립니다.</p>
          </Card>
        </article>

        <Link href="/" className="post-home">홈으로 돌아가기</Link>
      </div>
    </div>
  );
}
