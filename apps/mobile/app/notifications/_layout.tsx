import { Stack } from "expo-router";

/**
 * Nested stack for notifications. The list is opened from More as a
 * normal stack page; list → detail navigation stays inside this group.
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
