import { cloneElement, isValidElement } from "react";
import { View, Text, Pressable } from "react-native";
import { useTheme } from "@/lib/theme";

export interface AppTopBarAction {
  accessibilityLabel: string;
  renderIcon: () => React.ReactNode;
  onPress: () => void;
}

interface Props {
  title: string;
  left?: AppTopBarAction;
  right?: AppTopBarAction;
}

export function AppTopBar({ title, left, right }: Props) {
  return (
    <View className="flex-row items-center justify-between px-xl py-md">
      {left ? <TopBarAction action={left} /> : <View className="h-10 w-10" />}
      <Text
        className="mx-md flex-1 text-center text-title font-medium text-fg-primary"
        numberOfLines={1}
      >
        {title}
      </Text>
      {right ? <TopBarAction action={right} /> : <View className="h-10 w-10" />}
    </View>
  );
}

function TopBarAction({ action }: { action: AppTopBarAction }) {
  // Lucide icons take a hex `color` prop, which doesn't follow nativewind
  // tokens. Override it from theme so callers can keep passing a fixed
  // color (e.g. `#1A1A1A`) without it disappearing in dark mode.
  const { resolved } = useTheme();
  const tint = resolved === "dark" ? "#F5F5F4" : "#1A1A1A";
  const icon = action.renderIcon();
  const themedIcon = isValidElement<{ color?: string }>(icon)
    ? cloneElement(icon, { color: tint })
    : icon;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.accessibilityLabel}
      className="h-10 w-10 items-center justify-center rounded-full bg-bg-tertiary active:bg-bg-secondary"
      onPress={action.onPress}
    >
      {themedIcon}
    </Pressable>
  );
}
