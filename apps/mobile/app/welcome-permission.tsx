import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Camera, Video, MapPin } from "lucide-react-native";
import { Camera as VCCamera } from "react-native-vision-camera";

/**
 * Welcome → Permission gate.
 *
 * 1:1 port of the prototype `WelcomePermissionScreen` (auth.jsx). Shown
 * after the welcome pitch when camera permission has not yet been
 * determined. "Allow access" fires the system camera + microphone
 * prompts via Vision Camera; "Not now" defers and proceeds to /login.
 *
 * Vision Camera's `requestCameraPermission()` resolves with the new
 * status after the user responds. We don't block on the result —
 * downstream capture screens re-check permission anyway.
 */
export default function WelcomePermission() {
  const { t } = useTranslation(["common", "onboarding"]);
  const router = useRouter();

  // Fire permission prompts in the background so the navigation is instant.
  // iOS's permission dialog still appears over the next screen; capture
  // screens re-check anyway so a delayed grant is harmless. Skipping the
  // request entirely when permission is already granted avoids the system
  // briefly flashing a "stay on this app" sheet for users on reinstall.
  const onAllow = () => {
    const status = VCCamera.getCameraPermissionStatus();
    if (status === "not-determined") {
      void VCCamera.requestCameraPermission().catch(() => {});
      void VCCamera.requestMicrophonePermission().catch(() => {});
    }
    router.replace("/login");
  };

  const onNotNow = () => {
    router.replace("/login");
  };

  return (
    <SafeAreaView className="flex-1 bg-bg-primary" edges={["top", "bottom"]}>
      <View
        className="flex-1 items-center"
        style={{ paddingHorizontal: 24, paddingTop: 60, justifyContent: "center" }}
      >
        {/* 84×84 lavender icon square */}
        <View
          className="rounded-xl items-center justify-center bg-card-lavender"
          style={{ width: 84, height: 84 }}
        >
          <Camera color="#5B3FD9" size={40} />
        </View>

        <Text
          className="font-semibold text-fg-primary text-center"
          style={{ fontSize: 22, marginTop: 24 }}
        >
          {t("onboarding:welcomePermission.title")}
        </Text>
        <Text
          className="text-body text-fg-secondary text-center"
          style={{ marginTop: 8, maxWidth: 280 }}
        >
          {t("onboarding:welcomePermission.body")}
        </Text>

        {/* Permission rows */}
        <View className="w-full gap-xs" style={{ marginTop: 28 }}>
          <PermissionRow
            Icon={Camera}
            title={t("onboarding:welcomePermission.permCamera")}
            sub={t("onboarding:welcomePermission.permCameraSub")}
          />
          <PermissionRow
            Icon={Video}
            title={t("onboarding:welcomePermission.permMic")}
            sub={t("onboarding:welcomePermission.permMicSub")}
          />
          <PermissionRow
            Icon={MapPin}
            title={t("onboarding:welcomePermission.permLocation")}
            sub={t("onboarding:welcomePermission.permLocationSub")}
          />
        </View>
      </View>

      {/* Footer */}
      <View className="gap-sm" style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 }}>
        <Pressable
          accessibilityRole="button"
          className="h-11 items-center justify-center rounded-md bg-primary active:bg-primary-pressed"
          onPress={onAllow}
        >
          <Text className="text-primary-on font-medium" style={{ fontSize: 14 }}>
            {t("onboarding:welcomePermission.allow")}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          className="h-11 items-center justify-center rounded-md bg-bg-primary border border-line-secondary active:bg-bg-secondary"
          onPress={onNotNow}
        >
          <Text className="text-fg-primary font-medium" style={{ fontSize: 14 }}>
            {t("onboarding:welcomePermission.notNow")}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function PermissionRow({ Icon, title, sub }: { Icon: typeof Camera; title: string; sub: string }) {
  return (
    <View
      className="flex-row items-center gap-md rounded-lg bg-bg-secondary"
      style={{ padding: 12, paddingHorizontal: 14 }}
    >
      <View
        className="rounded-sm items-center justify-center bg-bg-primary"
        style={{ width: 28, height: 28 }}
      >
        <Icon color="#6B6B66" size={16} />
      </View>
      <View className="flex-1">
        <Text className="text-body font-medium text-fg-primary">{title}</Text>
        <Text className="text-caption text-fg-secondary" style={{ marginTop: 1 }}>
          {sub}
        </Text>
      </View>
    </View>
  );
}
