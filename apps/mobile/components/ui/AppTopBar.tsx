import { View, Text, Pressable } from "react-native";

export interface AppTopBarAction {
  accessibilityLabel: string;
  icon: React.ReactNode;
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.accessibilityLabel}
      className="h-10 w-10 items-center justify-center rounded-full bg-bg-tertiary active:bg-bg-secondary"
      onPress={action.onPress}
    >
      {action.icon}
    </Pressable>
  );
}
