import { Tabs, useRouter } from "expo-router";
import { Camera, Home, MoreHorizontal, Sprout } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { useModelInstallInspectionGate } from "@/lib/models/inspectionGate";

type TabGlyphKind = "home" | "inspect" | "varieties" | "more";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { resolved } = useTheme();
  const router = useRouter();
  const modelInstallGate = useModelInstallInspectionGate();

  // Android gesture navigation reports its inset via insets.bottom. Hardcoding
  // paddingBottom would overlap the system nav on Z Flip and other gesture
  // devices; computing from runtime keeps the bar above it everywhere.
  const bottomPadding = Math.max(insets.bottom, 8);
  const isDark = resolved === "dark";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: isDark ? "#8F75FF" : "#6C47FF",
        tabBarInactiveTintColor: isDark ? "#B6B6B0" : "#5F5F5B",
        tabBarStyle: {
          // In dark mode RN's default TabBar background is solid black, which
          // makes the bar feel detached from the app surface. Match the
          // `bg-bg-secondary` token used by the rest of the chrome instead.
          backgroundColor: isDark ? "#19191D" : "#FFFFFF",
          borderTopColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(23,23,23,0.08)",
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
          title: "Home",
          tabBarIcon: ({ color, size }) => <TabGlyph kind="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="inspect"
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            if (modelInstallGate.showBlockedMessage()) return;
            router.push("/capture/setup");
          },
        }}
        options={{
          title: "Inspect",
          tabBarIcon: ({ color, size }) => <TabGlyph kind="inspect" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="varieties"
        options={{
          title: "Varieties",
          tabBarIcon: ({ color, size }) => <TabGlyph kind="varieties" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color, size }) => <TabGlyph kind="more" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

function TabGlyph({ kind, color, size }: { kind: TabGlyphKind; color: string; size: number }) {
  const iconSize = Math.max(size - 2, 20);
  const strokeWidth = 2.1;

  if (kind === "inspect") return <Camera color={color} size={iconSize} strokeWidth={strokeWidth} />;
  if (kind === "varieties")
    return <Sprout color={color} size={iconSize} strokeWidth={strokeWidth} />;
  if (kind === "more")
    return <MoreHorizontal color={color} size={iconSize} strokeWidth={strokeWidth} />;
  return <Home color={color} size={iconSize} strokeWidth={strokeWidth} />;
}
