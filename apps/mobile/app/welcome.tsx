import { ScrollView, View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Camera as CameraIcon, DatabaseZap, RefreshCw, Target } from "lucide-react-native";
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
    void requestCapturePermissions();
    await setOnboarded();
    router.replace("/login");
  };

  const onSkip = async () => {
    // Same as continue minus the permission prompts. Capture screens
    // re-prompt if camera permission turns out to be missing.
    await setOnboarded();
    router.replace("/login");
  };

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <ScrollView contentContainerClassName="px-xl pt-md pb-xl gap-md">
        <View className="rounded-lg bg-brand-navy px-xl py-xl">
          <Text className="text-caption font-medium uppercase text-fg-on-dark-muted">
            {t("onboarding:welcome.heroLabel")}
          </Text>
          <Text className="mt-sm text-fg-on-dark font-medium" style={{ fontSize: 34 }}>
            {t("onboarding:welcome.title")}
          </Text>
          <Text className="mt-sm text-body text-fg-on-dark-muted">
            {t("onboarding:welcome.body")}
          </Text>
        </View>

        <FeatureCard
          tone="yellowBold"
          renderIcon={() => <CameraIcon color="#0D1028" size={16} />}
          title={t("onboarding:welcome.cardCameraTitle")}
          body={t("onboarding:welcome.cardCameraBody")}
        />
        <FeatureCard
          tone="mint"
          renderIcon={() => <Target color="#11A78B" size={16} />}
          title={t("onboarding:welcome.cardTargetTitle")}
          body={t("onboarding:welcome.cardTargetBody")}
        />
        <FeatureCard
          tone="lavender"
          renderIcon={() => <RefreshCw color="#6C47FF" size={16} />}
          title={t("onboarding:welcome.cardSyncTitle")}
          body={t("onboarding:welcome.cardSyncBody")}
        />
        <FeatureCard
          tone="sky"
          renderIcon={() => <DatabaseZap color="#1957A4" size={16} />}
          title={t("onboarding:welcome.cardWorkspaceTitle")}
          body={t("onboarding:welcome.cardWorkspaceBody")}
        />
      </ScrollView>

      <View className="px-xl pb-xl gap-sm">
        <Pressable
          accessibilityRole="button"
          className="h-11 items-center justify-center rounded-md bg-primary active:bg-primary-pressed"
          onPress={onContinue}
        >
          <Text className="text-primary-on font-medium" style={{ fontSize: 14 }}>
            {t("onboarding:welcome.continue")}
          </Text>
        </Pressable>
        {/* Skip — for users who already understand the product (e.g. fresh
            install on a new device). Marks the onboarded flag like Continue
            but skips the camera + mic permission prompts. Capture re-asks
            on demand if needed, so this is non-blocking. */}
        <Pressable
          accessibilityRole="button"
          className="h-10 items-center justify-center"
          onPress={onSkip}
        >
          <Text className="text-fg-secondary" style={{ fontSize: 13 }}>
            {t("onboarding:welcome.skip")}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

async function requestCapturePermissions() {
  try {
    await VCCamera.requestCameraPermission();
    await VCCamera.requestMicrophonePermission();
  } catch {
    // Capture screens re-check permission, so onboarding must not block here.
  }
}

function FeatureCard({
  renderIcon,
  title,
  body,
  tone = "base",
}: {
  renderIcon: () => React.ReactNode;
  title: string;
  body: string;
  tone?: React.ComponentProps<typeof Card>["tone"];
}) {
  return (
    <Card tone={tone}>
      <View className="flex-row items-center gap-md">
        <View
          className="items-center justify-center rounded-md bg-bg-primary/70"
          style={{ width: 32, height: 32 }}
        >
          {renderIcon()}
        </View>
        <View className="flex-1">
          <Text className="text-title text-fg-primary font-medium">{title}</Text>
          <Text className="text-caption text-fg-secondary">{body}</Text>
        </View>
      </View>
    </Card>
  );
}
