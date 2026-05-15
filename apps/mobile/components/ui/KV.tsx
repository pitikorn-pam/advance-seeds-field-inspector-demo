import { View, Text } from "react-native";

// Shared label-left / value-right row with a hairline divider beneath. The
// parent controls the final divider by passing `isLast` (NativeWind's `last:`
// modifier is unreliable through the css-to-rn pipeline, so we keep it
// explicit instead).
export interface KVProps {
  label: string;
  value: string;
  mono?: boolean;
  isLast?: boolean;
}

export function KV({ label, value, mono, isLast }: KVProps) {
  return (
    <View
      className={`flex-row items-baseline gap-md py-[6px] ${
        isLast ? "" : "border-b border-line-tertiary"
      }`}
    >
      <Text className="flex-1 text-caption text-fg-secondary">{label}</Text>
      <Text
        className={`flex-1 text-caption font-medium text-fg-primary text-right ${
          mono ? "font-mono" : ""
        }`}
        style={mono ? { fontVariant: ["tabular-nums"] } : undefined}
      >
        {value}
      </Text>
    </View>
  );
}
