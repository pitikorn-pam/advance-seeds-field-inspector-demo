import { Tabs } from "expo-router";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type TabGlyphKind = "home" | "camera" | "library" | "more";

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
          tabBarIcon: ({ color, size }) => <TabGlyph kind="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="camera"
        options={{
          title: t("common:nav.inspect"),
          tabBarIcon: ({ color, size }) => <TabGlyph kind="camera" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: t("varieties:title"),
          tabBarIcon: ({ color, size }) => <TabGlyph kind="library" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t("common:nav.more"),
          tabBarIcon: ({ color, size }) => <TabGlyph kind="more" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

function TabGlyph({ kind, color, size }: { kind: TabGlyphKind; color: string; size: number }) {
  if (kind === "more") {
    return (
      <View
        className="flex-row items-center justify-center gap-[3px]"
        style={{ width: size, height: size }}
      >
        {[0, 1, 2].map((index) => (
          <View
            key={index}
            style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color }}
          />
        ))}
      </View>
    );
  }

  if (kind === "camera") {
    return (
      <View className="items-center justify-center" style={{ width: size, height: size }}>
        <View
          style={{
            width: size * 0.82,
            height: size * 0.58,
            borderWidth: 2,
            borderColor: color,
            borderRadius: 5,
          }}
        >
          <View
            style={{
              position: "absolute",
              top: -5,
              left: size * 0.18,
              width: size * 0.32,
              height: 5,
              borderTopLeftRadius: 4,
              borderTopRightRadius: 4,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              position: "absolute",
              alignSelf: "center",
              top: size * 0.11,
              width: size * 0.22,
              height: size * 0.22,
              borderRadius: size * 0.11,
              backgroundColor: color,
            }}
          />
        </View>
      </View>
    );
  }

  if (kind === "library") {
    return (
      <View className="items-center justify-center gap-[2px]" style={{ width: size, height: size }}>
        {[0, 1, 2].map((index) => (
          <View
            key={index}
            style={{
              width: size * 0.72,
              height: 3,
              borderRadius: 2,
              backgroundColor: color,
              opacity: 1 - index * 0.16,
            }}
          />
        ))}
      </View>
    );
  }

  return (
    <View className="items-center justify-center" style={{ width: size, height: size }}>
      <View
        style={{
          width: size * 0.74,
          height: size * 0.56,
          borderWidth: 2,
          borderColor: color,
          borderRadius: 4,
        }}
      >
        <View
          style={{
            position: "absolute",
            top: -7,
            left: size * 0.13,
            width: size * 0.42,
            height: size * 0.42,
            borderLeftWidth: 2,
            borderTopWidth: 2,
            borderColor: color,
            transform: [{ rotate: "45deg" }],
          }}
        />
      </View>
    </View>
  );
}
