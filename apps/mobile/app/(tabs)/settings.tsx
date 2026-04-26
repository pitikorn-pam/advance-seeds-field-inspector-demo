import { ScrollView, View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Link, useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import type { Theme } from "@advance-seeds/types";
import type { SupportedLocale } from "@advance-seeds/i18n";

export default function SettingsTab() {
  const { t, i18n } = useTranslation([
    "common",
    "settings",
    "calibration",
    "varieties",
    "batches",
    "reports",
    "profile",
  ]);
  const { profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  const themeOpts: Theme[] = ["light", "dark", "system"];
  const localeOpts: SupportedLocale[] = ["en", "th"];

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top"]}>
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

        <View className="gap-md">
          <Text className="text-caption uppercase text-fg-secondary">
            {t("settings:sections.about")}
          </Text>
          <Card className="p-0">
            {[
              { href: "/profile", label: t("profile:title") },
              { href: "/calibration", label: t("settings:sections.calibration") },
              { href: "/varieties", label: t("varieties:title") },
              { href: "/batches", label: t("batches:title") },
              { href: "/reports", label: t("reports:title") },
            ].map((row, idx) => (
              <Link key={row.href} href={row.href as never} asChild>
                <Pressable
                  className={`flex-row items-center justify-between px-xl py-md ${
                    idx > 0 ? "border-t border-line-tertiary" : ""
                  }`}
                >
                  <Text className="text-title text-fg-primary">{row.label}</Text>
                  <ChevronRight color="#9D9D9A" size={18} />
                </Pressable>
              </Link>
            ))}
          </Card>
        </View>

        <Button
          variant="outline"
          label={t("common:actions.signOut")}
          onPress={async () => {
            await signOut();
            router.replace("/login");
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
