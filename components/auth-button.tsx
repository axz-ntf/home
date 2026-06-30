"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// 사이드바 하단 계정 영역 — 로그아웃 상태면 "로그인"(전용 페이지로 이동), 로그인 상태면 프로필 클릭 시 드롭다운(로그아웃).
export function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // 드롭다운 열렸을 때 바깥 클릭 / ESC 로 닫기.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    await createClient().auth.signOut();
    setOpen(false);
    setUser(null);
  }

  if (user) {
    return (
      <div className="app-account-wrap" ref={wrapRef}>
        {open && (
          <div className="app-account-menu" role="menu">
            <button type="button" className="app-account-menu-item" role="menuitem" onClick={logout}>
              로그아웃
            </button>
          </div>
        )}
        <button
          type="button"
          className="app-account"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <span className="app-account-avatar" aria-hidden>{(user.email ?? "U")[0].toUpperCase()}</span>
          <span className="app-account-email">{user.email}</span>
          <span className="app-account-caret" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
      </div>
    );
  }

  return (
    <Link href="/login" className="app-sidebar-login">
      <span className="app-sidebar-login-ico" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.8" />
          <path d="M5 19.5c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
      로그인
    </Link>
  );
}
