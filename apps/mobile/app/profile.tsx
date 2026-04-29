import { ScrollView, View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Settings, ChevronLeft, ChevronRight } from "lucide-react-native";
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
  const { profile, signOut } = useAuth();

  const initials =
    (profile?.full_name ?? profile?.email ?? "")
      .split(/\s+|@/)
      .map((part) => part.charAt(0).toUpperCase())
      .filter(Boolean)
      .slice(0, 2)
      .join("") || "—";

  const onSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("profile:title")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          icon: <ChevronLeft color="#1A1A1A" size={20} />,
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
                borderRadius: 36,
                backgroundColor: "#E1F5EE",
              }}
            >
              <Text
                className="font-medium"
                style={{ fontSize: 24, color: "#04342C", letterSpacing: -0.5 }}
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
          </View>
        </Card>

        <Card className="p-0">
          <MenuRow
            icon={<Settings color="#1A1A1A" size={16} />}
            label={t("profile:menu.settings")}
            onPress={() => router.push("/settings")}
          />
          <Divider />
          <SyncStatusRow
            label={t("profile:menu.sync")}
            status={t("profile:menu.syncStatusUpToDate")}
          />
        </Card>

        <Card className="p-0">
          <Pressable onPress={onSignOut} className="px-lg py-md">
            <Text className="text-title font-medium" style={{ color: "#791F1F" }}>
              {t("profile:menu.signOut")}
            </Text>
          </Pressable>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function SyncStatusRow({ label, status }: { label: string; status: string }) {
  return (
    <View className="flex-row items-center gap-md px-lg py-md">
      <View
        className="items-center justify-center"
        style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "#E1F5EE" }}
      >
        <View className="h-2 w-2 rounded-full bg-brand" />
      </View>
      <Text className="flex-1 text-title text-fg-primary">{label}</Text>
      <Pill tone="success" dot label={status} />
    </View>
  );
}

function MenuRow({
  icon,
  label,
  trailing,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-md px-lg py-md"
      accessibilityRole="button"
    >
      <View
        className="items-center justify-center"
        style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "#F4F4F1" }}
      >
        {icon}
      </View>
      <Text className="flex-1 text-title text-fg-primary">{label}</Text>
      {trailing ?? <ChevronRight color="#9D9D9A" size={16} />}
    </Pressable>
  );
}

function Divider() {
  return <View className="h-[0.5px] bg-line-tertiary mx-lg" />;
}
