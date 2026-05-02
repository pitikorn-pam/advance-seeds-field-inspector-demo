import { Pressable, Text } from "react-native";
import { Video } from "lucide-react-native";
import { glass } from "@advance-seeds/tokens";

const LIVE_RED = "#DC2828";

interface Props {
  /** Tap toggles recording. */
  onPress: () => void;
  /** True while a recording is in progress — flips icon/label/color to a stop affordance. */
  isRecording?: boolean;
  /** Optional EN/TH label override; defaults to "Rec" / "Stop". */
  recordLabel?: string;
  stopLabel?: string;
}

/**
 * Dedicated icon button for video recording, sibling of the snapshot affordance
 * in the camera HUD. ShutterBar's long-press remains the primary entrypoint —
 * this button gives the user a discoverable tap target for the same action.
 */
export function RecordButton({
  onPress,
  isRecording = false,
  recordLabel = "Rec",
  stopLabel = "Stop",
}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isRecording ? "Stop recording" : "Start recording"}
      className="flex-row items-center gap-xs rounded-full bg-glass-chip px-md py-xs"
      onPress={onPress}
    >
      <Video color={isRecording ? LIVE_RED : glass.text} size={14} />
      <Text
        className="font-medium"
        style={{ color: isRecording ? LIVE_RED : glass.text, fontSize: 11 }}
      >
        {isRecording ? stopLabel : recordLabel}
      </Text>
    </Pressable>
  );
}
