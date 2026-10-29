// DDS(Daum Design System) 웹 컴포넌트 JSX 타입. React 19 는 커스텀 엘리먼트에 prop 을
// 해당 property 로 넘기므로 camelCase(fullWidth 등)를 그대로 쓴다.
import type { DetailedHTMLProps, HTMLAttributes } from "react";

type DdsProps<P> = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & P;

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "dds-button": DdsProps<{ variant?: "solid" | "outline"; color?: "primary" | "secondary" | "subtlest" | "neutral" | "inverse" | "ghost" | "danger"; size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl"; shape?: "square" | "rounded"; fullWidth?: boolean; disabled?: boolean; loading?: boolean }>;
      "dds-icon-button": DdsProps<{ variant?: "solid" | "outline"; color?: "primary" | "secondary" | "inverse" | "ghost" | "danger"; size?: "sm" | "md" | "lg" | "xl"; label?: string; disabled?: boolean }>;
      "dds-chip": DdsProps<{ variant?: "solid" | "outline"; color?: "neutral" | "primary" | "inverse" | "ghost"; size?: "md" | "lg"; shape?: "rounded" | "square"; selected?: boolean; disabled?: boolean; delete?: boolean; leading?: "image" | "profile" | "icon" }>;
      "dds-badge": DdsProps<{ variant?: "solid" | "weak" | "outline"; color?: "primary" | "secondary" | "accent" | "overlay" | "ghost" | "live"; size?: "xs" | "sm" | "md" | "lg"; shape?: "round" | "circle" }>;
      "dds-tail-badge": DdsProps<{ size?: "sm" | "md"; color?: "accent" | "primary"; tail?: "left" | "right" }>;
      "dds-tab": DdsProps<{ variant?: "default" | "title" | "chip" | "chip-outline" | "chip-square"; activeIndex?: number; navigation?: boolean }>;
      "dds-tab-item": DdsProps<{ variant?: "default" | "title"; selected?: boolean }>;
      "dds-icon": DdsProps<{ name: string }>;
      "dds-divider": DdsProps<{ variant?: string; size?: string; orientation?: "horizontal" | "vertical" }>;
      "dds-spinner": DdsProps<{ color?: string }>;
    }
  }
}
