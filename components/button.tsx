"use client";

import { useCallback, type AriaAttributes, type CSSProperties, type MouseEventHandler, type ReactNode } from "react";

type ButtonProps = AriaAttributes & {
  variant?: "solid" | "outline";
  color?: "primary" | "secondary" | "subtlest" | "neutral" | "inverse" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";
  shape?: "square" | "rounded";
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
  style?: CSSProperties;
  id?: string;
  title?: string;
  name?: string;
  value?: string;
  form?: string;
  children: ReactNode;
};

/** Official DDS button, with native adapters for links, form actions and ARIA controls. */
export function Button({
  variant = "solid", color = "primary", size = "lg", shape = "square",
  leadingIcon, trailingIcon, loading = false, disabled = false, href, target,
  type = "button", onClick, fullWidth = false, className = "", children,
  name, value, form, ...attributes
}: ButtonProps) {
  // Upgrade-safe properties: React can mount before the custom element is registered.
  const ddsRef = useCallback((el: (HTMLElement & { fullWidth?: boolean; disabled?: boolean; loading?: boolean }) | null) => {
    if (!el) return;
    let current = true;
    const apply = () => {
      if (current) { el.fullWidth = fullWidth; el.disabled = disabled; el.loading = loading; }
    };
    apply();
    void customElements.whenDefined("dds-button").then(apply);
    return () => { current = false; };
  }, [fullWidth, disabled, loading]);

  const inactive = disabled || loading;
  const cls = ["abtn", `abtn--${variant}-${color}`, `abtn--${size}`,
    shape === "rounded" ? "abtn--rounded" : "", loading ? "is-loading" : "",
    disabled ? "is-disabled" : "", fullWidth ? "abtn--full" : "", className,
  ].filter(Boolean).join(" ");
  const inner = <>
    {leadingIcon && <span className="abtn-ico" aria-hidden="true">{leadingIcon}</span>}
    <span className="abtn-label">{children}</span>
    {trailingIcon && <span className="abtn-ico" aria-hidden="true">{trailingIcon}</span>}
    {loading && <dds-spinner className="abtn-spinner" aria-hidden="true" />}
  </>;

  if (href) return (
    <a {...attributes} className={cls} href={inactive ? undefined : href} target={target}
      rel={target === "_blank" ? "noreferrer" : undefined} role={inactive ? "link" : undefined}
      aria-disabled={inactive || undefined} aria-busy={loading || undefined} tabIndex={inactive ? -1 : undefined}
      onClick={inactive ? event => { event.preventDefault(); event.stopPropagation(); } : onClick}>
      {inner}
    </a>
  );

  // Shadow-root buttons cannot submit their outer form. ARIA relationships must
  // also live on the actual focusable button, so those controls stay native.
  const native = type !== "button" || name != null || form != null ||
    Object.keys(attributes).some(key => key.startsWith("aria-"));
  if (native) return (
    <button {...attributes} className={cls} type={type} name={name} value={value} form={form}
      disabled={inactive} onClick={onClick} aria-busy={loading || undefined}>
      {inner}
    </button>
  );

  return (
    <dds-button {...attributes} ref={ddsRef} variant={variant} color={color} size={size} shape={shape}
      fullWidth={fullWidth} disabled={disabled} loading={loading} aria-busy={loading || undefined}
      className={["dds-button-adapter", fullWidth ? "dds-full" : "", className].filter(Boolean).join(" ")}
      onClick={inactive ? undefined : onClick}>
      {leadingIcon && <span slot="leading" aria-hidden="true">{leadingIcon}</span>}
      {children}
      {trailingIcon && <span slot="trailing" aria-hidden="true">{trailingIcon}</span>}
    </dds-button>
  );
}
