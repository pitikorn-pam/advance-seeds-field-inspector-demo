import { View, Text } from "react-native";
import type { ViewProps } from "react-native";

export function Card({ className = "", children, ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={`rounded-xl border border-line-tertiary bg-bg-primary px-xl py-lg ${className}`}
      {...props}
    >
      {children}
    </View>
  );
}

export function StatTile({ value, label }: { value: string | number; label: string }) {
  return (
    <View className="flex-1 rounded-lg bg-bg-secondary px-md py-lg items-center">
      <Text className="text-fg-primary text-2xl font-medium tracking-tight">{value}</Text>
      <Text className="mt-xs text-label text-fg-secondary uppercase">{label}</Text>
    </View>
  );
}
