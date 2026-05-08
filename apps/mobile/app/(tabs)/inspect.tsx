import { Redirect, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { useModelInstallInspectionGate } from "@/lib/models/inspectionGate";

/**
 * Inspect tab landing fallback. Normal tab presses are intercepted in
 * `(tabs)/_layout.tsx` and pushed directly to /capture/setup, so this route
 * should only render for deep links or unusual navigator restores.
 *
 * Why a redirect tab instead of inlining the setup screen here?
 * The capture flow is fullscreen (no bottom tab bar). Keeping it as a separate
 * Stack at /capture/* lets us render scan / precise over the camera without
 * bottom-tab visual noise. The Inspect tab in the bottom bar still puts
 * "start capture" one tap from anywhere.
 */
export default function InspectTab() {
  const { t } = useTranslation(["inspections", "more"]);
  const router = useRouter();
  const modelInstallGate = useModelInstallInspectionGate();
  if (modelInstallGate.blocked) {
    const title = modelInstallGate.installing
      ? t("inspections:capture.modelInstallBlockedTitle")
      : t("inspections:capture.modelRequiredTitle");
    const body = modelInstallGate.installing
      ? t("inspections:capture.modelInstallBlockedBody", {
          name: modelInstallGate.install.displayName ?? t("more:models.defaultPill"),
        })
      : t("inspections:capture.modelRequiredBody");
    return (
      <SafeAreaView className="flex-1 bg-bg-secondary px-xl py-2xl" edges={["top", "bottom"]}>
        <View className="flex-1 items-center justify-center gap-md">
          <Text className="text-title text-fg-primary font-medium text-center">{title}</Text>
          <Text className="text-body text-fg-secondary text-center">{body}</Text>
          <Button
            variant="outline"
            label={t("more:models.title")}
            onPress={() => router.push("/more/models" as never)}
          />
        </View>
      </SafeAreaView>
    );
  }
  return <Redirect href="/capture/setup" />;
}
