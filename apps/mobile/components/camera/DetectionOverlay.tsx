import { useMemo } from "react";
import { Platform, View, Text } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import Svg, { Polygon as SvgPolygon } from "react-native-svg";
import type { AnalysisFrameResult } from "@advance-seeds/types";
import { glass } from "@advance-seeds/tokens";
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
  /**
   * Display name of the active variety. When set, every bbox is labeled
   * with this name regardless of the model's internal class id — what
   * the operator selected is what they expect to see on screen.
   */
  varietyName?: string | null;
  /**
   * Active model's class_names. Used as a fallback label when no variety
   * is selected and the model exposes its own class list (e.g. "item").
   */
  modelClassNames?: readonly string[] | null;
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
  varietyName,
  modelClassNames,
}: Props) {
  const projected = useMemo(() => {
    if (!frameResult || frameWidth <= 0 || frameHeight <= 0) return [];
    // Vision Camera's preview view auto-rotates the sensor buffer to match
    // device orientation — when the phone is held portrait, the user sees
    // a portrait-correct preview even though the sensor is landscape.
    // `useLiveDetections` stores bbox + polygon in SENSOR coords (after
    // calling unrotateBbox to map model output back to sensor space), but
    // the visible preview is in POST-ROTATION display space. Projecting
    // sensor coords with sensor dims misaligns by 90° from what the user
    // sees. Honor frameOrientation here: swap dims for the projection
    // scale and rotate each (x,y) from sensor → display space before
    // projecting.
    const orientation = frameResult.frameOrientation ?? "up";
    const isRotated =
      orientation === "left" ||
      orientation === "right" ||
      orientation === "left-mirrored" ||
      orientation === "right-mirrored";
    // Effective frame dims after Vision's rotation (what the preview actually shows).
    const dispW = isRotated ? frameHeight : frameWidth;
    const dispH = isRotated ? frameWidth : frameHeight;
    // Vision Camera default preview is "cover": scale to fill, crop overflow.
    const scale = Math.max(stageWidth / dispW, stageHeight / dispH);
    const dx = (dispW * scale - stageWidth) / 2;
    const dy = (dispH * scale - stageHeight) / 2;
    // Sensor → display-space mapping. `frameOrientation` is the orientation
    // used to unrotate model output back into sensor space, but the iOS
    // preview renders the reciprocal display transform. The measured
    // portrait case reports orientation="left"; applying the reciprocal
    // projection places the sensor-space polygon back over the preview.
    const rotatePt = (sx: number, sy: number): { x: number; y: number } => {
      if (orientation === "left" || orientation === "left-mirrored") {
        return { x: dispW - sy, y: sx };
      }
      if (orientation === "right" || orientation === "right-mirrored") {
        return { x: sy, y: dispH - sx };
      }
      if (orientation === "down" || orientation === "down-mirrored") {
        return { x: dispW - sx, y: dispH - sy };
      }
      return { x: sx, y: sy };
    };
    // For a sensor-space rectangle, return its bounding box in display
    // space after rotation. Rotating a rectangle yields another
    // axis-aligned rectangle in display space (90°/180° preserve
    // axis-alignment), and width/height swap on left/right rotation.
    const rotateRect = (
      sx: number,
      sy: number,
      sw: number,
      sh: number,
    ): { x: number; y: number; w: number; h: number } => {
      const a = rotatePt(sx, sy);
      const c = rotatePt(sx + sw, sy + sh);
      return {
        x: Math.min(a.x, c.x),
        y: Math.min(a.y, c.y),
        w: Math.abs(c.x - a.x),
        h: Math.abs(c.y - a.y),
      };
    };
    const bucketCounts = new Map<string, number>();
    return frameResult.seeds.map((s) => {
      const r = rotateRect(s.bbox.x, s.bbox.y, s.bbox.width, s.bbox.height);
      const x = r.x * scale - dx;
      const y = r.y * scale - dy;
      const w = r.w * scale;
      const h = r.h * scale;
      // Project mask polygon vertices through the same rotation + cover
      // mapping so they align with the bbox on screen.
      const projectedPolygon =
        s.mask && s.mask.polygon.length >= 3
          ? s.mask.polygon.map((p) => {
              const rp = rotatePt(p.x, p.y);
              return { x: rp.x * scale - dx, y: rp.y * scale - dy };
            })
          : null;
      // Label resolution priority:
      //  1. Operator's variety selection — what they chose, what they expect.
      //  2. Active model's class_names[id] — surfaces "item"/"seed" etc when
      //     no variety is bound, useful for diagnosing model behaviour.
      //  3. COCO id → demo class name (Banana/Apple/...) for compatible models.
      //  4. Generic "Item" as last resort.
      const modelClassName =
        modelClassNames && s.class_id !== undefined && s.class_id !== null
          ? (modelClassNames[s.class_id] ?? null)
          : null;
      const className = varietyName ?? modelClassName ?? COCO_NAMES[s.class_id ?? -1] ?? "Item";
      // Normalize to display-space dims for the identity bucket so the
      // grid cells map to where the detection appears on screen, not
      // where it sits in sensor coords.
      const cx = dispW > 0 ? (r.x + r.w / 2) / dispW : 0;
      const cy = dispH > 0 ? (r.y + r.h / 2) / dispH : 0;
      const bucketKey = identityKey(s.class_id, cx, cy);
      const bucketIndex = bucketCounts.get(bucketKey) ?? 0;
      bucketCounts.set(bucketKey, bucketIndex + 1);
      return {
        ...s,
        projX: x,
        projY: y,
        projW: w,
        projH: h,
        projectedPolygon,
        className,
        labelText: liveLabel(className, s.length_mm, s.area_mm2, s.volume_ml),
        key: `${bucketKey}-${bucketIndex}`,
      };
    });
  }, [frameResult, frameWidth, frameHeight, stageWidth, stageHeight]);

  if (projected.length === 0) return null;

  // Render polygons in a single stage-level SVG so vertices can extend
  // beyond their detection's bbox without being clipped by the per-bbox
  // wrapper. The previous nested-inside-bbox layout silently dropped any
  // polygon vertex outside the bbox rect — and seg masks routinely
  // extend slightly past the bbox, especially on irregular shapes.
  const polygonSeeds = projected.filter((p) => p.projectedPolygon !== null);
  return (
    <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
      {polygonSeeds.length > 0 ? (
        // react-native-svg's <Svg> needs width/height as PROPS (not
        // style) — otherwise the inner SVG canvas can default to 0x0
        // and polygons render but are clipped/invisible. Pass viewBox
        // explicitly so vertex coords are in stage pixel space, not
        // the default 100x100 normalized box.
        <Svg
          width={stageWidth}
          height={stageHeight}
          viewBox={`0 0 ${stageWidth} ${stageHeight}`}
          style={{ position: "absolute", left: 0, top: 0 }}
          pointerEvents="none"
        >
          {polygonSeeds.map((p) => {
            const color = PALETTE[p.className] ?? "#7DD3C7";
            const points = p
              .projectedPolygon!.map((pt) => `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`)
              .join(" ");
            return (
              <SvgPolygon
                key={`${p.key}-poly`}
                points={points}
                fill={`${color}33`}
                stroke={color}
                strokeWidth={2}
              />
            );
          })}
        </Svg>
      ) : null}
      {projected.map((p) => {
        const color = PALETTE[p.className] ?? "#7DD3C7";
        const hasPolygon = p.projectedPolygon !== null;
        const boxStyle = {
          position: "absolute" as const,
          left: p.projX,
          top: p.projY,
          width: p.projW,
          height: p.projH,
          // When a polygon is drawn at stage level, the bbox container
          // is positioning-only — no border, no fill. Just carries the
          // label so it sits at the top-left of the detection.
          borderColor: hasPolygon ? "transparent" : color,
          borderWidth: hasPolygon ? 0 : 2,
          borderRadius: hasPolygon ? 0 : 4,
        };
        const label = (
          <View
            style={{
              position: "absolute",
              left: 0,
              top: -18,
              paddingHorizontal: 6,
              paddingVertical: 2,
              backgroundColor: glass.surface,
              borderRadius: 4,
            }}
          >
            <Text style={{ color: glass.text, fontSize: 10, letterSpacing: 0 }} numberOfLines={1}>
              {p.labelText}
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

function liveLabel(className: string, lengthMm: number, areaMm2: number, volumeMl?: number) {
  const parts = [`${className}`, `${Math.round(lengthMm)} mm`];
  if (areaMm2 > 0) parts.push(`${Math.round(areaMm2)} mm²`);
  if (typeof volumeMl === "number" && volumeMl > 0) parts.push(`${volumeMl.toFixed(1)} ml`);
  return parts.join(" · ");
}
