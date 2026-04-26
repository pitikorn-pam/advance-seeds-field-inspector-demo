import { useRef } from "react";
import { Animated, Pressable, View } from "react-native";
import type { GestureResponderEvent } from "react-native";
import { Grid3x3, RotateCw, Camera as CameraIcon, Aperture } from "lucide-react-native";

interface Props {
  /** Tap fires the shutter. */
  onShutter: () => void;
  /** Long-press starts video recording (Phase 7b wires this). */
  onLongPress?: (e: GestureResponderEvent) => void;
  /** Tap fires a snapshot — saves a frame to Photos without ending live (Phase 7b). */
  onSnapshot?: () => void;
  /** Tap toggles grid overlay (placeholder for Phase 6). */
  onGrid?: () => void;
  /** Tap flips between back/front camera (Phase 6). */
  onFlip?: () => void;
  /** When true, the shutter renders as a recording state. */
  isRecording?: boolean;
  /** When true, the shutter shows a "live" red ring (live mode). */
  isLive?: boolean;
  /** When true, the shutter is disabled (e.g. precise mode without lock). */
  disabled?: boolean;
}

/**
 * Bottom action bar with shutter, side icons, and snapshot. The shutter is
 * the canonical big-circle camera button; `onLongPress` will start video
 * recording once Phase 7b lands.
 *
 * Visual states (matches prototype `.cam-shutter` family):
 *   • default   — white ring + white inner (reads against a dark camera feed)
 *   • live      — red (#DC2828) ring + red inner (analyzer is producing frames)
 *   • recording — red ring + red square inner (Phase 7b)
 *
 * Tap triggers a quick scale-down + spring-back animation so users get a
 * tactile confirmation even before the photo finishes.
 */
const LIVE_RED = "#DC2828";

export function ShutterBar({
  onShutter,
  onLongPress,
  onSnapshot,
  onGrid,
  onFlip,
  isRecording = false,
  isLive = false,
  disabled = false,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const ringClass = isRecording || isLive ? "" : "border-white";
  const ringStyle = isRecording || isLive ? { borderColor: LIVE_RED } : undefined;

  const innerClass = isRecording ? `h-7 w-7 rounded-md` : `h-[64px] w-[64px] rounded-full`;
  const innerStyle = isRecording || isLive ? { backgroundColor: LIVE_RED } : undefined;
  const innerColor = isRecording || isLive ? "" : "bg-white";

  const animatePress = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      friction: 6,
      tension: 180,
    }).start();
  };

  const handlePress = () => {
    if (disabled) return;
    onShutter();
  };

  return (
    <View
      className="flex-row items-center justify-between px-2xl pb-2xl pt-md"
      pointerEvents="box-none"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Toggle grid"
        className="h-12 w-12 items-center justify-center rounded-full bg-black/40"
        onPress={onGrid}
      >
        <Grid3x3 color="white" size={20} />
      </Pressable>

      <View className="items-center gap-sm">
        <Animated.View style={{ transform: [{ scale }] }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Capture"
            disabled={disabled}
            delayLongPress={600}
            onPressIn={() => animatePress(0.92)}
            onPressOut={() => animatePress(1)}
            onPress={handlePress}
            onLongPress={onLongPress}
            style={ringStyle}
            className={`h-[78px] w-[78px] items-center justify-center rounded-full border-[3px] ${ringClass} ${
              disabled ? "opacity-40" : ""
            }`}
          >
            <View className={`${innerClass} ${innerColor}`} style={innerStyle} />
          </Pressable>
        </Animated.View>

        {onSnapshot ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Snapshot"
            className="flex-row items-center gap-xs rounded-full bg-black/40 px-md py-xs"
            onPress={onSnapshot}
          >
            <Aperture color="white" size={14} />
          </Pressable>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Flip camera"
        className="h-12 w-12 items-center justify-center rounded-full bg-black/40"
        onPress={onFlip}
      >
        <RotateCw color="white" size={20} />
      </Pressable>
    </View>
  );
}

// Re-export CameraIcon from lucide so call sites can use it for placeholder buttons
// without re-importing — pattern matches the existing State/Pill components.
export { CameraIcon };
