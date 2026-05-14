import { View, Text } from "react-native";

const tones = {
  brand: { bg: "bg-brand-soft", text: "text-brand-deep", dot: "#6C47FF" },
  success: { bg: "bg-success-bg", text: "text-success-text", dot: "#285B12" },
  warning: { bg: "bg-warning-bg", text: "text-warning-text", dot: "#704B00" },
  danger: { bg: "bg-danger-bg", text: "text-danger-text", dot: "#8A1F1B" },
  info: { bg: "bg-info-bg", text: "text-info-text", dot: "#1957A4" },
  neutral: { bg: "bg-card-gray", text: "text-fg-secondary", dot: "#8C8C87" },
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
      className={`flex-row items-center justify-center gap-[6px] h-[26px] rounded-full px-[10px] ${t.bg} ${className}`}
    >
      {dot ? (
        <View className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: t.dot }} />
      ) : null}
      <Text className={`text-caption font-medium ${t.text}`}>{label}</Text>
    </View>
  );
}
