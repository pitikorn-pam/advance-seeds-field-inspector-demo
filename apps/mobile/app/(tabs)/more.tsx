import { ScrollView, View, Text, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import {
  User,
  Video,
  Target,
  Clock,
  BarChart3,
  Settings as SettingsIcon,
  Sliders,
  Cpu,
  Sprout,
  ChevronRight,
  LogOut,
  Bell,
} from "lucide-react-native";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/Card";

/**
 * More screen — secondary navigation hub.
 *
 * Visual layer mirrors the Field Inspector redesign prototype `MoreScreen`:
 * profile card at the top, then grouped sections (`MoreGroup`) of `MoreRow`s.
 * Each row has a 32x32 tinted icon square, a title, an optional subline, an
 * optional admin badge, and a chevron. Sign-out is the trailing row of the
 * Account group with destructive styling. Data wiring (auth + navigation +
 * sign-out flow) is unchanged from the previous revision.
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
      <ScrollView contentContainerClassName="px-xl pt-md pb-xl gap-md">
        <Section title={t("more:sections.inspectionTools")}>
          <MenuRow
            renderIcon={() => <Video color={ROW_INK.rose} size={16} />}
            tint="bg-card-rose"
            label={t("more:menu.recordings")}
            onPress={() => router.push("/more/recordings" as never)}
          />
          <Divider />
          <MenuRow
            renderIcon={() => <Clock color={ROW_INK.sky} size={16} />}
            tint="bg-card-sky"
            label={t("more:menu.history")}
            onPress={() => router.push("/more/history" as never)}
          />
        </Section>

        <Section title={t("more:sections.referenceData")}>
          <MenuRow
            renderIcon={() => <Sprout color={ROW_INK.lavender} size={16} />}
            tint="bg-card-lavender"
            label={t("more:menu.varieties")}
            onPress={() => router.push("/more/capture-classes" as never)}
          />
          <Divider />
          <MenuRow
            renderIcon={() => <Target color={ROW_INK.mint} size={16} />}
            tint="bg-card-mint"
            label={t("more:menu.calibration")}
            onPress={() => router.push("/calibration")}
          />
          <Divider />
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

        <Section title={t("more:sections.insights")}>
          <MenuRow
            renderIcon={() => <Bell color={ROW_INK.sky} size={16} />}
            tint="bg-card-sky"
            label={t("more:menu.notifications")}
            onPress={() => router.push("/notifications" as never)}
          />
          <Divider />
          <MenuRow
            renderIcon={() => <BarChart3 color={ROW_INK.yellow} size={16} />}
            tint="bg-card-yellow"
            label={t("more:menu.reports")}
            onPress={() => router.push("/reports")}
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

        <View className="items-center pt-md">
          <Text className="text-[11px] font-semibold uppercase tracking-[0.6px] text-fg-tertiary">
            {t("more:footer.appName")}
          </Text>
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
      <Text className="text-[11px] font-semibold uppercase tracking-[0.6px] text-fg-tertiary px-xs">
        {title}
      </Text>
      <Card className="p-0 overflow-hidden">{children}</Card>
    </View>
  );
}

function MenuRow({
  renderIcon,
  tint,
  label,
  sub,
  admin = false,
  destructive = false,
  onPress,
}: {
  renderIcon: () => React.ReactNode;
  tint: string;
  label: string;
  sub?: string;
  admin?: boolean;
  destructive?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-row items-center gap-md px-md py-md active:bg-bg-tertiary"
    >
      <View className={`h-10 w-10 items-center justify-center rounded-md ${tint}`}>
        {renderIcon()}
      </View>
      <View className="flex-1">
        <View className="flex-row items-center gap-xs">
          <Text
            className={`text-body font-medium ${destructive ? "" : "text-fg-primary"}`}
            style={destructive ? { color: ROW_INK.danger } : undefined}
            numberOfLines={1}
          >
            {label}
          </Text>
          {admin ? (
            <View className="h-4 rounded-sm bg-card-lavender px-[5px] justify-center">
              <Text className="text-[9px] font-semibold uppercase tracking-[0.4px] text-primary-deep">
                admin
              </Text>
            </View>
          ) : null}
        </View>
        {sub ? (
          <Text className="text-caption text-fg-secondary mt-[1px]" numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <ChevronRight color="#8C8C87" size={16} />
    </Pressable>
  );
}

function Divider() {
  return <View className="h-px bg-line-tertiary mx-md" />;
}
