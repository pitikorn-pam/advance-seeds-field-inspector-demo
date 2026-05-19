import { View, Text } from "react-native";
import type { SeedGrade } from "@advance-seeds/types";

// Grade chips use the dedicated `grade-*` tokens (DEEDD7/FAEFC8/FBEBD9/FBE0E2
// backgrounds + 2D6E3F/7A5A12/B85518/A02828 inks) rather than the generic
// semantic palette so a tweak to "warning yellow" cannot silently restyle a
// Grade B seed. The pairing comes from docs/handoff/design-tokens.json `grade`.
const STYLES: Record<SeedGrade, { bg: string; text: string }> = {
  A: { bg: "bg-grade-a", text: "text-grade-a-ink" },
  B: { bg: "bg-grade-b", text: "text-grade-b-ink" },
  C: { bg: "bg-grade-c", text: "text-grade-c-ink" },
  reject: { bg: "bg-grade-reject", text: "text-grade-reject-ink" },
};

const LABELS: Record<SeedGrade, string> = {
  A: "A",
  B: "B",
  C: "C",
  reject: "Reject",
};

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
  const s = STYLES[grade];
  const height = size === "sm" ? "h-[20px]" : "h-[22px]";
  const padX = size === "sm" ? "px-[6px]" : "px-[8px]";
  const radius = size === "sm" ? "rounded-sm" : "rounded-full";
  return (
    <View
      className={`flex-row items-center justify-center ${height} ${padX} ${radius} ${s.bg} ${className}`}
    >
      <Text className={`text-[11px] font-semibold tracking-[0.2px] ${s.text}`}>
        {LABELS[grade]}
      </Text>
    </View>
  );
}
