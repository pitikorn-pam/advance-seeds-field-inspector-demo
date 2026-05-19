import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";

interface Props {
  /** 0–100 — proportion of seeds graded A. */
  percent: number;
  size?: number;
  /** Top label shown inside the ring. Defaults to `${percent}%`. */
  label?: string;
  /** Sub-label shown below the percentage. */
  sublabel?: string;
}

/**
 * Circular progress ring used by the review screen header. SVG is rotated
 * -90° so the stroke starts at 12 o'clock and grows clockwise — matches the
 * prototype's `.ring` element.
 *
 * Stroke math: a circle of radius `r` has circumference `2πr`. We make the
 * full circle dashed with the dash equal to the circumference (so it forms
 * one continuous segment), then offset by `C × (1 − percent/100)` so the
 * gap "eats" the unfilled portion.
 */
export function GradeRing({ percent, size = 88, label, sublabel }: Props) {
  const clamped = Math.max(0, Math.min(100, percent));
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);

  return (
    <View style={{ width: size, height: size, position: "relative" }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Circle cx="50" cy="50" r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={8} />
        {/* Rotate just the progress arc (not the track) so the stroke
            starts at 12 o'clock without flipping the track shadow. */}
        <Circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#6E40E0"
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
        />
      </Svg>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text className="text-fg-primary font-medium" style={{ fontSize: 22, letterSpacing: -0.4 }}>
          {label ?? `${Math.round(clamped)}%`}
        </Text>
        {sublabel ? (
          <Text
            className="text-fg-secondary uppercase mt-[2px]"
            style={{ fontSize: 9, letterSpacing: 0.5 }}
          >
            {sublabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
