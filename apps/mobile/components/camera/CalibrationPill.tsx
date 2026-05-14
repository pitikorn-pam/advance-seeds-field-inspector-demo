import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import type { CalibrationReading } from "@advance-seeds/types";

interface Props {
  reading: CalibrationReading | null;
}

/**
 * Compact glass-style pill that surfaces calibration state inline with the
 * top bar — used by live mode where space is at a premium and the full
 * banner (precise mode) would be too heavy. Locked state shows a tiny green
 * dot; unavailable shows a muted dot.
 */
export function CalibrationPill({ reading }: Props) {
  const { t } = useTranslation("inspections");
  const locked = reading !== null && reading.source !== "manual" && reading.confidence >= 0.6;
  const label = locked
    ? t("capture.calibration.lockedTitle")
    : t("capture.calibration.unavailableTitle");
  const dotColor = locked ? "#7DD3C7" : "#B6B6B0";

  return (
    <View className="flex-row items-center gap-xs rounded-full bg-glass-soft px-md py-xs">
      <View className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: dotColor }} />
      <Text className="text-white text-caption font-medium">{label}</Text>
    </View>
  );
}
