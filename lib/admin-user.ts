// 어드민 사이드바에 표시할 사용자 정보. ENV 기반 — 단일 사용자 도구라 별도 인증 모델 없음.
// 이메일/한글이름 둘 다 OK. initial 은 첫 글자 추출.
export function getAdminUser(): { name: string; role: string; initial: string } {
  const raw = (process.env.ADMIN_NAME ?? "").trim();
  if (!raw) return { name: "운영자", role: "어드민", initial: "운" };
  // 이메일 형식이면 @ 앞부분 노출. 한글이면 그대로.
  const display = raw.includes("@") ? raw.split("@")[0] : raw;
  return {
    name: display,
    role: "어드민",
    initial: display.charAt(0).toUpperCase(),
  };
}
