import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보처리방침 — 공공임대주택 부동산",
  robots: { index: false },
};

// 개인정보 보호법 §30 · 보호위원회 표준 작성지침의 필수 조항 구성을 따른다.
// 실제 수집 현황(GA4·AI 상담·위치·자격 프로필) 기준 — 하지 않는 처리는 "하지 않음"으로 명시.
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
          <span>공고일자 2026. 7. 24.</span>
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
            <span>통계 목적 분석만 하고 맞춤형 광고에 쓰지 않아요</span>
          </div>
        </div>

        <article>
          <section className="pv-card">
            <p style={{ marginBottom: 0 }}>
              [운영자명](이하 &ldquo;운영자&rdquo;)은 공공임대주택 정보 서비스(이하 &ldquo;서비스&rdquo;)를
              운영하면서 「개인정보 보호법」 등 관련 법령을 준수하며, 정보주체의 개인정보를 적법하게
              처리하고 안전하게 관리하기 위해 다음과 같이 개인정보처리방침을 수립·공개합니다.
            </p>
            <div style={{ height: 14 }} />
          </section>

          <Card n={1} title="개인정보의 처리 목적">
            <ul>
              <li><strong>서비스 제공</strong> — 공공임대·분양 공고 탐색, AI 자격 상담, 관심 공고 저장 등 핵심 기능 제공</li>
              <li><strong>서비스 개선</strong> — 방문·이용 통계 분석을 통한 기능 개선 및 오류 파악</li>
            </ul>
          </Card>

          <Card n={2} title="처리하는 개인정보 항목">
            <div className="pv-table-wrap">
              <table className="pv-table">
                <thead>
                  <tr><th>구분</th><th>항목</th><th>수집 방법</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>자동 수집</td>
                    <td>쿠키, 방문·클릭 기록, 브라우저·기기 정보, 접속 로그</td>
                    <td>Google Analytics</td>
                  </tr>
                  <tr>
                    <td>AI 상담</td>
                    <td>대화에 입력한 정보 (나이·가구 구성·소득 구간·희망 지역 등)</td>
                    <td>이용자 직접 입력</td>
                  </tr>
                  <tr>
                    <td>위치정보</td>
                    <td>브라우저 좌표 — 지도 이동에 일시 사용, 서버 미전송</td>
                    <td>&ldquo;내 위치&rdquo; 사용 시</td>
                  </tr>
                  <tr>
                    <td>자격 프로필 <em>(선택)</em></td>
                    <td>연령대, 가구원 수, 소득 구간 등</td>
                    <td>이용자가 저장 선택 시</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="pv-note">
              주민등록번호 등 고유식별정보·민감정보는 수집하지 않으며 입력을 요구하지 않습니다.
              AI 상담에 주민등록번호 형식이 입력되면 외부 전송 전에 시스템이 자동 삭제(마스킹)합니다.
            </p>
          </Card>

          <Card n={3} title="개인정보의 처리 및 보유 기간">
            <ul>
              <li><strong>AI 상담 대화 내용</strong> — 답변 생성 즉시 목적 달성. 운영자 서버(DB)에 저장하지 않습니다.</li>
              <li><strong>Google Analytics 수집 데이터</strong> — 수집일로부터 최대 14개월 후 자동 파기.</li>
              <li><strong>자격 프로필</strong> — 이용자가 삭제하거나 서비스 이용 종료를 요청한 때 지체 없이 파기.</li>
              <li>관계 법령에 따라 보존이 필요한 경우 해당 법령에서 정한 기간 동안 보관할 수 있습니다.</li>
            </ul>
          </Card>

          <Card n={4} title="개인정보의 제3자 제공">
            <p>
              운영자는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만 이용자가 별도로 동의하거나
              법령에 특별한 규정이 있는 경우는 예외로 합니다.
            </p>
          </Card>

          <Card n={5} title="개인정보 처리의 위탁 및 국외 이전">
            <p>
              안정적인 서비스 제공을 위해 아래와 같이 처리를 위탁하며, 수탁자의 서버는 국외에 위치하여
              개인정보가 국외로 이전됩니다. 이전은 서비스 이용 시점에 네트워크를 통해 수시로 이루어집니다.
            </p>
            <div className="pv-table-wrap">
              <table className="pv-table">
                <thead>
                  <tr><th>수탁자 (국가)</th><th>위탁 업무</th><th>이전 항목</th><th>보유 기간</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Google LLC (미국)</td>
                    <td>방문 통계 분석 (Google Analytics)</td>
                    <td>쿠키, 이용기록</td>
                    <td>최대 14개월</td>
                  </tr>
                  <tr>
                    <td>Vercel Inc. (미국)</td>
                    <td>서비스 호스팅·로그 처리</td>
                    <td>접속 기록</td>
                    <td>위탁 계약 기간</td>
                  </tr>
                  <tr>
                    <td>Supabase Inc. (미국)</td>
                    <td>데이터 저장</td>
                    <td>자격 프로필 (저장 선택 시)</td>
                    <td>삭제·탈퇴 시까지</td>
                  </tr>
                  <tr>
                    <td>Anthropic PBC 등 AI 처리업체 (미국)</td>
                    <td>AI 상담 답변 생성</td>
                    <td>상담 입력 내용</td>
                    <td>답변 생성 후 미보관 (모델 학습에 사용되지 않음)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              국외 이전을 원하지 않는 경우 해당 기능(AI 상담, 프로필 저장)의 이용을 중단하거나 아래
              연락처로 이전 중단을 요구할 수 있습니다. 이 경우 서비스의 일부 이용이 제한될 수 있습니다.
            </p>
          </Card>

          <Card n={6} title="개인정보의 파기 절차 및 방법">
            <p>
              보유 기간이 경과하거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다. 전자적 파일
              형태의 정보는 복구할 수 없는 방법으로 영구 삭제하며, 파기 사유가 발생한 정보는 개인정보
              보호책임자의 승인을 거쳐 파기합니다.
            </p>
          </Card>

          <Card n={7} title="정보주체와 법정대리인의 권리·의무 및 행사 방법">
            <ul>
              <li>이용자는 언제든지 자신의 개인정보에 대한 <strong>열람·정정·삭제·처리정지</strong>를 요구할 수 있습니다.</li>
              <li>권리 행사는 아래 문의 연락처(이메일)를 통해 할 수 있으며, 운영자는 지체 없이 조치합니다.</li>
              <li>만 14세 미만 아동의 법정대리인은 아동의 개인정보에 대한 권리를 행사할 수 있습니다.</li>
              <li>권리 행사는 대리인을 통해서도 가능하며, 이 경우 적법한 위임장을 제출해야 합니다.</li>
            </ul>
          </Card>

          <Card n={8} title="개인정보의 안전성 확보 조치">
            <ul>
              <li><strong>기술적 조치</strong> — 전 구간 통신 암호화(HTTPS), 저장 데이터 암호화, 접근 권한 관리</li>
              <li><strong>관리적 조치</strong> — 개인정보 취급 인원 최소화, 접근 키·비밀정보의 분리 보관</li>
              <li><strong>자동 보호 조치</strong> — AI 상담 입력의 주민등록번호 자동 마스킹, 수집 항목 최소화 설계</li>
            </ul>
          </Card>

          <Card n={9} title="쿠키 등 자동 수집 장치의 설치·운영 및 거부">
            <p>
              서비스는 이용 통계 분석을 위해 쿠키를 사용합니다. 브라우저 설정에서 쿠키 저장을
              거부하거나 삭제할 수 있으며, 거부하더라도 서비스 이용에 제한이 없습니다.
            </p>
          </Card>

          <Card n={10} title="행태정보의 수집·이용">
            <p>
              Google Analytics를 통해 방문·클릭 등 행태정보를 수집하며, 서비스 개선을 위한 통계
              목적으로만 사용합니다. 온라인 맞춤형 광고를 위한 행태정보 수집·제공은 하지 않습니다.
            </p>
          </Card>

          <Card n={11} title="개인정보 보호책임자">
            <ul>
              <li>개인정보 보호책임자: [운영자명]</li>
              <li>문의: [문의 이메일]</li>
            </ul>
            <p>
              개인정보 처리에 관한 문의, 불만 처리, 피해 구제 요청은 위 연락처로 접수할 수 있으며,
              지체 없이 답변·처리합니다.
            </p>
          </Card>

          <Card n={12} title="권익침해에 대한 구제 방법">
            <div className="pv-table-wrap">
              <table className="pv-table">
                <thead>
                  <tr><th>기관</th><th>연락처</th><th>홈페이지</th></tr>
                </thead>
                <tbody>
                  <tr><td>개인정보분쟁조정위원회</td><td>(국번없이) 1833-6972</td><td>kopico.go.kr</td></tr>
                  <tr><td>개인정보침해신고센터 (KISA)</td><td>(국번없이) 118</td><td>privacy.kisa.or.kr</td></tr>
                  <tr><td>대검찰청 사이버수사과</td><td>(국번없이) 1301</td><td>spo.go.kr</td></tr>
                  <tr><td>경찰청 사이버수사국</td><td>(국번없이) 182</td><td>ecrm.police.go.kr</td></tr>
                </tbody>
              </table>
            </div>
          </Card>

          <Card n={13} title="개인정보처리방침의 변경">
            <p>
              본 방침의 내용이 추가·삭제·수정되는 경우 시행 최소 7일 전(중대한 변경은 30일 전)부터
              본 페이지를 통해 고지합니다.
            </p>
          </Card>
        </article>

        <Link href="/" className="post-home">홈으로 돌아가기</Link>
      </div>
    </div>
  );
}
