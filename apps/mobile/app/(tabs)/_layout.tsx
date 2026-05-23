import { Tabs, useRouter } from "expo-router";
import { Camera, MoreHorizontal, Sprout } from "lucide-react-native";
import { Pressable, View, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { useModelInstallInspectionGate } from "@/lib/models/inspectionGate";

type TabGlyphKind = "inspect" | "varieties" | "more";

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
      initialRouteName="inspect"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: isDark ? "#8F75FF" : "#6E40E0",
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
          href: null,
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
          // Marquee CTA — render the entire tab cell as a 44x44 solid-purple
          // rounded square with a white camera icon, matching the prototype's
          // Journey 2 bottom-bar treatment. Keeps the tab in the same row as
          // the others (not a floating FAB) but visually announces it as the
          // primary capture entry point.
          tabBarButton: (props) => (
            <Pressable
              accessibilityRole={props.accessibilityRole}
              accessibilityState={props.accessibilityState}
              accessibilityLabel="Inspect"
              onPress={props.onPress}
              onLongPress={props.onLongPress}
              className="flex-1 items-center justify-center gap-[2px]"
            >
              <View
                className="h-[44px] w-[44px] items-center justify-center rounded-[12px] bg-primary"
                style={{
                  shadowColor: "#6E40E0",
                  shadowOpacity: 0.35,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 2 },
                }}
              >
                <Camera color="#FFFFFF" size={22} strokeWidth={2.1} />
              </View>
              <Text className="text-[10.5px] font-semibold text-fg-primary">Inspect</Text>
            </Pressable>
          ),
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
  return <Camera color={color} size={iconSize} strokeWidth={strokeWidth} />;
}
