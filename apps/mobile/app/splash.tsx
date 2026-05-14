import { useEffect } from "react";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";

/**
 * First-launch splash, ported 1:1 from `auth.jsx > SplashScreen`:
 * white background, centered 64px purple AS brand mark with the app
 * name and "Field Inspector" subline; a thin progress bar + status
 * label + version caption pinned near the bottom.
 *
 * The native splash hides after i18n boots; this is the JS-side
 * ceremony that routes to /welcome after a brief delay. The StartupGate
 * in the root layout reads the onboarded flag and bypasses this on
 * subsequent launches.
 */
export default function Splash() {
  const { t } = useTranslation(["onboarding"]);
  const router = useRouter();

  useEffect(() => {
    const handle = setTimeout(() => {
      router.replace("/welcome");
    }, 1500);
    return () => clearTimeout(handle);
  }, [router]);

  return (
    <SafeAreaView className="flex-1 bg-bg-primary" edges={["top", "bottom"]}>
      <View className="flex-1 items-center justify-center px-2xl">
        <BrandMark />
        <Text
          className="mt-md font-semibold text-fg-primary text-center"
          style={{ fontSize: 22, letterSpacing: -0.4 }}
        >
          Advance Seeds
        </Text>
        <Text className="mt-[2px] text-caption text-fg-secondary text-center">Field Inspector</Text>
      </View>
      <View className="items-center pb-3xl gap-sm">
        <View
          className="overflow-hidden bg-line-tertiary"
          style={{ width: 140, height: 3, borderRadius: 9999 }}
        >
          <View className="h-full bg-primary" style={{ width: "62%", borderRadius: 9999 }} />
        </View>
        <Text className="text-caption text-fg-tertiary">
          {t("onboarding:splash.checking", { defaultValue: "Checking session…" })}
        </Text>
        <Text className="text-[11px] uppercase tracking-[0.6px] font-semibold text-fg-tertiary">
          {t("onboarding:splash.version")}
        </Text>
      </View>
    </SafeAreaView>
  );
}

/**
 * 64px purple square with white "AS" — matches the prototype's BrandMark
 * default size. Inlined here (and in login/welcome) so the mark renders
 * identically without an extra import.
 */
function BrandMark() {
  return (
    <View
      className="items-center justify-center rounded-lg bg-primary"
      style={{
        width: 64,
        height: 64,
        shadowColor: "#6E40E0",
        shadowOpacity: 0.25,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      }}
    >
      <Text
        className="text-primary-on"
        style={{ fontSize: 24, fontWeight: "700", letterSpacing: -1 }}
      >
        AS
      </Text>
    </View>
  );
}
