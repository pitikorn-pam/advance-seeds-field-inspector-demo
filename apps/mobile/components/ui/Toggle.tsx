import { Pressable, View } from "react-native";

/**
 * Brand-toned on/off toggle. Replaces the platform-default `Switch` so
 * Android and iOS look identical and the on-state uses the app's brand
 * palette (matching the `Segmented` tag variant + active Pill tone).
 *
 * Sizing intentionally smaller than iOS Switch — visually consistent
 * with the Pill component's 24 px height vocabulary used elsewhere.
 *
 *   Off:  ◯─── ─── ───   border-line-secondary, neutral fill
 *   On:   ─── ─── ───◯   bg-brand, white thumb
 */
export function Toggle({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      hitSlop={6}
      className={`h-7 w-12 rounded-full justify-center px-[2px] ${
        value ? "bg-brand" : "border border-line-secondary bg-bg-secondary"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <View
        className={`h-[22px] w-[22px] rounded-full bg-bg-primary shadow-sm ${
          value ? "self-end" : "self-start"
        }`}
      />
    </Pressable>
  );
}
