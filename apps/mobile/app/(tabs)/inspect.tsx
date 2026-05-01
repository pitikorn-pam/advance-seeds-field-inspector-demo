import { Redirect } from "expo-router";

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
  return <Redirect href="/capture/setup" />;
}
