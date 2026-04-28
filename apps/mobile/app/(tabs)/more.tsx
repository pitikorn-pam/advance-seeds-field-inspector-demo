import { ScrollView, View, Text, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import {
  User,
  Video,
  Layers,
  Target,
  ListChecks,
  BarChart3,
  Settings as SettingsIcon,
  Info,
  ChevronRight,
  LogOut,
} from "lucide-react-native";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/Card";

/**
 * More screen — secondary navigation hub.
 *
 * Tab bar holds Home / Camera / Library / More. Everything that doesn't fit
 * those four primary destinations lives here, grouped semantically:
 *
 *   Manage     — personal: Profile, Recordings, Sign out
 *   Reference  — admin reference data: Batches, Calibration profiles
 *   Insights   — historical + analytics: History (inspections), Reports
 *   App        — global: Settings, About
 *
 * Each row pushes onto the stack so the back gesture lands here. Sign out
 * is the lone destructive action and is visually distinct.
 *
 * Phase 1 of prototype-fidelity-pass keeps this minimal — the section
 * headers + rows ship; Phase 2 polishes the visual treatment to match the
 * prototype's `.menu-group` + `.menu-row` patterns more precisely.
 */
export default function MoreScreen() {
  const { t } = useTranslation(["common", "more"]);
  const router = useRouter();
  const { signOut } = useAuth();

  const onSignOut = () => {
    Alert.alert(t("more:menu.signOut"), t("more:menu.signOutConfirm"), [
      { text: t("common:actions.cancel"), style: "cancel" },
      {
        text: t("more:menu.signOut"),
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/login");
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top"]}>
      <ScrollView contentContainerClassName="px-xl py-md gap-lg">
        <Text className="text-h1 font-medium text-fg-primary">{t("more:title")}</Text>

        <Section title={t("more:sections.manage")}>
          <MenuRow
            icon={<User color="#1A1A1A" size={16} />}
            label={t("more:menu.profile")}
            onPress={() => router.push("/profile")}
          />
          <Divider />
          <MenuRow
            icon={<Video color="#1A1A1A" size={16} />}
            label={t("more:menu.recordings")}
            // typedRoutes regenerates these path types at Metro start; cast
            // until then so the typecheck step doesn't block on a fresh
            // route file. Same for /more/history below.
            onPress={() => router.push("/more/recordings" as never)}
          />
          <Divider />
          <MenuRow
            icon={<LogOut color="#791F1F" size={16} />}
            label={t("more:menu.signOut")}
            destructive
            onPress={onSignOut}
          />
        </Section>

        <Section title={t("more:sections.reference")}>
          <MenuRow
            icon={<Layers color="#1A1A1A" size={16} />}
            label={t("more:menu.batches")}
            onPress={() => router.push("/batches")}
          />
          <Divider />
          <MenuRow
            icon={<Target color="#1A1A1A" size={16} />}
            label={t("more:menu.calibration")}
            onPress={() => router.push("/calibration")}
          />
        </Section>

        <Section title={t("more:sections.insights")}>
          <MenuRow
            icon={<ListChecks color="#1A1A1A" size={16} />}
            label={t("more:menu.history")}
            onPress={() => router.push("/more/history" as never)}
          />
          <Divider />
          <MenuRow
            icon={<BarChart3 color="#1A1A1A" size={16} />}
            label={t("more:menu.reports")}
            onPress={() => router.push("/reports")}
          />
        </Section>

        <Section title={t("more:sections.app")}>
          <MenuRow
            icon={<SettingsIcon color="#1A1A1A" size={16} />}
            label={t("more:menu.settings")}
            onPress={() => router.push("/settings")}
          />
          <Divider />
          <MenuRow icon={<Info color="#1A1A1A" size={16} />} label={t("more:menu.about")} />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-sm">
      <Text className="text-caption uppercase text-fg-secondary px-xs">{title}</Text>
      <Card className="p-0">{children}</Card>
    </View>
  );
}

function MenuRow({
  icon,
  label,
  destructive = false,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  destructive?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center gap-md px-lg py-md"
    >
      <View
        className="items-center justify-center"
        style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "#F4F4F1" }}
      >
        {icon}
      </View>
      <Text
        className={`flex-1 text-title font-medium ${destructive ? "" : "text-fg-primary"}`}
        style={destructive ? { color: "#791F1F" } : undefined}
      >
        {label}
      </Text>
      {destructive ? null : <ChevronRight color="#9D9D9A" size={16} />}
    </Pressable>
  );
}

function Divider() {
  return <View className="h-[0.5px] bg-line-tertiary mx-lg" />;
}
