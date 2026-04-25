import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-sm font-medium rounded-lg transition-transform duration-fast active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary",
  {
    variants: {
      variant: {
        primary: "bg-brand text-brand-on hover:opacity-90",
        outline:
          "bg-transparent border border-line-secondary text-fg-primary hover:bg-bg-secondary",
        tinted: "bg-bg-secondary text-fg-primary hover:bg-bg-tertiary",
        ghost: "bg-transparent text-fg-primary hover:bg-bg-secondary",
        danger: "bg-danger-bg text-danger-text hover:opacity-90",
      },
      size: {
        sm: "h-9 px-md text-caption",
        md: "h-12 px-xl text-title",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    );
  },
);
Button.displayName = "Button";
