import type { ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, Zap } from "lucide-react-native";

interface Props {
  /** Left content. Defaults to a back button. */
  left?: ReactNode;
  /** Center pill content (e.g. "Live · Rice — Hom Mali"). */
  center?: ReactNode;
  /** Right content. Defaults to a flash toggle (placeholder; wired in Phase 6). */
  right?: ReactNode;
  /** Optional dot color for the center pill (status indicator). */
  centerDotColor?: string;
  centerLabel?: string;
}

/**
 * Glass-style top bar for camera screens. Translucent black surface with
 * white icons — matches the prototype's `.glass` element. Sits over a live
 * camera preview so it must be self-contained (no token-color dependency
 * other than the brand-on accents).
 */
export function GlassTopBar({ left, center, right, centerDotColor, centerLabel }: Props) {
  const router = useRouter();

  const back = (
    <Pressable
      className="h-9 w-9 items-center justify-center rounded-full bg-black/50"
      onPress={() => router.back()}
    >
      <ArrowLeft color="white" size={18} />
    </Pressable>
  );

  const flash = (
    <Pressable className="h-9 w-9 items-center justify-center rounded-full bg-black/50">
      <Zap color="white" size={18} />
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
