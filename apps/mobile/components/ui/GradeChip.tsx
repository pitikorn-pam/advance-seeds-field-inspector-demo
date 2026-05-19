import { View, Text } from "react-native";
import type { SeedGrade } from "@advance-seeds/types";
import { gradePalette } from "@/lib/grading/palette";

// Grade chips use the dedicated `grade-*` design tokens (A–C + reject)
// when available so a tweak to "warning yellow" cannot silently restyle
// a Grade B seed. Letters beyond C (D–H) fall back to inline hex styles
// from `gradePalette()` because they aren't in the Tailwind preset.
//
// "Reject" renders its full label; letter grades render the single letter.
export function GradeChip({
  grade,
  size = "md",
  className = "",
}: {
  grade: SeedGrade;
  /** `sm` = 20px tag-style; `md` = 22px status-badge style. */
  size?: "sm" | "md";
  className?: string;
}) {
  const palette = gradePalette(grade);
  const height = size === "sm" ? "h-[20px]" : "h-[22px]";
  const padX = size === "sm" ? "px-[6px]" : "px-[8px]";
  const radius = size === "sm" ? "rounded-sm" : "rounded-full";
  const bgClass = palette.bgClass ?? "";
  const inkClass = palette.inkClass ?? "";
  const label = grade === "reject" ? "Reject" : grade;
  return (
    <View
      className={`flex-row items-center justify-center ${height} ${padX} ${radius} ${bgClass} ${className}`}
      style={palette.bgClass ? undefined : { backgroundColor: palette.bg }}
    >
      <Text
        className={`text-[11px] font-semibold tracking-[0.2px] ${inkClass}`}
        style={palette.inkClass ? undefined : { color: palette.ink }}
      >
        {label}
      </Text>
    </View>
  );
}
