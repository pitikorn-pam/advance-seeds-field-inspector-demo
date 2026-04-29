import { ScrollView, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { ChevronLeft } from "lucide-react-native";
import { useTheme } from "@/lib/theme";
import { Card } from "@/components/ui/Card";
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
          icon: <ChevronLeft color="#1A1A1A" size={20} />,
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-md">
      <Text className="text-body text-fg-secondary">{label}</Text>
      <Text className="text-title text-fg-primary" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
