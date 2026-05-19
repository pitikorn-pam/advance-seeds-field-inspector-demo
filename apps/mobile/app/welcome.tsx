import { ScrollView, View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { ScanLine, Zap, Cloud, Layers } from "lucide-react-native";
import { tokens } from "@advance-seeds/tokens";
import { useTheme } from "@/lib/theme";
import { setOnboarded } from "@/lib/onboarding";

/**
 * Welcome / onboarding pitch — port of the prototype `WelcomeScreen`.
 *
 * Layout literally mirrors `auth.jsx > WelcomeScreen`:
 *   1. AS brand mark
 *   2. Hero title with the last line tinted brand purple
 *   3. Body paragraph
 *   4. Four capability rows: tinted 40×40 icon square + title + subtitle
 *   5. Footer with full-width primary CTA + "Skip for now" ghost link
 *
 * Continue still fires the camera/mic permission prompt (Vision Camera
 * shows the system dialog) and marks the persistent onboarded flag.
 * Skip proceeds without prompting; capture screens re-ask on demand.
 */
export default function Welcome() {
  const { t } = useTranslation(["common", "onboarding"]);
  const router = useRouter();
  const { resolved } = useTheme();

  // Persisting the onboarded flag is fire-and-forget. Awaiting AsyncStorage
  // before pushing the route adds a perceptible 200-400 ms hitch on the
  // press, which reads as a stuck button. The flag only matters at the
  // next cold launch, so the I/O can race with the navigation.
  const onContinue = () => {
    void setOnboarded();
    // The permission-gate screen is always part of the onboarding journey
    // per the prototype — iOS retains a prior "granted" state across
    // reinstalls so we can't drive this off `getCameraPermissionStatus`.
    // The screen itself reads the status and short-circuits the system
    // prompt when permission is already granted.
    router.push("/welcome-permission");
  };

  const onSkip = () => {
    void setOnboarded();
    router.replace("/login");
  };

  const caps = capabilityRows(resolved);

  return (
    <SafeAreaView className="flex-1 bg-bg-primary" edges={["top", "bottom"]}>
      <ScrollView contentContainerClassName="pb-xl">
        {/* Header block — brand mark + hero copy */}
        <View className="px-2xl pt-3xl">
          <BrandMark resolved={resolved} />
          <Text
            className="mt-xl font-medium text-fg-primary"
            style={{ fontSize: 26, lineHeight: 32, letterSpacing: -0.5 }}
          >
            {t("onboarding:welcome.titleLine1")}
            {"\n"}
            {t("onboarding:welcome.titleLine2")}
            {"\n"}
            <Text className="text-primary">{t("onboarding:welcome.titleAccent")}</Text>
          </Text>
          <Text className="mt-md text-body text-fg-secondary">{t("onboarding:welcome.body")}</Text>
        </View>

        {/* Capability list */}
        <View className="px-2xl pt-xl gap-md">
          {caps.map((c) => (
            <View key={c.key} className="flex-row gap-md items-start">
              <View
                className="rounded-md items-center justify-center"
                style={{ width: 40, height: 40, backgroundColor: c.tint }}
              >
                <c.Icon color={c.iconColor} size={20} />
              </View>
              <View className="flex-1 pt-[1px]">
                <Text className="text-title font-medium text-fg-primary">
                  {t(`onboarding:welcome.${c.titleKey}`)}
                </Text>
                <Text className="mt-[2px] text-caption text-fg-secondary">
                  {t(`onboarding:welcome.${c.bodyKey}`)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* CTA footer */}
      <View className="px-2xl pb-xl pt-md gap-sm border-t border-line-tertiary bg-bg-primary">
        <Pressable
          accessibilityRole="button"
          className="h-11 items-center justify-center rounded-md bg-primary active:bg-primary-pressed"
          onPress={onContinue}
        >
          <Text className="text-primary-on font-medium" style={{ fontSize: 14 }}>
            {t("onboarding:welcome.continue")}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          className="h-10 items-center justify-center"
          onPress={onSkip}
        >
          <Text className="text-fg-secondary" style={{ fontSize: 13 }}>
            {t("onboarding:welcome.skip")}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// `transparent` is RN's named colour string, so it's not a hex literal but
// still gives us a safe fallback when a token path fails to resolve.
const TRANSPARENT = "transparent";

/**
 * Square purple brand mark with white "AS" inside. The prototype builds this
 * inline; we keep it inline here too so welcome.tsx and login.tsx render
 * identical marks without an extra primitive file.
 */
function BrandMark({ resolved }: { resolved: "light" | "dark" }) {
  const primary = pickHex(tokens, ["color", "brand", "primary"], resolved);
  const onPrimary = pickHex(tokens, ["color", "text", "onDark"], resolved);
  return (
    <View
      className="rounded-lg items-center justify-center"
      style={{ width: 44, height: 44, backgroundColor: primary }}
    >
      <Text style={{ color: onPrimary, fontWeight: "700", fontSize: 17, letterSpacing: -0.5 }}>
        AS
      </Text>
    </View>
  );
}

/**
 * Four capability rows from the prototype, with token-derived tint + icon
 * colors so the screen flips cleanly between light and dark themes.
 */
function capabilityRows(resolved: "light" | "dark") {
  return [
    {
      key: "scan",
      Icon: ScanLine,
      tint: pickHex(tokens, ["color", "cardTint", "lavender"], resolved),
      iconColor: pickHex(tokens, ["color", "brand", "primaryDeep"], resolved),
      titleKey: "cardCameraTitle",
      bodyKey: "cardCameraBody",
    },
    {
      key: "zap",
      Icon: Zap,
      tint: pickHex(tokens, ["color", "cardTint", "peach"], resolved),
      iconColor: pickHex(tokens, ["color", "brand", "orange"], resolved),
      titleKey: "cardTargetTitle",
      bodyKey: "cardTargetBody",
    },
    {
      key: "cloud",
      Icon: Cloud,
      tint: pickHex(tokens, ["color", "cardTint", "sky"], resolved),
      iconColor: pickHex(tokens, ["color", "semantic", "info", "text"], resolved),
      titleKey: "cardSyncTitle",
      bodyKey: "cardSyncBody",
    },
    {
      key: "layers",
      Icon: Layers,
      tint: pickHex(tokens, ["color", "cardTint", "mint"], resolved),
      iconColor: pickHex(tokens, ["color", "grade", "a", "ink"], resolved),
      titleKey: "cardWorkspaceTitle",
      bodyKey: "cardWorkspaceBody",
    },
  ] as const;
}

/**
 * Walks the runtime tokens tree to a leaf and returns the theme-correct hex.
 * Leaves are shaped either as `{value, darkValue}` (themed) or as a bare
 * string under keys like `ink`/`bg` (grade scale). We accept both shapes so
 * the same helper covers brand, cardTint, semantic, and grade lookups.
 */
function pickHex(
  source: Record<string, unknown>,
  path: readonly string[],
  resolved: "light" | "dark",
): string {
  let node: unknown = source;
  for (const seg of path) {
    if (node && typeof node === "object" && seg in (node as object)) {
      node = (node as Record<string, unknown>)[seg];
    } else {
      return TRANSPARENT;
    }
  }
  if (typeof node === "string") return node;
  if (node && typeof node === "object") {
    const leaf = node as { value?: unknown; darkValue?: unknown };
    const v =
      resolved === "dark" && typeof leaf.darkValue === "string" ? leaf.darkValue : leaf.value;
    if (typeof v === "string") return v;
  }
  return TRANSPARENT;
}
