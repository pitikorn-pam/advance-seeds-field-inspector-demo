import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Home, Camera, Library, MoreHorizontal } from "lucide-react-native";

export default function TabsLayout() {
  const { t } = useTranslation(["common", "varieties"]);
  const insets = useSafeAreaInsets();

  // Android gesture navigation reports its inset via insets.bottom. Hardcoding
  // paddingBottom would overlap the system nav on Z Flip and other gesture
  // devices; computing from runtime keeps the bar above it everywhere.
  const bottomPadding = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#0F6E56",
        tabBarStyle: {
          height: 56 + bottomPadding,
          paddingTop: 8,
          paddingBottom: bottomPadding,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "500" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("common:nav.home"),
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="camera"
        options={{
          title: t("common:nav.camera"),
          tabBarIcon: ({ color, size }) => <Camera color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: t("varieties:title"),
          tabBarIcon: ({ color, size }) => <Library color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t("common:nav.more"),
          tabBarIcon: ({ color, size }) => <MoreHorizontal color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
