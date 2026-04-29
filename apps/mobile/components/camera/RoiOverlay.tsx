import { useRef, useState } from "react";
import { View } from "react-native";
import type { GestureResponderEvent, LayoutChangeEvent } from "react-native";
import Svg, { Rect, Polygon, Circle as SvgCircle, Polyline } from "react-native-svg";
import type { Roi, RoiKind } from "@/lib/capture/roi";

interface Props {
  /** Selected drawing tool (null = no editing — overlay is purely visual). */
  drawingTool: RoiKind | null;
  /** The ROI being drawn or already drawn. */
  roi: Roi | null;
  /** Called when the user updates / commits the ROI. */
  onRoi: (roi: Roi | null) => void;
}

const STROKE = "#5DCAA5";
const FILL = "rgba(93, 202, 165, 0.18)";
const STROKE_WIDTH = 2;

/**
 * SVG layer over the camera preview that handles ROI drawing gestures and
 * renders the active shape.
 *
 * Gesture conventions per kind:
 *   • rect    — touch-down sets first corner; drag sets the opposite corner;
 *               release commits.
 *   • circle  — touch-down sets the center; drag sets the radius (in
 *               normalized screen coords); release commits.
 *   • polygon — each tap appends a vertex. The toolbar's Close button
 *               (visible once 3+ vertices exist) finalizes the shape.
 *
 * Touches are only captured when `drawingTool != null`; otherwise the
 * overlay is `pointerEvents: box-none` so taps fall through to the
 * shutter / KPI strip behind it.
 *
 * Coordinates are normalized to layout width/height (RoiRect/RoiPolygon)
 * or to min(width, height) for circle radius — see lib/capture/roi.ts.
 */
export function RoiOverlay({ drawingTool, roi, onRoi }: Props) {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  // Live drag state — separate from the committed roi so the user sees the
  // shape grow during a drag without committing on every move.
  const [draft, setDraft] = useState<Roi | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const onLayoutChange = (e: LayoutChangeEvent) => {
    setLayout({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });
  };

  const norm = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    return {
      x: layout.width > 0 ? Math.max(0, Math.min(1, locationX / layout.width)) : 0,
      y: layout.height > 0 ? Math.max(0, Math.min(1, locationY / layout.height)) : 0,
    };
  };

  const handleStart = (e: GestureResponderEvent): boolean => {
    if (!drawingTool || layout.width === 0) return false;
    const p = norm(e);
    dragStartRef.current = p;
    if (drawingTool === "rect") {
      setDraft({ kind: "rect", x: p.x, y: p.y, w: 0, h: 0 });
    } else if (drawingTool === "circle") {
      setDraft({ kind: "circle", cx: p.x, cy: p.y, r: 0 });
    } else if (drawingTool === "polygon") {
      // Each tap appends a vertex. If a closed polygon already exists, this
      // tap starts a new one (the user can clear via the toolbar).
      const existingOpen = roi?.kind === "polygon" && !roi.closed ? roi : null;
      const next = existingOpen ? [...existingOpen.points, p] : [p];
      onRoi({ kind: "polygon", points: next, closed: false });
    }
    return true;
  };

  const handleMove = (e: GestureResponderEvent) => {
    const start = dragStartRef.current;
    if (!start || !drawingTool) return;
    const p = norm(e);
    if (drawingTool === "rect") {
      setDraft({
        kind: "rect",
        x: Math.min(start.x, p.x),
        y: Math.min(start.y, p.y),
        w: Math.abs(p.x - start.x),
        h: Math.abs(p.y - start.y),
      });
    } else if (drawingTool === "circle") {
      // Convert dx, dy into the same units as r (min-dim normalized) so the
      // shape stays a true circle on portrait viewports.
      const minDim = Math.min(layout.width, layout.height);
      const dxPx = (p.x - start.x) * layout.width;
      const dyPx = (p.y - start.y) * layout.height;
      const r = Math.hypot(dxPx, dyPx) / minDim;
      setDraft({ kind: "circle", cx: start.x, cy: start.y, r });
    }
  };

  const handleEnd = () => {
    if (draft) {
      onRoi(draft);
      setDraft(null);
    }
    dragStartRef.current = null;
  };

  const visible = draft ?? roi;
  const showHandles = !drawingTool && !!roi && !draft;

  return (
    <View
      onLayout={onLayoutChange}
      onStartShouldSetResponder={handleStart}
      onMoveShouldSetResponder={() => !!drawingTool}
      onResponderMove={handleMove}
      onResponderRelease={handleEnd}
      onResponderTerminate={handleEnd}
      pointerEvents={drawingTool || showHandles ? "auto" : "box-none"}
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
    >
      {layout.width > 0 && visible ? (
        <Svg
          width="100%"
          height="100%"
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          pointerEvents="none"
        >
          {renderShape(visible, layout.width, layout.height)}
        </Svg>
      ) : null}
      {showHandles && roi ? <RoiHandles roi={roi} layout={layout} onUpdate={onRoi} /> : null}
    </View>
  );
}

