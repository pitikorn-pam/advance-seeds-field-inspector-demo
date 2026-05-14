import { ScrollView, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { AppTopBar } from "@/components/ui/AppTopBar";

/**
 * Standalone read-only profile screen. Recordings and support actions live
 * in their own More entries so this page remains a focused account summary.
 */
export default function ProfileScreen() {
  const { t } = useTranslation(["common", "profile"]);
  const router = useRouter();
  const { profile } = useAuth();

  const initials =
    (profile?.full_name ?? profile?.email ?? "")
      .split(/\s+|@/)
      .map((part) => part.charAt(0).toUpperCase())
      .filter(Boolean)
      .slice(0, 2)
      .join("") || "—";

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("profile:title")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#171717" size={20} />,
          onPress: () => router.back(),
        }}
      />
      <ScrollView contentContainerClassName="px-xl py-md gap-lg">
        <Card>
          <View className="items-center">
            <View
              className="items-center justify-center mb-md"
              style={{
                width: 72,
                height: 72,
                borderRadius: 12,
                backgroundColor: "#EEE9FF",
              }}
            >
              <Text
                className="font-medium"
                style={{ fontSize: 24, color: "#4B22A8", letterSpacing: -0.5 }}
              >
                {initials}
              </Text>
            </View>
            <Text
              className="text-fg-primary font-medium"
              style={{ fontSize: 19, letterSpacing: -0.3 }}
            >
              {profile?.full_name ?? "—"}
            </Text>
            <View className="flex-row items-center gap-sm mt-xs">
              {profile?.role ? (
                <Pill
                  tone={profile.role === "admin" ? "brand" : "info"}
                  label={t(`common:roles.${profile.role}`)}
                />
              ) : null}
              <Text className="text-caption text-fg-secondary">{profile?.email}</Text>
            </View>
            {profile?.role ? (
              <Text
                className="text-caption text-fg-secondary text-center mt-md px-md"
                numberOfLines={2}
              >
                {t(`common:roleDescriptions.${profile.role}`)}
              </Text>
            ) : null}
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
