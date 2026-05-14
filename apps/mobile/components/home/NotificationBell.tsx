import { View, Pressable, Text } from "react-native";
import { Bell } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useNotifications } from "@/lib/queries";
import { useTheme } from "@/lib/theme";

/**
 * Bell icon button on Home — sits after the role pill in the greeting row.
 * Shows an unread-count badge when there are unread notifications. Tap
 * routes to /notifications (a modal-style stack screen with the lazy-loading
 * list).
 *
 * Reads from the same `useNotifications()` query the modal uses, so the
 * badge updates immediately when the modal marks items read.
 */
export function NotificationBell() {
  const router = useRouter();
  const { resolved } = useTheme();
  const { data } = useNotifications();
  const unread = (data ?? []).filter((n) => n.read_at === null).length;
  const display = unread > 9 ? "9+" : unread > 0 ? String(unread) : null;
  const iconColor = resolved === "dark" ? "#F5F5F4" : "#171717";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Notifications"
      onPress={() => router.push("/notifications" as never)}
      className="h-9 w-9 items-center justify-center rounded-full bg-bg-tertiary"
    >
      <Bell color={iconColor} size={18} />
      {display ? (
        <View
          className="absolute items-center justify-center"
          style={{
            top: -2,
            right: -2,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            borderRadius: 9,
            backgroundColor: "#DC2828",
            borderWidth: 2,
            borderColor: "#F4F4F1",
          }}
        >
          <Text className="text-white font-medium" style={{ fontSize: 10, lineHeight: 12 }}>
            {display}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
