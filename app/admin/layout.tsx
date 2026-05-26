// 어드민 페이지는 항상 dynamic rendering — useSearchParams (admin-shell) /
// 쿠키 기반 인증 (proxy.ts) 둘 다 static generation 과 호환 안 됨.
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
