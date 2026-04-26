import { Pressable, View } from "react-native";
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
  /** When true, the shutter shows a "live" green ring (live mode only). */
  isLive?: boolean;
  /** When true, the shutter is disabled (e.g. precise mode without lock). */
  disabled?: boolean;
}

/**
 * Bottom action bar with shutter, side icons, and snapshot. The shutter is the
 * canonical big-circle camera button; `onLongPress` will start video recording
 * once Phase 7b lands. We accept the long-press handler now so the visual
 * affordance is complete and the hook isn't a breaking change later.
 */
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
  const ringClass = isRecording
    ? "border-danger-text"
    : isLive
      ? "border-[#5DCAA5]"
      : "border-white";

  const shutterFillClass = isRecording ? "bg-danger-text" : "bg-white";

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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Capture"
          disabled={disabled}
          delayLongPress={600}
          onPress={onShutter}
          onLongPress={onLongPress}
          className={`h-[78px] w-[78px] items-center justify-center rounded-full border-[3px] ${ringClass} ${
            disabled ? "opacity-40" : ""
          }`}
        >
          <View
            className={`${
              isRecording ? "h-7 w-7 rounded-md" : "h-[64px] w-[64px] rounded-full"
            } ${shutterFillClass}`}
          />
        </Pressable>

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
