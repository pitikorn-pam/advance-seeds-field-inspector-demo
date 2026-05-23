import { View, Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { Link, useRouter } from "expo-router";
import type { InspectionRow } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { GradeChip } from "@/components/ui/GradeChip";
import type { SeedGrade } from "@advance-seeds/types";

interface Props {
  /** Up to 3 most recent inspections, descending by captured_at. */
  rows: InspectionRow[];
}

/**
 * Recent inspections section on Home. Prototype layout:
 *   - "Recent" h4 + "View all" link as a plain header ROW outside the card.
 *   - Card containing rows: 44x44 neutral variety thumb, name + meta subline,
 *     grade chip on the right.
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
          const grade = inferGrade(row.mean_length_mm);
          const title = row.variety?.name ?? "—";
          return (
            <Link key={row.id} href={`/inspections/${row.id}`} asChild>
              <Pressable
                className={`flex-row items-center gap-md px-lg py-md ${
                  idx > 0 ? "border-t border-line-tertiary" : ""
                }`}
              >
                <View
                  className="items-center justify-center overflow-hidden bg-bg-tertiary border border-line-tertiary"
                  style={{ width: 44, height: 44, borderRadius: 8 }}
                >
                  <Text className="text-title font-semibold text-fg-secondary">
                    {title.trim().charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-body text-fg-primary font-medium" numberOfLines={1}>
                    {title}
                  </Text>
                  <Text className="text-caption text-fg-secondary mt-[2px]" numberOfLines={1}>
                    {formatRelative(row.captured_at)}
                    {row.total_seeds !== null && row.total_seeds !== undefined
                      ? ` · ${row.total_seeds} seeds`
                      : ""}
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
