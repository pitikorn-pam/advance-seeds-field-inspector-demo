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
}: Props) {
  const router = useRouter();

  const back = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      className="h-9 w-9 items-center justify-center rounded-full bg-black/50"
      onPress={() => router.back()}
    >
      <ArrowLeft color="white" size={18} />
    </Pressable>
  );

  const flash = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Toggle flash"
      className="h-9 w-9 items-center justify-center rounded-full bg-black/50"
      onPress={onFlashPress}
      // When no handler is wired, render but disable so the icon still
      // reads — keeps the layout balanced on screens that haven't opted in.
      disabled={!onFlashPress}
    >
      {flashMode === "on" || flashMode === "auto" ? (
        <Zap color={flashMode === "auto" ? "#5DCAA5" : "#FFD66B"} size={18} />
      ) : (
        <ZapOff color="white" size={18} />
      )}
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
