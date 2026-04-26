import { View, Text } from "react-native";
import { Check, AlertCircle } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { CalibrationReading } from "@advance-seeds/types";

interface Props {
  reading: CalibrationReading | null;
  /** Optional override for the human distance label (e.g. "28 cm"). */
  distanceLabel?: string;
}

/**
 * Bottom-of-stage banner used by precise mode. Two visual states:
 *
 *   • locked    — green (#0F6E56) surface, check icon, "Calibration locked"
 *                 + "{px/mm} px/mm at {distance}". Mirrors the prototype's
 *                 LiDAR locked banner; we generalize the title since the
 *                 source can be aruco / lidar / manual.
 *   • unavailable — neutral glass surface with an alert icon, hints that
 *                   measurements may be approximate. Default state on test
 *                   hardware (iPhone Air + Z Flip 7 FE — neither has LiDAR).
 *
 * The banner does not gate the shutter; that's a Phase 5 decision once
 * LiveCalibrator is wired. Today it's a passive indicator.
 */
export function CalibrationBanner({ reading, distanceLabel }: Props) {
  const { t } = useTranslation("inspections");

  const locked = reading !== null && reading.confidence >= 0.6;

  if (locked && reading) {
    return (
      <View
        className="flex-row items-center gap-sm rounded-xl px-lg py-md"
        style={{ backgroundColor: "rgba(15, 110, 86, 0.92)" }}
      >
        <Check color="white" size={18} />
        <View className="flex-1">
          <Text className="text-white font-medium" style={{ fontSize: 13 }}>
            {t("capture.calibration.lockedTitle")}
          </Text>
          <Text className="text-white/85" style={{ fontSize: 11 }}>
            {t("capture.calibration.lockedHint", {
              pxPerMm: reading.pxPerMm.toFixed(1),
              distance: distanceLabel ?? "—",
            })}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-row items-center gap-sm rounded-xl bg-black/[0.62] px-lg py-md">
      <AlertCircle color="white" size={18} />
      <View className="flex-1">
        <Text className="text-white font-medium" style={{ fontSize: 13 }}>
          {t("capture.calibration.unavailableTitle")}
        </Text>
        <Text className="text-white/70" style={{ fontSize: 11 }}>
          {t("capture.calibration.unavailableHint")}
        </Text>
      </View>
    </View>
  );
}
