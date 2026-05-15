import { useEffect } from "react";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { tokens } from "@advance-seeds/tokens";
import { useTheme } from "@/lib/theme";

/**
 * First-launch splash, ported 1:1 from the prototype PNG: a clean white
 * canvas with the 64px purple AS brand mark vertically centered, the app
 * name beneath it, and "Field Inspector" subline. The proto deliberately
 * drops the progress bar / version caption — the native splash already
 * covers cold-start latency, so the JS splash is a quiet branded card
 * that auto-routes to /welcome after a brief delay.
 *
 * The StartupGate in the root layout reads the onboarded flag and
 * bypasses this on subsequent launches.
 */
export default function Splash() {
  const router = useRouter();

  useEffect(() => {
    const handle = setTimeout(() => {
      router.replace("/welcome");
    }, 1500);
    return () => clearTimeout(handle);
  }, [router]);

  return (
    <SafeAreaView className="flex-1 bg-bg-primary" edges={["top", "bottom"]}>
      <View className="flex-1 items-center justify-center px-2xl">
        <BrandMark />
        <Text
          className="mt-md font-semibold text-fg-primary text-center"
          style={{ fontSize: 22, letterSpacing: -0.4 }}
        >
          Advance Seeds
        </Text>
        <Text className="mt-[2px] text-body text-fg-secondary text-center">Field Inspector</Text>
      </View>
    </SafeAreaView>
  );
}

/**
 * 64px purple square with white "AS" — matches the prototype's BrandMark
 * default size. Inlined here (and in login/welcome) so the mark renders
 * identically without an extra import.
 */
function BrandMark() {
  const { resolved } = useTheme();
  // Brand-tinted soft glow under the purple square — taken from the
  // prototype's "0 4px 12px rgba(110,64,224,0.25)" drop shadow. Source the
  // hex from tokens so dark mode inherits the right shade.
  const glow = pickHex(tokens, ["color", "brand", "primary"], resolved);
  return (
    <View
      className="items-center justify-center rounded-xl bg-primary"
      style={{
        width: 64,
        height: 64,
        shadowColor: glow,
        shadowOpacity: 0.25,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
      }}
    >
      <Text
        className="text-primary-on"
        style={{ fontSize: 24, fontWeight: "700", letterSpacing: -1 }}
      >
        AS
      </Text>
    </View>
  );
}

// Walks the runtime tokens tree to a leaf and returns the theme-correct
// hex. Mirrors the helper in welcome.tsx; kept inline so this screen can
// pull tokens for SVG/shadow colours that NativeWind classes can't reach.
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
      return "transparent";
    }
  }
  if (typeof node === "string") return node;
  if (node && typeof node === "object") {
    const leaf = node as { value?: unknown; darkValue?: unknown };
    const v =
      resolved === "dark" && typeof leaf.darkValue === "string" ? leaf.darkValue : leaf.value;
    if (typeof v === "string") return v;
  }
  return "transparent";
}
