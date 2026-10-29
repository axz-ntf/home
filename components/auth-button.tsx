"use client";

import { DdsIcon } from "./dds-icon";
import "./dds-components.css";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { loadNickname } from "@/lib/profile";

// 계정 영역(헤더 우측) — 로그아웃 상태면 "로그인", 로그인 상태면 닉네임(없으면 이메일) + 드롭다운.
export function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [nickname, setNickname] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    loadNickname().then(setNickname);
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (session?.user) loadNickname().then(setNickname);
      else setNickname(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // 표시 이름 — 닉네임 우선, 없으면 이메일.
  const displayName = nickname || user?.email || "";

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
            <Link href="/profile" className="app-account-menu-item" role="menuitem" onClick={() => setOpen(false)}>
              프로필 수정
            </Link>
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
          <span className="app-account-avatar" aria-hidden>{(displayName || "U")[0].toUpperCase()}</span>
          <span className="app-account-email">{displayName}</span>
          <span className="app-account-caret" aria-hidden>
            <DdsIcon name="chevron-down" size={16}/>
          </span>
        </button>
      </div>
    );
  }

  return (
    <Link href="/login" className="app-sidebar-login">
      <span className="app-sidebar-login-ico" aria-hidden>
        <DdsIcon name="person" size={16}/>
      </span>
      로그인
    </Link>
  );
}
