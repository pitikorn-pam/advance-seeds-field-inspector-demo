import { View, Text, Pressable } from "react-native";
import { Square, Pentagon, Circle as CircleIcon, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { Roi, RoiKind } from "@/lib/capture/roi";

interface Props {
  /** Currently active drawing tool. Null = no tool selected; "select" mode. */
  activeTool: RoiKind | null;
  onSelectTool: (tool: RoiKind | null) => void;
  /** Current ROI (if any) — used to enable the Clear button + Close-polygon. */
  roi: Roi | null;
  onClear: () => void;
  /** Closes an in-progress polygon. Disabled until ≥ 3 vertices. */
  onClosePolygon: () => void;
}

/**
 * Floating glass-style picker for ROI tools. Sits above the KPI strip in
 * scan mode. Tapping a tool toggles it active; tapping it again deselects.
 *
 * Visual states:
 *   • inactive  — black 55% surface, white icon
 *   • active    — teal-tinted active tool with white camera glass chrome
 *   • disabled  — opacity 40% (e.g. Clear when no ROI exists)
 *
 * The Close-polygon button only shows when an open polygon with ≥ 3
 * vertices is in progress; it's the affordance for finishing the shape
 * since RN doesn't have a clean "double-tap to close" pattern that
 * doesn't conflict with the per-tap "add vertex" gesture.
 */
export function RoiToolbar({ activeTool, onSelectTool, roi, onClear, onClosePolygon }: Props) {
  const { t } = useTranslation("inspections");

  const polygonInProgress = roi?.kind === "polygon" && !roi.closed && roi.points.length >= 3;

  return (
    <View className="mx-md mb-sm flex-row items-center gap-xs rounded-full bg-glass-soft px-sm py-xs self-center">
      <ToolButton
        renderIcon={() => <Square color={activeTool === "rect" ? "#7DD3C7" : "white"} size={16} />}
        label={t("capture.roi.rect")}
        active={activeTool === "rect"}
        onPress={() => onSelectTool(activeTool === "rect" ? null : "rect")}
      />
      <ToolButton
        renderIcon={() => (
          <Pentagon color={activeTool === "polygon" ? "#7DD3C7" : "white"} size={16} />
        )}
        label={t("capture.roi.polygon")}
        active={activeTool === "polygon"}
        onPress={() => onSelectTool(activeTool === "polygon" ? null : "polygon")}
      />
      <ToolButton
        renderIcon={() => (
          <CircleIcon color={activeTool === "circle" ? "#7DD3C7" : "white"} size={16} />
        )}
        label={t("capture.roi.circle")}
        active={activeTool === "circle"}
        onPress={() => onSelectTool(activeTool === "circle" ? null : "circle")}
      />
      {polygonInProgress ? (
        <ToolButton label={t("capture.roi.closePolygon")} active onPress={onClosePolygon} />
      ) : null}
      {roi ? (
        <ToolButton
          renderIcon={() => <X color="white" size={16} />}
          label={t("capture.roi.clear")}
          onPress={onClear}
        />
      ) : null}
    </View>
  );
}

function ToolButton({
  renderIcon,
  label,
  active = false,
  onPress,
}: {
  renderIcon?: () => React.ReactNode;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className={`flex-row items-center gap-xs rounded-full px-md py-xs ${
        active ? "bg-[#7DD3C7]/25" : ""
      }`}
    >
      {renderIcon ? renderIcon() : null}
      <Text
        className={`font-medium ${active ? "text-[#7DD3C7]" : "text-white"}`}
        style={{ fontSize: 11, letterSpacing: 0.2 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
