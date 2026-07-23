import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보처리방침 — 공공임대주택 부동산",
  robots: { index: false },
};

// 개인정보처리방침 — 실제 수집 현황(GA4·AI 상담·위치·회원) 기준으로 작성.
// [운영자명]·[문의 이메일] 은 게시 전 실제 값으로 치환할 것.
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

        <article className="tip-post">
          <p>
            [운영자명](이하 &ldquo;운영자&rdquo;)은 공공임대주택 정보 서비스(이하 &ldquo;서비스&rdquo;)를
            제공하면서 개인정보 보호법 등 관련 법령을 준수하며, 이용자의 개인정보를 아래와 같이
            처리합니다. 본 방침은 2026년 7월 23일부터 적용됩니다.
          </p>

          <h2>1. 수집하는 개인정보 항목과 목적</h2>
          <ul>
            <li>
              <strong>서비스 이용 기록(자동 수집)</strong> — 쿠키, 방문·클릭 기록, 브라우저 정보.
              서비스 이용 통계 분석과 품질 개선 목적으로 Google Analytics를 통해 수집합니다.
            </li>
            <li>
              <strong>AI 상담 입력 내용</strong> — 이용자가 AI 자격 상담에 입력한 대화 내용(나이,
              가구 구성, 소득 구간 등 이용자가 스스로 제공한 정보 포함). 자격 상담 답변 생성
              목적으로만 처리되며, 답변 생성을 위해 외부 AI 처리업체로 전송됩니다.
            </li>
            <li>
              <strong>위치정보</strong> — &ldquo;내 위치&rdquo; 기능 사용 시 브라우저 위치정보를
              지도 이동 목적으로 일시 사용하며, 서버에 저장하지 않습니다.
            </li>
            <li>
              <strong>자격 프로필(선택)</strong> — 이용자가 저장을 선택한 경우의 자격 관련 정보
              (연령대, 가구·소득 구간 등). 맞춤 상담 제공 목적으로 저장합니다.
            </li>
          </ul>
          <p>주민등록번호 등 고유식별정보는 수집하지 않으며, 입력을 요구하지 않습니다.</p>

          <h2>2. 보유 및 이용 기간</h2>
          <ul>
            <li>AI 상담 대화 내용 — 답변 생성 즉시 목적 달성으로 서버에 별도 저장하지 않습니다.</li>
            <li>Google Analytics 수집 데이터 — Google Analytics 보존 설정에 따라 최대 14개월.</li>
            <li>자격 프로필 — 이용자가 삭제하거나 서비스 탈퇴 시 지체 없이 파기.</li>
          </ul>

          <h2>3. 처리 위탁 및 국외 이전</h2>
          <p>서비스 운영을 위해 아래 업체에 처리를 위탁하며, 이들 업체의 서버는 국외(미국)에 있습니다.</p>
          <ul>
            <li><strong>Google LLC</strong> — 방문 통계 분석(Google Analytics)</li>
            <li><strong>Vercel Inc.</strong> — 서비스 호스팅</li>
            <li><strong>Supabase Inc.</strong> — 데이터 저장(자격 프로필 등)</li>
            <li><strong>Anthropic PBC 등 AI 처리업체</strong> — AI 상담 답변 생성</li>
          </ul>

          <h2>4. 이용자의 권리</h2>
          <p>
            이용자는 언제든지 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 요구할 수 있습니다.
            문의는 아래 연락처로 주시면 지체 없이 처리합니다. 쿠키 수집은 브라우저 설정에서
            거부할 수 있으며, 이 경우에도 서비스 이용에는 제한이 없습니다.
          </p>

          <h2>5. 개인정보 보호책임자</h2>
          <ul>
            <li>책임자: [운영자명]</li>
            <li>문의: [문의 이메일]</li>
          </ul>

          <h2>6. 방침의 변경</h2>
          <p>
            본 방침이 변경되는 경우 시행 7일 전부터 서비스 내 공지사항 또는 본 페이지를 통해
            고지합니다.
          </p>
        </article>

        <Link href="/" className="post-home">홈으로 돌아가기</Link>
      </div>
    </div>
  );
}
