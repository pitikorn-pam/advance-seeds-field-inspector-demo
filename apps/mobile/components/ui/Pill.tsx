import { View, Text } from "react-native";

const tones = {
  brand: { bg: "bg-brand-soft", text: "text-brand-deep", dot: "#0F6E56" },
  success: { bg: "bg-success-bg", text: "text-success-text", dot: "#27500A" },
  warning: { bg: "bg-warning-bg", text: "text-warning-text", dot: "#854F0B" },
  danger: { bg: "bg-danger-bg", text: "text-danger-text", dot: "#791F1F" },
  info: { bg: "bg-info-bg", text: "text-info-text", dot: "#1F4F8B" },
  neutral: { bg: "bg-bg-secondary", text: "text-fg-secondary", dot: "#6B6B68" },
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
      className={`flex-row items-center justify-center gap-[6px] h-6 rounded-md px-[11px] ${t.bg} ${className}`}
    >
      {dot ? (
        <View className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: t.dot }} />
      ) : null}
      <Text className={`text-caption font-medium ${t.text}`}>{label}</Text>
    </View>
  );
}
