import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

const styles = {
  brand: "bg-brand-soft text-brand-deep",
  success: "bg-success-bg text-success-text",
  warning: "bg-warning-bg text-warning-text",
  danger: "bg-danger-bg text-danger-text",
  info: "bg-info-bg text-info-text",
  neutral: "bg-bg-secondary text-fg-secondary",
} as const;

export type PillTone = keyof typeof styles;

export function Pill({
  tone = "neutral",
  dot = false,
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: PillTone; dot?: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-[6px] rounded-md px-[11px] text-caption font-medium",
        styles[tone],
        className,
      )}
      {...rest}
    >
      {dot ? <span className="inline-block h-[5px] w-[5px] rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
