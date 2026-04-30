import { useMemo } from "react";
import { View, Text } from "react-native";
import Svg, { G, Rect } from "react-native-svg";
import type { AnalysisFrameResult } from "@advance-seeds/types";
import { DEFAULT_CAPTURE_CLASSES } from "@/lib/analyzer/captureClasses";

interface Props {
  /** Latest per-frame analyzer output. Null hides the overlay. */
  frameResult: AnalysisFrameResult | null;
  /** Native frame dims (vision-camera reports them on the worklet). */
  frameWidth: number;
  frameHeight: number;
  /** Stage dims — the visible area of the camera preview the overlay covers. */
  stageWidth: number;
  stageHeight: number;
}

const PALETTE: Record<string, string> = {
  Banana: "#F2B705",
  Apple: "#DC2828",
  Orange: "#F77B23",
  Broccoli: "#4FA85F",
  Carrot: "#E36523",
};

const COCO_NAMES: Record<number, string> = Object.fromEntries(
  DEFAULT_CAPTURE_CLASSES.map((c) => [c.cocoClassId, c.name]),
);

/**
 * Draws bounding boxes + class labels over the camera preview from the
 * analyzer's live frame output. Coordinates are in frame pixel space; we
 * project them onto the stage box using the simpler "fill" mapping that
 * matches Vision Camera's default `resizeMode='cover'` preview.
 *
 * Pure presentational — no analyzer or worklet code here. Owns nothing
 * but the SVG render.
 */
export function DetectionOverlay({
  frameResult,
  frameWidth,
  frameHeight,
  stageWidth,
  stageHeight,
}: Props) {
  const projected = useMemo(() => {
    if (!frameResult || frameWidth <= 0 || frameHeight <= 0) return [];
    // Vision Camera default preview is "cover": scale to fill, crop overflow.
    const scale = Math.max(stageWidth / frameWidth, stageHeight / frameHeight);
    const dx = (frameWidth * scale - stageWidth) / 2;
    const dy = (frameHeight * scale - stageHeight) / 2;
    return frameResult.seeds.map((s) => {
      const x = s.bbox.x * scale - dx;
      const y = s.bbox.y * scale - dy;
      const w = s.bbox.width * scale;
      const h = s.bbox.height * scale;
      const className = COCO_NAMES[s.class_id ?? -1] ?? "Item";
      return { ...s, projX: x, projY: y, projW: w, projH: h, className };
    });
  }, [frameResult, frameWidth, frameHeight, stageWidth, stageHeight]);

  if (projected.length === 0) return null;

  return (
    <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
      <Svg width={stageWidth} height={stageHeight}>
        <G>
          {projected.map((p) => {
            const stroke = PALETTE[p.className] ?? "#22C55E";
            return (
              <Rect
                key={p.index}
                x={p.projX}
                y={p.projY}
                width={p.projW}
                height={p.projH}
                fill="transparent"
                stroke={stroke}
                strokeWidth={2}
                rx={4}
              />
            );
          })}
        </G>
      </Svg>
      {projected.map((p) => (
        <View
          key={`label-${p.index}`}
          style={{
            position: "absolute",
            left: Math.max(0, p.projX),
            top: Math.max(0, p.projY - 18),
            paddingHorizontal: 6,
            paddingVertical: 2,
            backgroundColor: "rgba(0,0,0,0.62)",
            borderRadius: 4,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 10, letterSpacing: 0.2 }}>
            {p.className} · {Math.round(p.length_mm)} mm
          </Text>
        </View>
      ))}
    </View>
  );
}
