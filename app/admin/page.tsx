import { redirect } from "next/navigation";

// /admin 자체엔 화면이 없다 — 대시보드로 보낸다.
// 미인증이면 proxy 가 /admin/login 으로 다시 보냄. (로그인 후 from=/admin 복귀 시 404 방지)
export default function AdminIndex() {
  redirect("/admin/review");
}
