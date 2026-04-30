import { Stack } from "expo-router";

/**
 * Nested stack for the notifications modal. The root `/notifications`
 * screen presents this whole stack as a modal (configured in
 * `app/_layout.tsx`); list → detail navigation happens *inside* that
 * modal, so the detail slides in from the right rather than stacking a
 * second modal on top.
 */
export default function NotificationsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    />
  );
}
