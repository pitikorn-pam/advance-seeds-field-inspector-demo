import { useState } from "react";
import { View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import Svg, { Circle as SvgCircle, Polygon, Polyline, Rect } from "react-native-svg";
import type { Roi } from "@/lib/capture/roi";

const STROKE = "#7DD3C7";
const FILL = "rgba(125, 211, 199, 0.18)";
const STROKE_WIDTH = 2;

export function RoiPreviewOverlay({ roi }: { roi: Roi | null }) {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  if (!roi) return null;

  const onLayout = (event: LayoutChangeEvent) => {
    setLayout({
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    });
  };

  return (
    <View
      onLayout={onLayout}
      pointerEvents="none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
    >
      {layout.width > 0 && layout.height > 0 ? (
        <Svg
          width="100%"
          height="100%"
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          pointerEvents="none"
        >
          {renderShape(roi, layout.width, layout.height)}
        </Svg>
      ) : null}
    </View>
  );
}

function renderShape(roi: Roi, width: number, height: number) {
  switch (roi.kind) {
    case "rect":
      return (
        <Rect
          x={roi.x * width}
          y={roi.y * height}
          width={roi.w * width}
          height={roi.h * height}
          stroke={STROKE}
          strokeWidth={STROKE_WIDTH}
          fill={FILL}
        />
      );
    case "circle":
      return (
        <SvgCircle
          cx={roi.cx * width}
          cy={roi.cy * height}
          r={roi.r * Math.min(width, height)}
          stroke={STROKE}
          strokeWidth={STROKE_WIDTH}
          fill={FILL}
        />
      );
    case "polygon": {
      const points = roi.points.map((p) => `${p.x * width},${p.y * height}`).join(" ");
      if (roi.closed) {
        return <Polygon points={points} stroke={STROKE} strokeWidth={STROKE_WIDTH} fill={FILL} />;
      }
      return (
        <>
          <Polyline points={points} stroke={STROKE} strokeWidth={STROKE_WIDTH} fill="none" />
          {roi.points.map((p, i) => (
            <SvgCircle key={i} cx={p.x * width} cy={p.y * height} r={5} fill={STROKE} />
          ))}
        </>
      );
    }
  }
}
