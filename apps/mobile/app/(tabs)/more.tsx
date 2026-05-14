import { ScrollView, View, Text, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import {
  User,
  Video,
  Target,
  History,
  BarChart3,
  Settings as SettingsIcon,
  Sliders,
  Cpu,
  Sprout,
  ChevronRight,
  LogOut,
} from "lucide-react-native";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/Card";

/**
 * More screen — secondary navigation hub.
 *
 * Visual layer follows the Field Inspector redesign prototype:
 * grouped sections with a small caption, a bordered Card list, hairline
 * dividers between rows, and a tinted icon tile per row. Sign-out is a
 * destructive row with no chevron. The footer shows the app version.
 *
 * Five sections (Inspection tools / Reference data / Calibration /
 * Model & tuning / Account) map onto the existing routes; data wiring
 * (auth gates, navigation, sign-out flow) is unchanged.
 */
export default function MoreScreen() {
  const { t } = useTranslation(["common", "more"]);
  const router = useRouter();
  const { signOut } = useAuth();

  const appVersion = Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? "—";
  const buildNumber =
    Constants.expoConfig?.ios?.buildNumber ??
    Constants.expoConfig?.android?.versionCode?.toString() ??
    Constants.nativeBuildVersion ??
    "—";

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

        <Section title={t("more:sections.inspectionTools")}>
          <MenuRow
            renderIcon={() => <Video color={ROW_INK.rose} size={16} />}
            tint="bg-card-rose"
            label={t("more:menu.recordings")}
            onPress={() => router.push("/more/recordings" as never)}
          />
          <Divider />
          <MenuRow
            renderIcon={() => <History color={ROW_INK.sky} size={16} />}
            tint="bg-card-sky"
            label={t("more:menu.history")}
            onPress={() => router.push("/more/history" as never)}
          />
          <Divider />
          <MenuRow
            renderIcon={() => <BarChart3 color={ROW_INK.yellow} size={16} />}
            tint="bg-card-yellow"
            label={t("more:menu.reports")}
            onPress={() => router.push("/reports")}
          />
        </Section>

        <Section title={t("more:sections.referenceData")}>
          <MenuRow
            renderIcon={() => <Sprout color={ROW_INK.lavender} size={16} />}
            tint="bg-card-lavender"
            label={t("more:menu.varieties")}
            onPress={() => router.push("/more/capture-classes" as never)}
          />
        </Section>

        <Section title={t("more:sections.calibration")}>
          <MenuRow
            renderIcon={() => <Target color={ROW_INK.mint} size={16} />}
            tint="bg-card-mint"
            label={t("more:menu.calibration")}
            onPress={() => router.push("/calibration")}
          />
        </Section>

        <Section title={t("more:sections.modelTuning")}>
          <MenuRow
            renderIcon={() => <Sliders color={ROW_INK.peach} size={16} />}
            tint="bg-card-peach"
            label={t("more:menu.hyperparams")}
            onPress={() => router.push("/more/hyperparams" as never)}
          />
          <Divider />
          <MenuRow
            renderIcon={() => <Cpu color={ROW_INK.lavender} size={16} />}
            tint="bg-card-lavender"
            label={t("more:menu.models")}
            onPress={() => router.push("/more/models" as never)}
          />
        </Section>

        <Section title={t("more:sections.account")}>
          <MenuRow
            renderIcon={() => <User color={ROW_INK.neutral} size={16} />}
            tint="bg-card-gray"
            label={t("more:menu.profile")}
            onPress={() => router.push("/profile")}
          />
          <Divider />
          <MenuRow
            renderIcon={() => <SettingsIcon color={ROW_INK.neutral} size={16} />}
            tint="bg-card-gray"
            label={t("more:menu.settings")}
            onPress={() => router.push("/settings")}
          />
          <Divider />
          <MenuRow
            renderIcon={() => <LogOut color={ROW_INK.danger} size={16} />}
            tint="bg-card-gray"
            label={t("more:menu.signOut")}
            destructive
            onPress={onSignOut}
          />
        </Section>

        <View className="items-center pt-md pb-xl">
          <Text className="text-caption text-fg-tertiary">{t("more:footer.appName")}</Text>
          <Text className="mt-xs text-caption text-fg-secondary">
            {t("more:footer.version", { version: appVersion, build: buildNumber })}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Per-row icon ink colours. Picked to read on the matching `card-*` tint in
 * both light and dark themes; the tile background flips via the Tailwind
 * token so contrast is preserved.
 */
const ROW_INK = {
  rose: "#B23A6F",
  sky: "#1C5A8E",
  mint: "#2D6E3F",
  peach: "#B7541C",
  lavender: "#5B3FA8",
  yellow: "#7A5A12",
  neutral: "#5C5C58",
  danger: "#8A1F1B",
} as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-sm">
      <Text className="text-caption font-medium uppercase text-fg-secondary px-xs">{title}</Text>
      <Card className="p-0 overflow-hidden">{children}</Card>
    </View>
  );
}

function MenuRow({
  renderIcon,
  tint,
  label,
  destructive = false,
  onPress,
}: {
  renderIcon: () => React.ReactNode;
  tint: string;
  label: string;
  destructive?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-row items-center gap-md px-lg py-md active:bg-bg-tertiary"
    >
      <View className={`h-8 w-8 items-center justify-center rounded-md ${tint}`}>
        {renderIcon()}
      </View>
      <Text
        className={`flex-1 text-title font-medium ${destructive ? "" : "text-fg-primary"}`}
        style={destructive ? { color: ROW_INK.danger } : undefined}
      >
        {label}
      </Text>
      {destructive ? null : <ChevronRight color="#8C8C87" size={16} />}
    </Pressable>
  );
}

function Divider() {
  return <View className="h-px bg-line-tertiary mx-lg" />;
}
