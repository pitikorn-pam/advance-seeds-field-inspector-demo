import { Pressable, Text } from "react-native";
import type { PressableProps } from "react-native";

type Variant = "primary" | "outline" | "tinted" | "ghost" | "danger";
type Size = "md" | "sm" | "icon";

const variantClass: Record<Variant, string> = {
  primary: "bg-brand active:opacity-90",
  outline: "bg-transparent border border-line-secondary active:bg-bg-secondary",
  tinted: "bg-bg-secondary active:bg-bg-tertiary",
  ghost: "bg-transparent active:bg-bg-secondary",
  danger: "bg-danger-bg active:opacity-90",
};

const variantText: Record<Variant, string> = {
  primary: "text-brand-on",
  outline: "text-fg-primary",
  tinted: "text-fg-primary",
  ghost: "text-fg-primary",
  danger: "text-danger-text",
};

const sizeClass: Record<Size, string> = {
  md: "h-12 px-xl rounded-lg",
  sm: "h-9 px-md rounded-md",
  icon: "h-10 w-10 rounded-full items-center justify-center",
};

interface Props extends Omit<PressableProps, "children"> {
  variant?: Variant;
  size?: Size;
  label?: string;
  renderLeadingIcon?: () => React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function Button({
  variant = "primary",
  size = "md",
  label,
  renderLeadingIcon,
  children,
  className,
  ...rest
}: Props) {
  const base = "flex-row items-center justify-center gap-sm";
  const cls = [base, sizeClass[size], variantClass[variant], className].filter(Boolean).join(" ");
  return (
    <Pressable className={cls} {...rest}>
      {renderLeadingIcon ? renderLeadingIcon() : null}
      {label ? (
        <Text className={`text-title font-medium ${variantText[variant]}`}>{label}</Text>
      ) : null}
      {children}
    </Pressable>
  );
}
