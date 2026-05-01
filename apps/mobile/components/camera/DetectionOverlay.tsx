import { useMemo } from "react";
import { View, Text } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
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

// Coarse-grained spatial bucket for cross-frame identity. The model output
// has no track id, so we approximate one by hashing (class, grid cell) — a
// detection that drifts within ~10% of the stage maps to the same key, so
// Reanimated treats it as the same view and animates left/top/width/height
// transitions instead of re-mounting. Empirically smooth for slow camera
// motion; fast pans still snap (correct behaviour — we don't lie to users).
const GRID = 12;
function identityKey(classId: number | undefined, cx: number, cy: number) {
  const gx = Math.min(GRID - 1, Math.max(0, Math.floor(cx * GRID)));
  const gy = Math.min(GRID - 1, Math.max(0, Math.floor(cy * GRID)));
  return `${classId ?? -1}-${gx}-${gy}`;
}

/**
 * Draws bounding boxes + class labels over the camera preview from the
 * analyzer's live frame output. Coordinates are in frame pixel space; we
 * project them onto the stage box using the simpler "fill" mapping that
 * matches Vision Camera's default `resizeMode='cover'` preview.
 *
 * Box positions are animated via Reanimated `LinearTransition` so detections
 * appear to track motion at native display refresh, even though inference
 * runs at ~15-30 Hz on Android. Entry/exit fades soften appearance/dropout.
 *
 * Pure presentational — no analyzer or worklet code here.
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
      const cx = frameWidth > 0 ? (s.bbox.x + s.bbox.width / 2) / frameWidth : 0;
      const cy = frameHeight > 0 ? (s.bbox.y + s.bbox.height / 2) / frameHeight : 0;
      return {
        ...s,
        projX: x,
        projY: y,
        projW: w,
        projH: h,
        className,
        key: identityKey(s.class_id, cx, cy),
      };
    });
  }, [frameResult, frameWidth, frameHeight, stageWidth, stageHeight]);

  if (projected.length === 0) return null;

  return (
    <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
      {projected.map((p) => {
        const color = PALETTE[p.className] ?? "#22C55E";
        return (
          <Animated.View
            key={p.key}
            entering={FadeIn.duration(120)}
            exiting={FadeOut.duration(160)}
            layout={LinearTransition.duration(120)}
            style={{
              position: "absolute",
              left: p.projX,
              top: p.projY,
              width: p.projW,
              height: p.projH,
              borderColor: color,
              borderWidth: 2,
              borderRadius: 4,
            }}
          >
            <View
              style={{
                position: "absolute",
                left: 0,
                top: -18,
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
          </Animated.View>
        );
      })}
    </View>
  );
}
