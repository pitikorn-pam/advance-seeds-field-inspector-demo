import { ScrollView, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import type { Theme } from "@advance-seeds/types";
import type { SupportedLocale } from "@advance-seeds/i18n";

/**
 * App-level settings only — appearance and language. The previous
 * everything-bag (Profile / Calibration / Library / Batches / Reports /
 * Sign out) moved to /more in the prototype-fidelity-pass tab restructure.
 *
 * Profile section here is read-only; profile editing remains a future
 * surface and Sign out lives under /more → Manage to give it a single
 * canonical access path.
 */
export default function SettingsScreen() {
  const { t, i18n } = useTranslation(["common", "settings"]);
  const { profile } = useAuth();
  const { theme, setTheme } = useTheme();

  const themeOpts: Theme[] = ["light", "dark", "system"];
  const localeOpts: SupportedLocale[] = ["en", "th"];

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["bottom"]}>
      <ScrollView contentContainerClassName="px-xl py-xl gap-xl">
        <Text className="text-h1 font-medium text-fg-primary">{t("settings:title")}</Text>

        <View className="gap-md">
          <Text className="text-caption uppercase text-fg-secondary">
            {t("settings:sections.profile")}
          </Text>
          <Card>
            {profile ? (
              <View className="gap-sm">
                <View className="flex-row items-center justify-between">
                  <Text className="text-body text-fg-secondary">{t("common:fields.name")}</Text>
                  <Text className="text-title text-fg-primary">{profile.full_name ?? "—"}</Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-body text-fg-secondary">{t("common:fields.email")}</Text>
                  <Text className="text-title text-fg-primary">{profile.email}</Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-body text-fg-secondary">{t("common:fields.role")}</Text>
                  <Pill
                    tone={profile.role === "admin" ? "brand" : "info"}
                    label={t(`common:roles.${profile.role}`)}
                  />
                </View>
              </View>
            ) : null}
          </Card>
        </View>

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

        {/*
          The "About" menu (Profile / Calibration / Library / Batches / Reports)
          previously lived here when Settings was the catch-all hub. After
          the prototype-fidelity-pass tab restructure, those entries belong
          to /more's Manage / Reference / Insights sections — listing them
          here too is a duplicate access path that breaks discoverability
          ("which one is the canonical entry?"). Settings is now scoped to
          appearance + language only.

          Sign out also lives in /more under Manage; we drop it here for
          the same reason.
         */}
      </ScrollView>
    </SafeAreaView>
  );
}
