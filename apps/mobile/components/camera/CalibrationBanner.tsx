import { View, Text } from "react-native";
import { Check, AlertCircle } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { CalibrationReading } from "@advance-seeds/types";

interface Props {
  reading: CalibrationReading | null;
  /** Calibration profile name when source is manual (e.g. "Lab tray 5cm marker"). */
  profileName?: string | null;
  /** Optional distance label populated by LiDAR / ArUco (e.g. "28 cm"). */
  distanceLabel?: string | null;
}

/**
 * Bottom-of-stage banner used by precise mode. Two visual states:
 *
 *   • locked    — teal glass surface with a check icon. Title:
 *                 "Calibration locked". Hint:
 *                   "{px/mm} px/mm · {profileName}"  (manual source)
 *                   "{px/mm} px/mm at {distance}"     (lidar / aruco)
 *                   "{px/mm} px/mm"                    (no extra info)
 *   • unavailable — neutral glass surface with an alert icon, hints that
 *                   measurements may be approximate. Shown when no
 *                   calibration profile is selected on the session and
 *                   no automatic source is producing readings.
 *
 * The banner is passive — it doesn't gate the shutter. Phase 5's full
 * implementation (with ArUco confidence < 0.6 fallback to manual) will
 * keep that behavior; even an "unavailable" state stays non-blocking.
 */
export function CalibrationBanner({ reading, profileName, distanceLabel }: Props) {
  const { t } = useTranslation("inspections");

  const locked = reading !== null && reading.source !== "manual" && reading.confidence >= 0.6;

  if (locked && reading) {
    const hint = formatHint(t, reading.pxPerMm, profileName, distanceLabel);
    return (
      <View
        className="flex-row items-center gap-sm rounded-lg px-lg py-md"
        style={{ backgroundColor: "rgba(17, 167, 139, 0.92)" }}
      >
        <Check color="white" size={18} />
        <View className="flex-1">
          <Text className="text-white font-medium" style={{ fontSize: 13 }}>
            {t("capture.calibration.lockedTitle")}
          </Text>
          <Text className="text-white/85" style={{ fontSize: 11 }}>
            {hint}
          </Text>
        </View>
      </View>
    );
  }

  const fallbackHint = reading
    ? formatHint(t, reading.pxPerMm, profileName, distanceLabel)
    : t("capture.calibration.unavailableHint");

  return (
    <View className="flex-row items-center gap-sm rounded-lg bg-glass-surface px-lg py-md">
      <AlertCircle color="white" size={18} />
      <View className="flex-1">
        <Text className="text-white font-medium" style={{ fontSize: 13 }}>
          {t("capture.calibration.unavailableTitle")}
        </Text>
        <Text className="text-white/70" style={{ fontSize: 11 }}>
          {fallbackHint}
        </Text>
      </View>
    </View>
  );
}

function formatHint(
  t: (key: string, opts?: Record<string, unknown>) => string,
  pxPerMm: number,
  profileName?: string | null,
  distanceLabel?: string | null,
): string {
  const px = pxPerMm.toFixed(1);
  if (distanceLabel) {
    return t("capture.calibration.lockedHintWithDistance", {
      pxPerMm: px,
      distance: distanceLabel,
    });
  }
  if (profileName) {
    return t("capture.calibration.lockedHintWithProfile", {
      pxPerMm: px,
      profile: profileName,
    });
  }
  return t("capture.calibration.lockedHintBare", { pxPerMm: px });
}
