import { Stack } from "expo-router";

/**
 * Capture flow stack — fullscreen, no header. The (tabs) layout's "Capture"
 * tab pushes into /capture/setup, which then routes to scan / precise /
 * processing / review.
 */
export default function CaptureLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        contentStyle: { backgroundColor: "#000000" },
      }}
    />
  );
}
