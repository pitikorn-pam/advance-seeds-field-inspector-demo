import { View, Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { Link, useRouter } from "expo-router";
import { ChevronRight, ListChecks } from "lucide-react-native";
import type { InspectionRow } from "@/lib/queries";
import { Card } from "@/components/ui/Card";

const VARIETY_TINTS: Record<string, { bg: string; fg: string }> = {
  corn: { bg: "#FFF1B8", fg: "#704B00" },
  rice: { bg: "#DFF6EC", fg: "#0F6E56" },
  legume: { bg: "#EEE9FF", fg: "#3F249B" },
  mungbean: { bg: "#FFE8D6", fg: "#8C3C12" },
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
 * same tokens used by the varieties tab. Defaulting to the rice tint when
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
      <View className="rounded-lg bg-card-yellow-bold px-lg py-md">
        <View className="flex-row items-center justify-between gap-md">
          <View className="flex-row items-center gap-sm">
            <View className="h-8 w-8 items-center justify-center rounded-md bg-bg-primary/70">
              <ListChecks color="#0D1028" size={16} />
            </View>
            <View>
              <Text className="text-title font-medium text-brand-navy">{t("home:recent")}</Text>
              <Text className="text-caption text-warning-text">{t("home:recentSubhead")}</Text>
            </View>
          </View>
          <Pressable onPress={() => router.push("/more/history" as never)}>
            <Text className="text-caption font-medium text-brand-navy">{t("home:viewAll")}</Text>
          </Pressable>
        </View>
      </View>

      <Card className="p-0" tone="base">
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
                    borderRadius: 8,
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
                <ChevronRight color="#8C8C87" size={16} />
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
