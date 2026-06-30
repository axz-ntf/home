"use client";

import type { ReactNode, MouseEventHandler } from "react";

// Anchor Design System — Button (대표 컴포넌트, Button.md v0.1.1)
// Variant×Color = 강조, Size = 맥락, Shape = R8(Square)/R100(Rounded).
// href 가 있으면 <a>, 없으면 <button> 으로 렌더. 토큰 값은 app/styles.css(.abtn) 에.
type Variant = "solid" | "outline";
type Color = "primary" | "secondary" | "subtlest" | "neutral" | "inverse" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";
type Shape = "square" | "rounded";

export function Button({
  variant = "solid",
  color = "primary",
  size = "lg",
  shape = "square",
  leadingIcon,
  trailingIcon,
  loading = false,
  disabled = false,
  href,
  target,
  type = "button",
  onClick,
  fullWidth = false,
  className = "",
  children,
  "aria-label": ariaLabel,
}: {
  variant?: Variant;
  color?: Color;
  size?: Size;
  shape?: Shape;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  href?: string;
  target?: string;
  type?: "button" | "submit" | "reset";
  onClick?: MouseEventHandler;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  const cls = [
    "abtn",
    `abtn--${variant}-${color}`,
    `abtn--${size}`,
    shape === "rounded" ? "abtn--rounded" : "",
    loading ? "is-loading" : "",
    disabled ? "is-disabled" : "",
    fullWidth ? "abtn--full" : "",
    className,
  ].filter(Boolean).join(" ");

  const inner = (
    <>
      {leadingIcon && <span className="abtn-ico" aria-hidden>{leadingIcon}</span>}
      <span className="abtn-label">{children}</span>
      {trailingIcon && <span className="abtn-ico" aria-hidden>{trailingIcon}</span>}
      {loading && <span className="abtn-spinner" aria-hidden />}
    </>
  );

  // 링크형 — disabled 면 동작 막되 마크업은 <a> 유지(접근성).
  if (href && !disabled) {
    return (
      <a className={cls} href={href} target={target} rel={target === "_blank" ? "noreferrer" : undefined} aria-label={ariaLabel} onClick={onClick}>
        {inner}
      </a>
    );
  }
  return (
    <button className={cls} type={type} disabled={disabled || loading} onClick={onClick} aria-label={ariaLabel} aria-busy={loading || undefined}>
      {inner}
    </button>
  );
}
