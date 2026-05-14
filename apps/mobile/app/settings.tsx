import { ScrollView, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { ChevronLeft } from "lucide-react-native";
import { useTheme } from "@/lib/theme";
import { useSyncQueue } from "@/lib/sync/useSyncQueue";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { Segmented } from "@/components/ui/Segmented";
import type { Theme } from "@advance-seeds/types";
import type { SupportedLocale } from "@advance-seeds/i18n";

/**
 * App-level settings — appearance, language, sync maintenance, and build info.
 *
 * Visual treatment matches the prototype's `SettingsScreen`: section captions
 * sit above grouped Cards (`p-0`) whose rows share dividers. Each row is a
 * label + value/control pair so the screen reads as a tidy list rather than
 * a stack of free-form cards. Data wiring (theme, locale, sync queue) is
 * unchanged from the previous revision.
 */
export default function SettingsScreen() {
  const { t, i18n } = useTranslation(["common", "settings"]);
  const router = useRouter();
  const { theme, setTheme } = useTheme();
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
      <ScrollView contentContainerClassName="px-xl py-md gap-lg">
        <Section title={t("settings:sections.appearance")}>
          <Card className="p-0">
            <Row
              label={t("settings:rows.theme")}
              control={
                <Segmented<Theme>
                  value={theme}
                  onChange={setTheme}
                  options={themeOpts.map((value) => ({
                    value,
                    label: t(`common:themes.${value}`),
                  }))}
                  variant="tag"
                />
              }
              hint={t("settings:appearanceHint")}
            />
          </Card>
        </Section>

        <Section title={t("settings:sections.language")}>
          <Card className="p-0">
            <Row
              label={t("settings:rows.language")}
              control={
                <Segmented<SupportedLocale>
                  value={activeLocale}
                  onChange={(next) => void i18n.changeLanguage(next)}
                  options={localeOpts.map((value) => ({
                    value,
                    label: t(`common:languages.${value}`),
                  }))}
                  variant="tag"
                />
              }
            />
          </Card>
        </Section>

        <Section title={t("settings:sections.sync")}>
          <Card className="p-0">
            <Row
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
            <Divider />
            <Row
              label={t("settings:sync.pendingCount")}
              value={<NumericValue text={String(syncQueue.counts.pending)} />}
            />
            <Divider />
            <Row
              label={t("settings:sync.failedCount")}
              value={
                <NumericValue
                  text={String(syncQueue.counts.failed)}
                  tone={syncQueue.counts.failed > 0 ? "danger" : "default"}
                />
              }
            />
            {lastError ? (
              <>
                <Divider />
                <View className="px-lg py-md">
                  <Text className="text-caption text-danger-text" numberOfLines={2}>
                    {lastError}
                  </Text>
                </View>
              </>
            ) : null}
            <Divider />
            <View className="flex-row gap-sm px-lg py-md">
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
          </Card>
        </Section>

        <Section title={t("settings:sections.app")}>
          <Card className="p-0">
            <Row label={t("settings:version")} value={<NumericValue text={appVersion} />} />
            <Divider />
            <Row label={t("settings:build")} value={<NumericValue text={buildNumber} />} />
          </Card>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-sm">
      <Text className="text-caption font-medium uppercase text-fg-secondary px-xs">{title}</Text>
      {children}
    </View>
  );
}

function Row({
  label,
  value,
  control,
  hint,
}: {
  label: string;
  value?: React.ReactNode;
  control?: React.ReactNode;
  hint?: string;
}) {
  return (
    <View className="px-lg py-md gap-sm">
      <View className="flex-row items-center justify-between gap-md">
        <Text className="text-body text-fg-primary flex-1">{label}</Text>
        {value}
      </View>
      {control ? <View>{control}</View> : null}
      {hint ? <Text className="text-caption text-fg-secondary">{hint}</Text> : null}
    </View>
  );
}

function NumericValue({ text, tone = "default" }: { text: string; tone?: "default" | "danger" }) {
  return (
    <Text
      className={`text-title ${tone === "danger" ? "text-danger-text" : "text-fg-primary"}`}
      numberOfLines={1}
    >
      {text}
    </Text>
  );
}

function Divider() {
  return <View className="h-[0.5px] bg-line-tertiary mx-lg" />;
}