interface RoiHandlesProps {
  roi: Roi;
  layout: { width: number; height: number };
  onUpdate: (roi: Roi) => void;
}

function RoiHandles({ roi, layout, onUpdate }: RoiHandlesProps) {
  switch (roi.kind) {
    case "rect":
      return <RectHandles roi={roi} layout={layout} onUpdate={onUpdate} />;
    case "polygon":
      return roi.closed ? <PolygonHandles roi={roi} layout={layout} onUpdate={onUpdate} /> : null;
    case "circle":
      return <CircleHandles roi={roi} layout={layout} onUpdate={onUpdate} />;
  }
}

interface RectHandlesProps {
  roi: Extract<Roi, { kind: "rect" }>;
  layout: { width: number; height: number };
  onUpdate: (roi: Roi) => void;
}

/**
 * Four corner-drag handles for a committed rectangle ROI. Each handle is
 * a 32 px touch zone (large enough for fingertips) with a 14 px visible
 * dot inside. Dragging a corner moves only that corner — the opposite
 * corner is anchored — and we re-normalize on each move so x/y stay
 * non-negative and w/h positive even if the user crosses the anchor.
 */
function RectHandles({ roi, layout, onUpdate }: RectHandlesProps) {
  const corners: Array<"tl" | "tr" | "bl" | "br"> = ["tl", "tr", "bl", "br"];
  return (
    <>
      {corners.map((corner) => {
        const cx = (corner === "tl" || corner === "bl" ? roi.x : roi.x + roi.w) * layout.width;
        const cy = (corner === "tl" || corner === "tr" ? roi.y : roi.y + roi.h) * layout.height;
        return (
          <HandleDot
            key={corner}
            x={cx}
            y={cy}
            onMove={(dxPx, dyPx) => {
              const dx = dxPx / layout.width;
              const dy = dyPx / layout.height;
              onUpdate(updateRectCorner(roi, corner, dx, dy));
            }}
          />
        );
      })}
    </>
  );
}

function updateRectCorner(
  roi: Extract<Roi, { kind: "rect" }>,
  corner: "tl" | "tr" | "bl" | "br",
  dx: number,
  dy: number,
): Roi {
  let x1 = roi.x;
  let y1 = roi.y;
  let x2 = roi.x + roi.w;
  let y2 = roi.y + roi.h;
  if (corner === "tl" || corner === "bl") x1 += dx;
  if (corner === "tr" || corner === "br") x2 += dx;
  if (corner === "tl" || corner === "tr") y1 += dy;
  if (corner === "bl" || corner === "br") y2 += dy;
  // Re-normalize: clamp to [0..1] and keep w/h positive even if the
  // user dragged past the opposite corner.
  const x = Math.max(0, Math.min(1, Math.min(x1, x2)));
  const y = Math.max(0, Math.min(1, Math.min(y1, y2)));
  const w = Math.min(1 - x, Math.abs(x2 - x1));
  const h = Math.min(1 - y, Math.abs(y2 - y1));
  return { kind: "rect", x, y, w, h };
}

interface PolygonHandlesProps {
  roi: Extract<Roi, { kind: "polygon" }>;
  layout: { width: number; height: number };
  onUpdate: (roi: Roi) => void;
}

function PolygonHandles({ roi, layout, onUpdate }: PolygonHandlesProps) {
  return (
    <>
      {roi.points.map((point, index) => (
        <HandleDot
          key={index}
          x={point.x * layout.width}
          y={point.y * layout.height}
          onMove={(dxPx, dyPx) => {
            const dx = dxPx / layout.width;
            const dy = dyPx / layout.height;
            const points = roi.points.map((p, i) =>
              i === index ? { x: clamp01(p.x + dx), y: clamp01(p.y + dy) } : p,
            );
            onUpdate({ ...roi, points });
          }}
        />
      ))}
    </>
  );
}

