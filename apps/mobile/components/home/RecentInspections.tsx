import { View, Text, Pressable } from "react-native";
import Svg, { Ellipse } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { Link, useRouter } from "expo-router";
import type { InspectionRow } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { GradeChip } from "@/components/ui/GradeChip";
import type { SeedGrade } from "@advance-seeds/types";

const TINT_CLASSES: Record<string, string> = {
  corn: "bg-card-yellow",
  rice: "bg-card-mint",
  legume: "bg-card-lavender",
  mungbean: "bg-card-peach",
};

interface Props {
  /** Up to 3 most recent inspections, descending by captured_at. */
  rows: InspectionRow[];
}

/**
 * Recent inspections section on Home. Prototype layout:
 *   - "Recent" h4 + "View all" link as a plain header ROW outside the card.
 *   - Card containing rows: 44x44 tinted seed-tray thumb (with subtle seed
 *     dots), name + meta subline, grade chip on the right.
 *
 * Variety tint comes from `color_key` (corn/rice/legume/mungbean), defaulting
 * to mint when missing so imported data still reads cleanly.
 */
export function RecentInspections({ rows }: Props) {
  const { t } = useTranslation(["home", "inspections"]);
  const router = useRouter();

  return (
    <View className="gap-sm">
      <View className="flex-row items-baseline justify-between px-[4px]">
        <Text className="text-body font-medium text-fg-primary">{t("home:recentHeader")}</Text>
        <Pressable onPress={() => router.push("/more/history" as never)}>
          <Text className="text-caption font-medium text-primary">{t("home:viewAll")}</Text>
        </Pressable>
      </View>

      <Card className="p-0" tone="base">
        {rows.map((row, idx) => {
          const tintClass = TINT_CLASSES[row.variety?.color_key ?? ""] ?? "bg-card-mint";
          const grade = inferGrade(row.mean_length_mm);
          return (
            <Link key={row.id} href={`/inspections/${row.id}`} asChild>
              <Pressable
                className={`flex-row items-center gap-md px-lg py-md ${
                  idx > 0 ? "border-t border-line-tertiary" : ""
                }`}
              >
                <View
                  className={`items-center justify-center overflow-hidden ${tintClass}`}
                  style={{ width: 44, height: 44, borderRadius: 8 }}
                >
                  <SeedDots />
                </View>
                <View className="flex-1">
                  <Text className="text-body text-fg-primary font-medium" numberOfLines={1}>
                    {row.variety?.name ?? "—"}
                  </Text>
                  <Text className="text-caption text-fg-secondary mt-[2px]" numberOfLines={1}>
                    {formatRelative(row.captured_at)}
                    {row.total_seeds != null ? ` · ${row.total_seeds} seeds` : ""}
                    {row.mean_length_mm !== null
                      ? ` · ${Number(row.mean_length_mm).toFixed(1)} mm`
                      : ""}
                  </Text>
                </View>
                {grade ? <GradeChip grade={grade} size="sm" /> : null}
              </Pressable>
            </Link>
          );
        })}
      </Card>
    </View>
  );
}

/**
 * Subtle 5-seed pattern matching the prototype's `<svg viewBox="0 0 44 44">`
 * with 5 rotated ellipses at fixed coords. Pure decoration — communicates
 * "this row is a seed tray" without depending on real thumbnail capture.
 */
function SeedDots() {
  const dots: Array<[number, number]> = [
    [10, 12],
    [24, 16],
    [18, 28],
    [32, 30],
    [14, 34],
  ];
  return (
    <Svg viewBox="0 0 44 44" width={44} height={44}>
      {dots.map(([x, y], i) => (
        <Ellipse
          key={i}
          cx={x}
          cy={y}
          rx={3.2}
          ry={2}
          fill="rgba(55,53,47,0.35)"
          transform={`rotate(${i * 22} ${x} ${y})`}
        />
      ))}
    </Svg>
  );
}

function inferGrade(meanLengthMm: number | null): SeedGrade | null {
  if (meanLengthMm === null || !Number.isFinite(meanLengthMm)) return null;
  if (meanLengthMm >= 7.0) return "A";
  if (meanLengthMm >= 5.5) return "B";
  return "C";
}

/**
 * Manual relative-time formatter — Hermes' default ICU subset doesn't
 * include `Intl.RelativeTimeFormat`. Matches the pattern used elsewhere.
 */
function formatRelative(iso: string): string {
  const diffMin = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(diffMin) < 60) return `${Math.abs(diffMin)} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return `${Math.abs(diffHr)}h ago`;
  return new Date(iso).toLocaleDateString();
}
