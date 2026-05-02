import { useMemo } from "react";
import { Platform, View, Text } from "react-native";
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
// the same Animated.View instance is reused across frames (smoother on iOS
// where Reanimated layout transitions work; harmless on Android where we
// fall back to plain Views).
const GRID = 12;
function identityKey(classId: number | undefined, cx: number, cy: number) {
  const gx = Math.min(GRID - 1, Math.max(0, Math.floor(cx * GRID)));
  const gy = Math.min(GRID - 1, Math.max(0, Math.floor(cy * GRID)));
  return `${classId ?? -1}-${gx}-${gy}`;
}

// Reanimated 4 layout animations on Android Fabric race against
// absolute-positioned children — the boxes silently fail to mount even though
// the underlying detections are correct. iOS has no such issue. Gate the
// animated wrapper on Platform.OS so each platform gets its working subset:
// iOS = spring-interpolated boxes with fade in/out; Android = static boxes
// that snap on each detection update.
const SUPPORTS_LAYOUT_ANIMATION = Platform.OS === "ios";

/**
 * Draws bounding boxes + class labels over the camera preview from the
 * analyzer's live frame output. Coordinates are in frame pixel space; we
 * project them onto the stage box using the simpler "fill" mapping that
 * matches Vision Camera's default `resizeMode='cover'` preview.
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
    const bucketCounts = new Map<string, number>();
    return frameResult.seeds.map((s) => {
      const x = s.bbox.x * scale - dx;
      const y = s.bbox.y * scale - dy;
      const w = s.bbox.width * scale;
      const h = s.bbox.height * scale;
      const className = COCO_NAMES[s.class_id ?? -1] ?? "Item";
      const cx = frameWidth > 0 ? (s.bbox.x + s.bbox.width / 2) / frameWidth : 0;
      const cy = frameHeight > 0 ? (s.bbox.y + s.bbox.height / 2) / frameHeight : 0;
      const bucketKey = identityKey(s.class_id, cx, cy);
      const bucketIndex = bucketCounts.get(bucketKey) ?? 0;
      bucketCounts.set(bucketKey, bucketIndex + 1);
      return {
        ...s,
        projX: x,
        projY: y,
        projW: w,
        projH: h,
        className,
        key: `${bucketKey}-${bucketIndex}`,
      };
    });
  }, [frameResult, frameWidth, frameHeight, stageWidth, stageHeight]);

  if (projected.length === 0) return null;

  return (
    <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
      {projected.map((p) => {
        const color = PALETTE[p.className] ?? "#22C55E";
        const boxStyle = {
          position: "absolute" as const,
          left: p.projX,
          top: p.projY,
          width: p.projW,
          height: p.projH,
          borderColor: color,
          borderWidth: 2,
          borderRadius: 4,
        };
        const label = (
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
        );
        return SUPPORTS_LAYOUT_ANIMATION ? (
          <Animated.View
            key={p.key}
            entering={FadeIn.duration(120)}
            exiting={FadeOut.duration(160)}
            // Springify gives a slight overshoot+settle which feels organic
            // under camera motion — pure linear easing reads as mechanical at
            // 15-30 fps inference. Damping high enough to avoid jiggle on
            // every detection update; mass low enough to track real motion.
            layout={LinearTransition.springify().damping(18).stiffness(160).mass(0.4)}
            style={boxStyle}
          >
            {label}
          </Animated.View>
        ) : (
          <View key={p.key} style={boxStyle}>
            {label}
          </View>
        );
      })}
    </View>
  );
}
