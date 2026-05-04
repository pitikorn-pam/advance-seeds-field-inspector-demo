import { ScrollView, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { ChevronLeft } from "lucide-react-native";
import { useTheme } from "@/lib/theme";
import { useSyncQueue } from "@/lib/sync/useSyncQueue";
import { useAutoInstallOnWifi } from "@/lib/models/autoInstall";
import { Card } from "@/components/ui/Card";
import { Toggle } from "@/components/ui/Toggle";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { AppTopBar } from "@/components/ui/AppTopBar";
import type { Theme } from "@advance-seeds/types";
import type { SupportedLocale } from "@advance-seeds/i18n";

/**
 * App-level settings only — appearance, language, and build info. The previous
 * everything-bag (Profile / Calibration / Library / Batches / Reports /
 * Sign out) moved to /more in the prototype-fidelity-pass tab restructure.
 */
export default function SettingsScreen() {
  const { t, i18n } = useTranslation(["common", "settings"]);
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const syncQueue = useSyncQueue();
  const [autoInstallOnWifi, setAutoInstallOnWifi] = useAutoInstallOnWifi();

  const themeOpts: Theme[] = ["light", "dark", "system"];
  const localeOpts: SupportedLocale[] = ["en", "th"];
  const appVersion = Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? "—";
  const buildNumber =
    Constants.nativeBuildVersion ??
    Constants.expoConfig?.ios?.buildNumber ??
    Constants.expoConfig?.android?.versionCode?.toString() ??
    "—";

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("settings:title")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#1A1A1A" size={20} />,
          onPress: () => router.back(),
        }}
      />
      <ScrollView contentContainerClassName="px-xl py-md gap-xl">
        <View className="gap-md">
          <Text className="text-caption uppercase text-fg-secondary">
            {t("settings:sections.appearance")}
          </Text>
          <Card>
            <Text className="text-body text-fg-secondary mb-md">
              {t("settings:appearanceHint")}
            </Text>
            <View className="flex-row gap-sm">
              {themeOpts.map((t2) => (
                <Button
                  key={t2}
                  className="flex-1"
                  size="sm"
                  variant={theme === t2 ? "primary" : "outline"}
                  label={t(`common:themes.${t2}`)}
                  onPress={() => setTheme(t2)}
                />
              ))}
            </View>
          </Card>
        </View>

        <View className="gap-md">
          <Text className="text-caption uppercase text-fg-secondary">
            {t("settings:sections.language")}
          </Text>
          <Card>
            <View className="flex-row gap-sm">
              {localeOpts.map((lng) => (
                <Button
                  key={lng}
                  className="flex-1"
                  size="sm"
                  variant={i18n.language.startsWith(lng) ? "primary" : "outline"}
                  label={t(`common:languages.${lng}`)}
                  onPress={() => void i18n.changeLanguage(lng)}
                />
              ))}
            </View>
          </Card>
        </View>

        <View className="gap-md">
          <Text className="text-caption uppercase text-fg-secondary">
            {t("settings:sections.sync")}
          </Text>
          <Card>
            <View className="gap-md">
              <InfoRow
                label={t("settings:sync.status")}
                value={
                  <Pill
                    tone={
                      syncQueue.counts.failed > 0
                        ? "danger"
                        : syncQueue.counts.pending > 0
                          ? "warning"
                          : "success"
                    }
                    dot
                    label={
                      syncQueue.counts.failed > 0
                        ? t("settings:sync.failed", { count: syncQueue.counts.failed })
                        : syncQueue.counts.pending > 0
                          ? t("settings:sync.pending", { count: syncQueue.counts.pending })
                          : t("settings:sync.upToDate")
                    }
                  />
                }
              />
              <InfoRow
                label={t("settings:sync.pendingCount")}
                value={String(syncQueue.counts.pending)}
              />
              <InfoRow
                label={t("settings:sync.failedCount")}
                value={String(syncQueue.counts.failed)}
              />
              {syncQueue.entries.find((entry) => entry.lastError) ? (
                <Text className="text-caption text-danger-text" numberOfLines={2}>
                  {syncQueue.entries.find((entry) => entry.lastError)?.lastError}
                </Text>
              ) : null}
              <View className="flex-row gap-sm">
                <Button
                  className="flex-1"
                  size="sm"
                  variant="outline"
                  label={t("settings:sync.retryAll")}
                  disabled={syncQueue.counts.pending + syncQueue.counts.failed === 0}
                  onPress={() => void syncQueue.retryAll()}
                />
                <Button
                  className="flex-1"
                  size="sm"
                  variant="ghost"
                  label={t("settings:sync.clearFailed")}
                  disabled={syncQueue.counts.failed === 0}
                  onPress={() => void syncQueue.clearFailed()}
                />
              </View>
            </View>
          </Card>
        </View>

        <View className="gap-md">
          <Text className="text-caption uppercase text-fg-secondary">
            {t("settings:sections.models")}
          </Text>
          <Card>
            <View className="flex-row items-center gap-md">
              <View className="flex-1">
                <Text className="text-body text-fg-primary">
                  {t("settings:models.autoInstallOnWifi")}
                </Text>
                <Text className="text-caption text-fg-secondary mt-xs">
                  {t("settings:models.autoInstallOnWifiHint")}
                </Text>
              </View>
              <Toggle
                value={autoInstallOnWifi}
                onValueChange={setAutoInstallOnWifi}
                accessibilityLabel={t("settings:models.autoInstallOnWifi")}
              />
            </View>
          </Card>
        </View>

        <View className="gap-md">
          <Text className="text-caption uppercase text-fg-secondary">
            {t("settings:sections.app")}
          </Text>
          <Card>
            <View className="gap-sm">
              <InfoRow label={t("settings:version")} value={appVersion} />
              <InfoRow label={t("settings:build")} value={buildNumber} />
            </View>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between gap-md">
      <Text className="text-body text-fg-secondary">{label}</Text>
      {typeof value === "string" ? (
        <Text className="text-title text-fg-primary" numberOfLines={1}>
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}
