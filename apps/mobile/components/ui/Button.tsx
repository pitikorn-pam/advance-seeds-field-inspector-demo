import { Pressable, Text } from "react-native";
import type { PressableProps } from "react-native";

type Variant =
  | "primary"
  | "secondary"
  | "outline"
  | "tinted"
  | "ghost"
  | "ghostDanger"
  | "danger"
  | "onDark"
  | "yellowFeature";
type Size = "md" | "sm" | "icon";

const variantClass: Record<Variant, string> = {
  primary: "bg-primary active:bg-primary-pressed",
  secondary: "bg-bg-primary border border-line-secondary active:bg-bg-secondary",
  outline: "bg-transparent border border-line-secondary active:bg-bg-secondary",
  tinted: "bg-bg-secondary active:bg-bg-tertiary",
  ghost: "bg-transparent active:bg-bg-secondary",
  ghostDanger: "bg-danger-bg active:opacity-80",
  danger: "bg-danger-bg active:opacity-90",
  onDark: "bg-fg-on-dark active:opacity-90",
  yellowFeature: "bg-card-yellow-bold active:opacity-90",
};

const variantText: Record<Variant, string> = {
  primary: "text-primary-on",
  secondary: "text-fg-primary",
  outline: "text-fg-primary",
  tinted: "text-fg-primary",
  ghost: "text-fg-primary",
  ghostDanger: "text-danger-text",
  danger: "text-danger-text",
  onDark: "text-brand-navy",
  yellowFeature: "text-fg-primary",
};

const sizeClass: Record<Size, string> = {
  md: "h-11 px-xl rounded-md",
  sm: "h-9 px-md rounded-md",
  icon: "h-10 w-10 rounded-md items-center justify-center",
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
