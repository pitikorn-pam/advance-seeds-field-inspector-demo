import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-12 w-full rounded-lg border border-line-secondary bg-bg-primary px-lg text-title text-fg-primary",
        "placeholder:text-fg-tertiary",
        "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-soft",
        "disabled:opacity-40",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-[96px] w-full rounded-lg border border-line-secondary bg-bg-primary p-lg text-body text-fg-primary",
      "placeholder:text-fg-tertiary",
      "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-soft",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
