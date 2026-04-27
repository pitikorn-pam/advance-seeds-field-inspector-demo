import { ScrollView, View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Camera as CameraIcon, Target, RefreshCw } from "lucide-react-native";
import { Camera as VCCamera } from "react-native-vision-camera";
import { setOnboarded } from "@/lib/onboarding";
import { Card } from "@/components/ui/Card";

/**
 * Welcome / onboarding pitch screen — three feature cards over a hero.
 * Continue marks the persistent onboarded flag and routes to /login. The
 * camera permission prompt fires here too: Vision Camera's permission ask
 * shows the system dialog, and Continue proceeds regardless of grant
 * (login still works without camera; capture screens re-prompt on demand).
 *
 * The hero is a CSS-shape collage rather than an asset so the bundle stays
 * lean and the screen renders identically across light/dark themes via
 * design tokens.
 */
export default function Welcome() {
  const { t } = useTranslation(["common", "onboarding"]);
  const router = useRouter();

  const onContinue = async () => {
    // Pre-flight camera + microphone permissions in parallel. Best-effort:
    // we don't gate Continue on grant — the user can still sign in. Camera
    // is mandatory before /capture/scan does anything; mic only matters
    // for video recording (Phase 7b) and degrades gracefully if denied.
    try {
      await Promise.all([
        VCCamera.requestCameraPermission(),
        VCCamera.requestMicrophonePermission(),
      ]);
    } catch {
      // permission request can throw on emulators or denied states
    }
    await setOnboarded();
    router.replace("/login");
  };

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <ScrollView contentContainerClassName="px-xl pt-md pb-xl gap-md">
        <View
          className="items-center justify-center"
          style={{ height: 200, backgroundColor: "#E1F5EE", borderRadius: 22 }}
        >
          <View style={{ position: "relative", width: 130, height: 130 }}>
            <View
              style={{
                position: "absolute",
                width: 38,
                height: 24,
                backgroundColor: "#0F6E56",
                borderRadius: 12,
                top: 30,
                left: 18,
                transform: [{ rotate: "15deg" }],
              }}
            />
            <View
              style={{
                position: "absolute",
                width: 42,
                height: 26,
                backgroundColor: "#0F6E56",
                borderRadius: 13,
                top: 56,
                left: 56,
                opacity: 0.7,
                transform: [{ rotate: "-12deg" }],
              }}
            />
            <View
              style={{
                position: "absolute",
                width: 36,
                height: 22,
                backgroundColor: "#04342C",
                borderRadius: 11,
                top: 84,
                left: 28,
                opacity: 0.5,
                transform: [{ rotate: "20deg" }],
              }}
            />
            <View
              style={{
                position: "absolute",
                width: 60,
                height: 60,
                borderWidth: 2,
                borderColor: "#0F6E56",
                borderRadius: 30,
                top: 18,
                left: 60,
              }}
            />
          </View>
        </View>

        <Text
          className="text-fg-primary font-medium mt-md"
          style={{ fontSize: 30, letterSpacing: -0.6 }}
        >
          {t("onboarding:welcome.title")}
        </Text>
        <Text className="text-body text-fg-secondary">{t("onboarding:welcome.body")}</Text>

        <FeatureCard
          icon={<CameraIcon color="#0F6E56" size={16} />}
          title={t("onboarding:welcome.cardCameraTitle")}
          body={t("onboarding:welcome.cardCameraBody")}
        />
        <FeatureCard
          icon={<Target color="#0F6E56" size={16} />}
          title={t("onboarding:welcome.cardTargetTitle")}
          body={t("onboarding:welcome.cardTargetBody")}
        />
        <FeatureCard
          icon={<RefreshCw color="#0F6E56" size={16} />}
          title={t("onboarding:welcome.cardSyncTitle")}
          body={t("onboarding:welcome.cardSyncBody")}
        />
      </ScrollView>

      <View className="px-xl pb-xl">
        <Pressable
          accessibilityRole="button"
          className="h-12 items-center justify-center rounded-lg bg-brand active:opacity-90"
          onPress={onContinue}
        >
          <Text className="text-brand-on font-medium" style={{ fontSize: 15 }}>
            {t("onboarding:welcome.continue")}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Card>
      <View className="flex-row items-center gap-md">
        <View
          className="items-center justify-center"
          style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "#E1F5EE" }}
        >
          {icon}
        </View>
        <View className="flex-1">
          <Text className="text-title text-fg-primary font-medium">{title}</Text>
          <Text className="text-caption text-fg-secondary">{body}</Text>
        </View>
      </View>
    </Card>
  );
}
