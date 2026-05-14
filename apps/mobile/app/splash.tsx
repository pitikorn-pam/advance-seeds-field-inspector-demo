import { useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { ScanLine, Sprout } from "lucide-react-native";

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
    <SafeAreaView className="flex-1 bg-brand-navy" edges={["top", "bottom"]}>
      <View className="flex-1 items-center justify-center px-xl">
        <View
          className="mb-2xl items-center justify-center rounded-md bg-card-yellow-bold"
          style={{ width: 78, height: 78 }}
        >
          <Sprout color="#0D1028" size={34} strokeWidth={1.7} />
          <View className="absolute -right-2 -top-2 rounded-md bg-primary p-xs">
            <ScanLine color="#FFFFFF" size={14} strokeWidth={2} />
          </View>
        </View>
        <Text className="font-semibold text-fg-on-dark" style={{ fontSize: 34 }}>
          {t("common:appName")}
        </Text>
        <Text className="mt-xs text-center text-body text-fg-on-dark-muted">
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
          className="h-11 items-center justify-center rounded-md bg-primary active:bg-primary-pressed"
          onPress={() => router.replace("/welcome")}
        >
          <Text className="font-medium text-primary-on" style={{ fontSize: 14 }}>
            {t("onboarding:splash.getStarted")}
          </Text>
        </Pressable>
        <Text className="mt-sm text-center text-caption text-fg-on-dark-muted">
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
        backgroundColor: "#FFD84D",
        opacity,
      }}
    />
  );
}
