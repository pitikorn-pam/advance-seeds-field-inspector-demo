import { Alert, ScrollView, View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { ChevronLeft, Cloud, LogOut } from "lucide-react-native";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { useSyncQueue } from "@/lib/sync/useSyncQueue";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { AppTopBar } from "@/components/ui/AppTopBar";
import type { Theme } from "@advance-seeds/types";
import type { SupportedLocale } from "@advance-seeds/i18n";

/**
 * App-level settings.
 *
 * Visual layer mirrors the prototype `SettingsScreen`: section captions
 * above grouped `Card`s, Appearance bundles Theme + Language as inline grid
 * pickers, Sync shows a status row with retry / clear actions, About lists
 * version / build / backend, and a destructive Sign out button sits at the
 * bottom. Theme, locale, sync-queue, and auth wiring are unchanged.
 */
export default function SettingsScreen() {
  const { t, i18n } = useTranslation(["common", "settings", "more"]);
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { signOut } = useAuth();
  const syncQueue = useSyncQueue();
  const themeOpts: Theme[] = ["light", "dark", "system"];
  const localeOpts: SupportedLocale[] = ["en", "th"];
  const activeLocale: SupportedLocale = i18n.language.startsWith("th") ? "th" : "en";
  const appVersion = Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? "—";
  const buildNumber =
    Constants.nativeBuildVersion ??
    Constants.expoConfig?.ios?.buildNumber ??
    Constants.expoConfig?.android?.versionCode?.toString() ??
    "—";
  const lastError = syncQueue.entries.find((entry) => entry.lastError)?.lastError;

  const syncStatusLabel =
    syncQueue.counts.failed > 0
      ? t("settings:sync.failed", { count: syncQueue.counts.failed })
      : syncQueue.counts.pending > 0
        ? t("settings:sync.pending", { count: syncQueue.counts.pending })
        : t("settings:sync.upToDate");

  const syncTone =
    syncQueue.counts.failed > 0 ? "danger" : syncQueue.counts.pending > 0 ? "warning" : "success";

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
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("settings:title")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#171717" size={20} />,
          onPress: () => router.back(),
        }}
      />
      <ScrollView contentContainerClassName="px-xl pt-md pb-xl gap-md">
        {/* Appearance — Theme + Language grids inside one card */}
        <Section title={t("settings:sections.appearance")}>
          <View className="px-md py-md gap-md">
            <View className="gap-sm">
              <Text className="text-[11px] font-semibold uppercase tracking-[0.6px] text-fg-tertiary px-xs">
                {t("settings:rows.theme")}
              </Text>
              <View className="flex-row gap-xs">
                {themeOpts.map((opt) => (
                  <GridButton
                    key={opt}
                    label={t(`common:themes.${opt}`)}
                    active={theme === opt}
                    onPress={() => setTheme(opt)}
                  />
                ))}
              </View>
            </View>

            <View className="gap-sm">
              <Text className="text-[11px] font-semibold uppercase tracking-[0.6px] text-fg-tertiary px-xs">
                {t("settings:rows.language")}
              </Text>
              <View className="flex-row gap-xs">
                {localeOpts.map((opt) => (
                  <GridButton
                    key={opt}
                    label={t(`common:languages.${opt}`)}
                    active={activeLocale === opt}
                    onPress={() => void i18n.changeLanguage(opt)}
                  />
                ))}
              </View>
            </View>
          </View>
        </Section>

        {/* Sync */}
        <Section title={t("settings:sections.sync")}>
          <View className="flex-row items-center gap-md px-md py-md">
            <View className="h-9 w-9 items-center justify-center rounded-md bg-card-mint">
              <Cloud color="#2D6E3F" size={18} />
            </View>
            <View className="flex-1">
              <Text className="text-body font-medium text-fg-primary">{syncStatusLabel}</Text>
              <Text className="text-caption text-fg-secondary mt-[1px]">
                {t("settings:sync.status")}
              </Text>
            </View>
            <Pill tone={syncTone} dot label={syncStatusLabel} />
          </View>
          <Divider />
          <SettingsRow
            label={t("settings:sync.pendingCount")}
            value={String(syncQueue.counts.pending)}
            mono
          />
          <Divider />
          <SettingsRow
            label={t("settings:sync.failedCount")}
            value={String(syncQueue.counts.failed)}
            mono
            danger={syncQueue.counts.failed > 0}
          />
          {lastError ? (
            <>
              <Divider />
              <View className="px-md py-md">
                <Text className="text-caption text-danger-text" numberOfLines={2}>
                  {lastError}
                </Text>
              </View>
            </>
          ) : null}
          <Divider />
          <View className="flex-row gap-xs px-md py-md">
            <Button
              className="flex-1"
              size="sm"
              variant="primary"
              label={t("settings:sync.retryAll")}
              disabled={syncQueue.counts.pending + syncQueue.counts.failed === 0}
              onPress={() => void syncQueue.retryAll()}
            />
            <Button
              className="flex-1"
              size="sm"
              variant="ghostDanger"
              label={t("settings:sync.clearFailed")}
              disabled={syncQueue.counts.failed === 0}
              onPress={() => void syncQueue.clearFailed()}
            />
          </View>
        </Section>

        {/* About */}
        <Section title={t("settings:sections.app")}>
          <SettingsRow label={t("settings:version")} value={appVersion} mono />
          <Divider />
          <SettingsRow label={t("settings:build")} value={buildNumber} mono />
        </Section>

        {/* Destructive sign-out — kept for the existing sign-out flow */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("more:menu.signOut")}
          onPress={onSignOut}
          className="mt-md flex-row items-center justify-center gap-sm rounded-md bg-bg-primary py-md active:opacity-80"
          style={{ borderWidth: 1, borderColor: "#FBC4C4" }}
        >
          <LogOut color="#8A1F1B" size={16} />
          <Text className="text-body font-medium" style={{ color: "#8A1F1B" }}>
            {t("more:menu.signOut")}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

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

function SettingsRow({
  label,
  value,
  mono = false,
  danger = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  danger?: boolean;
}) {
  return (
    <View className="flex-row items-center px-md py-md">
      <Text className="text-body font-medium text-fg-primary flex-1">{label}</Text>
      <Text
        className="text-caption font-medium"
        style={{
          color: danger ? "#8A1F1B" : undefined,
          fontFamily: mono ? "ui-monospace" : undefined,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function GridButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      className={`flex-1 items-center justify-center rounded-md py-sm active:opacity-80 ${
        active
          ? "border-2 border-primary bg-bg-primary"
          : "border border-line-secondary bg-bg-primary"
      }`}
    >
      <Text
        className={`text-caption font-semibold ${active ? "text-primary" : "text-fg-primary"}`}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Divider() {
  return <View className="h-px bg-line-tertiary mx-md" />;
}
