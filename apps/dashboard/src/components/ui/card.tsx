import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl border border-line-tertiary bg-bg-primary px-xl py-lg", className)}
      {...props}
    />
  );
}

export function StatTile({
  value,
  label,
  className,
}: {
  value: string | number;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg bg-bg-secondary px-md py-lg text-center", className)}>
      <div className="text-[22px] font-medium leading-tight tracking-[-0.02em] text-fg-primary">
        {value}
      </div>
      <div className="mt-xs text-label uppercase tracking-[0.04em] text-fg-secondary">{label}</div>
    </div>
  );
}
