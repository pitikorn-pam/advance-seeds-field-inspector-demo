import type { ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, Zap, ZapOff } from "lucide-react-native";

export type FlashMode = "off" | "on" | "auto";

interface Props {
  /** Left content. Defaults to a back button. */
  left?: ReactNode;
  /** Center pill content. */
  center?: ReactNode;
  /** Right content. Defaults to a flash toggle when `flashMode` is provided,
   *  otherwise a no-op flash icon for visual completeness. */
  right?: ReactNode;
  /** Optional dot color for the center pill (status indicator). */
  centerDotColor?: string;
  centerLabel?: string;
  /** Flash state for the default right slot. */
  flashMode?: FlashMode;
  /** Tap handler for the default flash button. */
  onFlashPress?: () => void;
  /** Lets camera routes stop native preview before leaving the screen. */
  onBackPress?: () => void;
}

/**
 * Glass-style top bar for camera screens. Translucent black surface with
 * white icons — matches the prototype's `.glass` element. Sits over a live
 * camera preview so it must be self-contained (no token-color dependency
 * other than the brand-on accents).
 *
 * The right slot defaults to a flash button. Pass `flashMode` + `onFlashPress`
 * to make it interactive (the icon swaps Zap ↔ ZapOff). Pass a custom
 * `right` node to override entirely.
 */
export function GlassTopBar({
  left,
  center,
  right,
  centerDotColor,
  centerLabel,
  flashMode,
  onFlashPress,
  onBackPress,
}: Props) {
  const router = useRouter();

  const back = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      className="h-9 w-9 items-center justify-center rounded-full bg-black/50"
      onPress={onBackPress ?? (() => router.back())}
    >
      <ArrowLeft color="white" size={18} />
    </Pressable>
  );

  // Active state gets a tinted background + brighter icon so a tap is
  // unambiguously "something happened" — a 1 px icon swap on a glass surface
  // reads as a no-op even when state is updating correctly.
  const flashActive = flashMode === "on" || flashMode === "auto";
  const flashLabel = flashMode === "on" ? "ON" : flashMode === "auto" ? "AUTO" : null;
  const flash = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Toggle flash"
      style={{
        backgroundColor: flashActive ? "rgba(255, 214, 107, 0.85)" : "rgba(0, 0, 0, 0.5)",
      }}
      className={`h-9 items-center justify-center rounded-full flex-row gap-[3px] ${
        flashLabel ? "px-md" : "w-9"
      }`}
      onPress={onFlashPress}
      // When no handler is wired, render but disable so the icon still
      // reads — keeps the layout balanced on screens that haven't opted in.
      disabled={!onFlashPress}
    >
      {flashActive ? (
        <Zap color="#1A1A1A" size={16} fill="#1A1A1A" />
      ) : (
        <ZapOff color="white" size={18} />
      )}
      {flashLabel ? (
        <Text style={{ color: "#1A1A1A", fontSize: 10, fontWeight: "600", letterSpacing: 0.4 }}>
          {flashLabel}
        </Text>
      ) : null}
    </Pressable>
  );

  return (
    <View className="flex-row items-center gap-sm px-md pt-md pb-sm" pointerEvents="box-none">
      {left ?? back}
      <View className="flex-1 items-center justify-center" pointerEvents="box-none">
        {center ?? (centerLabel ? defaultPill(centerLabel, centerDotColor) : null)}
      </View>
      {right ?? flash}
    </View>
  );
}

function defaultPill(label: string, dotColor?: string) {
  return (
    <View className="flex-row items-center gap-xs rounded-full bg-black/55 px-md py-xs">
      {dotColor ? (
        <View className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: dotColor }} />
      ) : null}
      <Text className="text-white text-caption font-medium">{label}</Text>
    </View>
  );
}
