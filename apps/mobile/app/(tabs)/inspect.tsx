import { Redirect } from "expo-router";

/**
 * Inspect tab landing — redirects immediately into the /capture/* fullscreen
 * flow. Using `<Redirect>` instead of `useFocusEffect + router.replace` is
 * atomic at the navigator level: there is no intermediate render of an
 * ActivityIndicator screen, no double-mount of icon-heavy chrome. That fixes
 * the Fabric `addViewAt: failed` race we hit on Android when lucide-react-native
 * SVG roots in the placeholder screen and in /capture/setup raced for the
 * same view IDs during the redirect.
 *
 * Why a redirect tab instead of inlining the setup screen here?
 * The capture flow is fullscreen (no bottom tab bar). Keeping it as a separate
 * Stack at /capture/* lets us render scan / precise over the camera without
 * bottom-tab visual noise. The Inspect tab in the bottom bar still puts
 * "start capture" one tap from anywhere.
 */
export default function InspectTab() {
  return <Redirect href="/capture/setup" />;
}
