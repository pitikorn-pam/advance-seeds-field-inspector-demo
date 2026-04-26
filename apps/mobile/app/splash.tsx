import { useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Sprout } from "lucide-react-native";

/**
 * First-launch splash. The native splash screen is hidden once i18n boots;
 * this is the JS-side ceremony that opens the welcome flow. Auto-routes to
 * /welcome after 1.5 s, or immediately on tap of the "Get started" CTA.
 *
 * Subsequent launches skip this entirely — the StartupGate in the root
 * layout reads the onboarded flag and goes straight to /login or /(tabs).
 */
export default function Splash() {
  const { t } = useTranslation(["common", "onboarding"]);
  const router = useRouter();

  useEffect(() => {
    const handle = setTimeout(() => {
      router.replace("/welcome");
    }, 1500);
    return () => clearTimeout(handle);
  }, [router]);

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <View className="flex-1 items-center justify-center px-xl">
        <View
          className="items-center justify-center mb-2xl"
          style={{ width: 78, height: 78, borderRadius: 22, backgroundColor: "#0F6E56" }}
        >
          <Sprout color="white" size={38} strokeWidth={1.6} />
        </View>
        <Text className="text-fg-primary font-medium" style={{ fontSize: 30, letterSpacing: -0.6 }}>
          {t("common:appName")}
        </Text>
        <Text className="text-body text-fg-secondary mt-xs text-center">
          {t("onboarding:splash.tagline")}
        </Text>

        {/* Three progress dots — purely cosmetic, mirrors the prototype. */}
        <View className="flex-row items-center gap-[6px] mt-3xl">
          <Dot opacity={0.4} />
          <Dot opacity={0.7} />
          <Dot opacity={1} />
        </View>
      </View>

      <View className="px-xl pb-xl">
        <Pressable
          accessibilityRole="button"
          className="h-12 items-center justify-center rounded-lg bg-brand active:opacity-90"
          onPress={() => router.replace("/welcome")}
        >
          <Text className="text-brand-on font-medium" style={{ fontSize: 15 }}>
            {t("onboarding:splash.getStarted")}
          </Text>
        </Pressable>
        <Text className="text-caption text-fg-tertiary text-center mt-sm">
          {t("onboarding:splash.version")}
        </Text>
      </View>
    </SafeAreaView>
  );
}

function Dot({ opacity }: { opacity: number }) {
  return (
    <View
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: "#0F6E56",
        opacity,
      }}
    />
  );
}
