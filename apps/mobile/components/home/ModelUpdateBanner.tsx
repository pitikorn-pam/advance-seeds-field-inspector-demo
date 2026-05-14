import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Sparkles, X } from "lucide-react-native";
import { dismissUpdate, useModelUpdate } from "@/lib/models/updateStore";
import { useTheme } from "@/lib/theme";

export function ModelUpdateBanner() {
  const update = useModelUpdate();
  const { t } = useTranslation("more");
  const { resolved } = useTheme();
  const router = useRouter();

  if (!update) return null;

  const colors =
    resolved === "dark"
      ? { bg: "#0E2F26", icon: "#7FD1B0", title: "#E7F4EE", caption: "#9EBDB1" }
      : { bg: "#E6F2EC", icon: "#6C47FF", title: "#0E2F26", caption: "#3F6457" };

  const sizeMb =
    typeof update.size_bytes === "number" && update.size_bytes > 0
      ? (update.size_bytes / 1_000_000).toFixed(1)
      : null;

  return (
    <View
      className="flex-row items-center gap-md rounded-lg px-lg py-md"
      style={{ backgroundColor: colors.bg }}
    >
      <Sparkles color={colors.icon} size={18} />
      <View className="flex-1">
        <Text className="text-title font-medium" style={{ color: colors.title, fontSize: 13 }}>
          {t("models.update.title", { semver: update.semver })}
        </Text>
        <Text className="text-caption" style={{ color: colors.caption }}>
          {sizeMb
            ? t("models.update.subtitleWithSize", { size: sizeMb })
            : t("models.update.subtitle")}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("models.update.install")}
        className="h-8 items-center justify-center rounded-md px-md"
        style={{ backgroundColor: colors.icon }}
        onPress={() =>
          router.push({
            pathname: "/more/models",
            params: { install: update.version_id },
          })
        }
      >
        <Text className="text-title font-medium" style={{ color: colors.bg, fontSize: 12 }}>
          {t("models.update.install")}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("models.update.dismiss")}
        className="h-8 w-8 items-center justify-center rounded-md"
        onPress={() => dismissUpdate(update.version_id)}
      >
        <X color={colors.caption} size={16} />
      </Pressable>
    </View>
  );
}