interface CircleHandlesProps {
  roi: Extract<Roi, { kind: "circle" }>;
  layout: { width: number; height: number };
  onUpdate: (roi: Roi) => void;
}

function CircleHandles({ roi, layout, onUpdate }: CircleHandlesProps) {
  const minDim = Math.min(layout.width, layout.height);
  const edgeX = roi.cx * layout.width + roi.r * minDim;
  const edgeY = roi.cy * layout.height;
  return (
    <>
      <HandleDot
        x={roi.cx * layout.width}
        y={roi.cy * layout.height}
        onMove={(dxPx, dyPx) => {
          onUpdate({
            ...roi,
            cx: clamp01(roi.cx + dxPx / layout.width),
            cy: clamp01(roi.cy + dyPx / layout.height),
          });
        }}
      />
      <HandleDot
        x={edgeX}
        y={edgeY}
        onMove={(dxPx, dyPx) => {
          const nextEdgeX = edgeX + dxPx;
          const nextEdgeY = edgeY + dyPx;
          const centerX = roi.cx * layout.width;
          const centerY = roi.cy * layout.height;
          const r = Math.hypot(nextEdgeX - centerX, nextEdgeY - centerY) / minDim;
          onUpdate({ ...roi, r: Math.max(0.005, Math.min(1, r)) });
        }}
      />
    </>
  );
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

interface HandleDotProps {
  x: number;
  y: number;
  onMove: (dxPx: number, dyPx: number) => void;
}

/**
 * Touch-responsive handle — captures touches so the parent's
 * draw-gesture handler doesn't fire when the user grabs a corner. The
 * outer hit area is 32 × 32 px for fingertip ergonomics; the visible
 * dot is 14 px so it doesn't dominate the shape it's editing.
 */
function HandleDot({ x, y, onMove }: HandleDotProps) {
  const lastRef = useRef<{ pageX: number; pageY: number } | null>(null);
  const HIT = 32;
  const DOT = 14;

  return (
    <View
      onStartShouldSetResponder={(e) => {
        lastRef.current = { pageX: e.nativeEvent.pageX, pageY: e.nativeEvent.pageY };
        return true;
      }}
      // Returning true here also captures move events that started on
      // this view — without it, the parent View's onMoveShouldSetResponder
      // can steal the gesture mid-drag.
      onMoveShouldSetResponder={() => true}
      onResponderMove={(e) => {
        const last = lastRef.current;
        if (!last) return;
        const dx = e.nativeEvent.pageX - last.pageX;
        const dy = e.nativeEvent.pageY - last.pageY;
        lastRef.current = { pageX: e.nativeEvent.pageX, pageY: e.nativeEvent.pageY };
        onMove(dx, dy);
      }}
      onResponderRelease={() => {
        lastRef.current = null;
      }}
      onResponderTerminate={() => {
        lastRef.current = null;
      }}
      style={{
        position: "absolute",
        left: x - HIT / 2,
        top: y - HIT / 2,
        width: HIT,
        height: HIT,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: DOT,
          height: DOT,
          borderRadius: DOT / 2,
          backgroundColor: STROKE,
          borderWidth: 2,
          borderColor: "white",
        }}
      />
    </View>
  );
}

function renderShape(roi: Roi, w: number, h: number) {
  switch (roi.kind) {
    case "rect":
      return (
        <Rect
          x={roi.x * w}
          y={roi.y * h}
          width={roi.w * w}
          height={roi.h * h}
          stroke={STROKE}
          strokeWidth={STROKE_WIDTH}
          fill={FILL}
        />
      );
    case "circle": {
      const minDim = Math.min(w, h);
      return (
        <SvgCircle
          cx={roi.cx * w}
          cy={roi.cy * h}
          r={roi.r * minDim}
          stroke={STROKE}
          strokeWidth={STROKE_WIDTH}
          fill={FILL}
        />
      );
    }
    case "polygon": {
      const ptsStr = roi.points.map((p) => `${p.x * w},${p.y * h}`).join(" ");
      if (roi.closed) {
        return <Polygon points={ptsStr} stroke={STROKE} strokeWidth={STROKE_WIDTH} fill={FILL} />;
      }
      return (
        <>
          <Polyline points={ptsStr} stroke={STROKE} strokeWidth={STROKE_WIDTH} fill="none" />
          {roi.points.map((p, i) => (
            <SvgCircle key={i} cx={p.x * w} cy={p.y * h} r={5} fill={STROKE} />
          ))}
        </>
      );
    }
  }
}
