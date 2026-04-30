import { useCallback } from "react";
import { View, ActivityIndicator } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

/**
 * Inspect tab landing — pushes immediately into the /capture/* fullscreen flow.
 *
 * Why a redirect tab instead of inlining the setup screen here?
 * The capture flow is fullscreen (no bottom tab bar). Keeping it as a separate
 * Stack at /capture/* lets us render scan / precise over the camera without
 * bottom-tab visual noise. The Inspect tab in the bottom bar still puts
 * "start capture" one tap from anywhere.
 *
 * `useFocusEffect` (not `useEffect`) ensures the redirect runs every time
 * the tab is focused, including on return from a deeper screen.
 */
export default function InspectTab() {
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      router.replace("/capture/setup");
    }, [router]),
  );

  return (
    <View className="flex-1 items-center justify-center bg-bg-secondary">
      <ActivityIndicator />
    </View>
  );
}
