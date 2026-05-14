import { View, Text } from "react-native";
import type { ViewProps } from "react-native";

type CardTone =
  | "base"
  | "navy"
  | "yellow"
  | "yellowBold"
  | "mint"
  | "lavender"
  | "peach"
  | "rose"
  | "sky";

const toneClass: Record<CardTone, string> = {
  base: "border-line-tertiary bg-bg-primary",
  navy: "border-brand-navy-mid bg-brand-navy",
  yellow: "border-line-tertiary bg-card-yellow",
  yellowBold: "border-line-secondary bg-card-yellow-bold",
  mint: "border-line-tertiary bg-card-mint",
  lavender: "border-line-tertiary bg-card-lavender",
  peach: "border-line-tertiary bg-card-peach",
  rose: "border-line-tertiary bg-card-rose",
  sky: "border-line-tertiary bg-card-sky",
};

export function Card({
  className = "",
  tone = "base",
  children,
  ...props
}: ViewProps & { className?: string; tone?: CardTone }) {
  return (
    <View className={`rounded-lg border px-xl py-lg ${toneClass[tone]} ${className}`} {...props}>
      {children}
    </View>
  );
}

export function StatTile({ value, label }: { value: string | number; label: string }) {
  return (
    <View className="flex-1 rounded-lg bg-card-gray px-md py-lg items-center">
      <Text className="text-fg-primary text-2xl font-medium tracking-tight">{value}</Text>
      <Text className="mt-xs text-label text-fg-secondary uppercase">{label}</Text>
    </View>
  );
}
