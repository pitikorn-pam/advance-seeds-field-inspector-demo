import { View, Text } from "react-native";

const tones = {
  brand: { bg: "bg-brand-soft", text: "text-brand-deep" },
  success: { bg: "bg-success-bg", text: "text-success-text" },
  warning: { bg: "bg-warning-bg", text: "text-warning-text" },
  danger: { bg: "bg-danger-bg", text: "text-danger-text" },
  info: { bg: "bg-info-bg", text: "text-info-text" },
  neutral: { bg: "bg-bg-secondary", text: "text-fg-secondary" },
} as const;

export type PillTone = keyof typeof tones;

export function Pill({
  tone = "neutral",
  dot = false,
  label,
  className = "",
}: {
  tone?: PillTone;
  dot?: boolean;
  label: string;
  className?: string;
}) {
  const t = tones[tone];
  return (
    <View
      className={`flex-row items-center gap-[6px] h-6 rounded-md px-[11px] ${t.bg} ${className}`}
    >
      {dot ? <View className={`h-[5px] w-[5px] rounded-full ${t.text}`} /> : null}
      <Text className={`text-caption font-medium ${t.text}`}>{label}</Text>
    </View>
  );
}
