import { View, Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { Link, useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import type { InspectionRow } from "@/lib/queries";
import { Card } from "@/components/ui/Card";

const VARIETY_TINTS: Record<string, { bg: string; fg: string }> = {
  corn: { bg: "#FAEEDA", fg: "#854F0B" },
  rice: { bg: "#EAF3DE", fg: "#3B6D11" },
  legume: { bg: "#E1F5EE", fg: "#0F6E56" },
  mungbean: { bg: "#FAECE7", fg: "#993C1D" },
};

interface Props {
  /** Up to 3 most recent inspections, descending by captured_at. */
  rows: InspectionRow[];
}

/**
 * Recent inspections card on Home. Mirrors the prototype's `.list-row`
 * pattern: a variety-tinted thumb showing the seed count, name + meta
 * line, chevron. Tapping a row routes to the inspection detail.
 *
 * Variety tint comes from `color_key` (corn/rice/legume/mungbean) — the
 * same tokens used by the Library tab. Defaulting to the rice tint when
 * `color_key` is unset keeps the row readable on imported data.
 *
 * The "View all" link lives here (not separately) because it's logically
 * tied to the recent list — user clicks it to "see more of these."
 */
export function RecentInspections({ rows }: Props) {
  const { t } = useTranslation(["home", "inspections"]);
  const router = useRouter();

  return (
    <View className="gap-md">
      <View className="flex-row items-center justify-between">
        <Text className="text-title font-medium text-fg-primary">{t("home:recent")}</Text>
        <Pressable onPress={() => router.push("/more/history" as never)}>
          <Text className="text-brand text-caption font-medium">{t("home:viewAll")}</Text>
        </Pressable>
      </View>

      <Card className="p-0">
        {rows.map((row, idx) => {
          const tint = VARIETY_TINTS[row.variety?.color_key ?? ""] ?? VARIETY_TINTS.rice;
          return (
            <Link key={row.id} href={`/inspections/${row.id}`} asChild>
              <Pressable
                className={`flex-row items-center gap-md px-lg py-md ${
                  idx > 0 ? "border-t border-line-tertiary" : ""
                }`}
              >
                <View
                  className="items-center justify-center"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: tint.bg,
                  }}
                >
                  <Text
                    className="font-medium"
                    style={{ color: tint.fg, fontSize: 14, letterSpacing: -0.2 }}
                  >
                    {row.total_seeds ?? 0}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-title text-fg-primary font-medium" numberOfLines={1}>
                    {row.variety?.name ?? "—"}
                  </Text>
                  <Text className="text-caption text-fg-secondary mt-xs" numberOfLines={1}>
                    {formatRelative(row.captured_at)}
                    {row.mean_length_mm !== null
                      ? ` · ${Number(row.mean_length_mm).toFixed(1)} mm avg`
                      : ""}
                  </Text>
                </View>
                <ChevronRight color="#9D9D9A" size={16} />
              </Pressable>
            </Link>
          );
        })}
      </Card>
    </View>
  );
}

/**
 * Manual relative-time formatter — Hermes' default ICU subset doesn't
 * include `Intl.RelativeTimeFormat`, so we string-build instead. Matches
 * the same pattern used in `more/history.tsx` and `SyncBanner.tsx`.
 *
 * Loses proper Thai localization (always English output) — acceptable
 * for v0.2; a follow-up can add @formatjs/intl-relativetimeformat
 * polyfill or translate units via i18n keys when localization matters.
 */
function formatRelative(iso: string): string {
  const diffMin = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(diffMin) < 60) return `${Math.abs(diffMin)} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return `${Math.abs(diffHr)}h ago`;
  return new Date(iso).toLocaleDateString();
}
