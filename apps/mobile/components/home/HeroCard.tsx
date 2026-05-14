import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import type { InspectionRow } from "@/lib/queries";
import { Card } from "@/components/ui/Card";

interface Props {
  /** Inspections already filtered by the selected Home dashboard date range. */
  inspections: InspectionRow[];
  dateLabel: string;
}

/**
 * Home dashboard summary block, redesigned per the Field Inspector prototype:
 * a 4-tile KPI grid, a 7-day inspection mini bar chart, and a horizontal
 * stacked-bar variety mix. KPIs are derived from the same `inspections` array
 * the screen already supplies — no new data wiring.
 *
 * KPI #4 ("Grade A %") uses `mean_length_mm >= GRADE_A_LENGTH_MM` as a
 * lightweight proxy because the list projection does not include per-seed
 * grades. This is fine for an at-a-glance dashboard signal; precise grading
 * still lives on the detail screen.
 */
const GRADE_A_LENGTH_MM = 7.0;

const VARIETY_COLORS = [
  "bg-card-lavender",
  "bg-card-mint",
  "bg-card-sky",
  "bg-card-peach",
  "bg-card-rose",
];

export function HeroCard({ inspections, dateLabel }: Props) {
  const { t } = useTranslation("home");

  const totalSeeds = inspections.reduce((s, r) => s + (r.total_seeds ?? 0), 0);
  const weightedLength = weightedMean(
    inspections.map((row) => ({
      value: row.mean_length_mm,
      weight: row.total_seeds ?? 0,
    })),
  );
  const gradeAPct = computeGradeAPct(inspections);
  const buckets = buildSevenDayBuckets(inspections);
  const maxBucket = Math.max(1, ...buckets.map((b) => b.count));
  const varieties = topVarieties(inspections, t("unassigned"));
  const totalVarietySeeds = varieties.reduce((s, v) => s + v.seeds, 0);

  return (
    <View className="gap-sm">
      {/* KPI grid — prototype is plain white cards with hairlines, no tints.
          Tints belong on small icon squares and status badges, not full KPI
          tiles. Layout: UPPERCASE caption, big number, small unit suffix. */}
      <View className="flex-row gap-sm">
        <KpiTile value={inspections.length.toLocaleString()} label={t("metricInspections")} />
        <KpiTile value={totalSeeds.toLocaleString()} label={t("metricSeeds")} />
      </View>
      <View className="flex-row gap-sm">
        <KpiTile
          value={weightedLength === null ? "--" : weightedLength.toFixed(1)}
          unit="mm"
          label={t("metricAvgLength")}
        />
        <KpiTile
          value={gradeAPct === null ? "--" : `${gradeAPct}`}
          unit={gradeAPct === null ? "" : "%"}
          label={t("metricGradeA")}
        />
      </View>

      {/* Inspections trend — last 7 days */}
      <Card className="px-lg py-md">
        <View className="flex-row items-baseline justify-between">
          <Text className="text-body font-medium text-fg-primary">{t("trendTitle")}</Text>
          <Text className="text-caption text-fg-secondary">{dateLabel}</Text>
        </View>
        <View className="flex-row items-end gap-xs mt-md" style={{ height: 56 }}>
          {buckets.map((bucket) => (
            <View key={bucket.key} className="flex-1 items-center justify-end gap-xs">
              <View
                className={`w-full rounded-sm ${bucket.isAnchor ? "bg-primary" : "bg-primary/60"}`}
                style={{
                  minHeight: 4,
                  height: Math.max(4, Math.round((bucket.count / maxBucket) * 44)),
                }}
              />
              <Text className="text-[10px] text-fg-secondary">{bucket.label}</Text>
            </View>
          ))}
        </View>
      </Card>

      {/* Variety mix — horizontal stacked bar + legend */}
      <Card className="px-lg py-md">
        <Text className="text-body font-medium text-fg-primary">{t("varietyMix")}</Text>
        {varieties.length > 0 && totalVarietySeeds > 0 ? (
          <>
            <View
              className="flex-row mt-md overflow-hidden rounded-sm bg-line-tertiary"
              style={{ height: 8 }}
            >
              {varieties.map((v, i) => {
                const pct = (v.seeds / totalVarietySeeds) * 100;
                if (pct <= 0) return null;
                return (
                  <View
                    key={v.name}
                    className={VARIETY_COLORS[i % VARIETY_COLORS.length]}
                    style={{ width: `${pct}%`, height: "100%" }}
                  />
                );
              })}
            </View>
            <View className="mt-sm gap-xs">
              {varieties.map((v, i) => {
                const pct = Math.round((v.seeds / totalVarietySeeds) * 100);
                return (
                  <View key={v.name} className="flex-row items-center gap-sm">
                    <View
                      className={`h-2 w-2 rounded-sm ${VARIETY_COLORS[i % VARIETY_COLORS.length]}`}
                    />
                    <Text className="flex-1 text-caption text-fg-primary" numberOfLines={1}>
                      {v.name}
                    </Text>
                    <Text className="text-caption text-fg-secondary">{pct}%</Text>
                  </View>
                );
              })}
            </View>
          </>
        ) : (
          <Text className="text-caption text-fg-secondary mt-sm">{t("heroSubtitleEmpty")}</Text>
        )}
      </Card>
    </View>
  );
}

function KpiTile({ value, unit, label }: { value: string; unit?: string; label: string }) {
  // Plain white card with hairline — matches prototype's RUNS / SEEDS / AVG L
  // tiles. Caption at top in small-caps + steel ink; big number below.
  return (
    <View className="flex-1 rounded-lg border border-line-tertiary bg-bg-primary px-md py-md">
      <Text className="text-[11px] font-semibold uppercase tracking-[0.6px] text-fg-tertiary">
        {label}
      </Text>
      <View className="mt-xs flex-row items-baseline">
        <Text
          className="font-semibold text-fg-primary"
          style={{ fontSize: 26, letterSpacing: -0.4 }}
        >
          {value}
        </Text>
        {unit ? <Text className="ml-[3px] text-caption text-fg-tertiary">{unit}</Text> : null}
      </View>
    </View>
  );
}

function weightedMean(rows: { value: number | null; weight: number }[]): number | null {
  let total = 0;
  let weight = 0;
  for (const row of rows) {
    if (row.value === null || !Number.isFinite(row.value) || row.weight <= 0) continue;
    total += row.value * row.weight;
    weight += row.weight;
  }
  return weight > 0 ? total / weight : null;
}

function computeGradeAPct(rows: InspectionRow[]): number | null {
  const measured = rows.filter(
    (r) => r.mean_length_mm !== null && Number.isFinite(r.mean_length_mm),
  );
  if (measured.length === 0) return null;
  const aGrade = measured.filter((r) => (r.mean_length_mm ?? 0) >= GRADE_A_LENGTH_MM).length;
  return Math.round((aGrade / measured.length) * 100);
}

function buildSevenDayBuckets(inspections: InspectionRow[]) {
  const anchor = inspections[0]?.captured_at ? new Date(inspections[0].captured_at) : new Date();
  anchor.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, idx) => {
    const day = new Date(anchor);
    day.setDate(anchor.getDate() - (6 - idx));
    const next = new Date(day);
    next.setDate(day.getDate() + 1);
    const count = inspections.filter((row) => {
      const captured = new Date(row.captured_at);
      return captured >= day && captured < next;
    }).length;
    return {
      key: day.toISOString(),
      label: day.toLocaleDateString(undefined, { weekday: "narrow" }),
      count,
      isAnchor: idx === 6,
    };
  });
}

function topVarieties(rows: InspectionRow[], fallbackName: string) {
  const byName = new Map<string, number>();
  for (const row of rows) {
    const name = row.variety?.name ?? fallbackName;
    byName.set(name, (byName.get(name) ?? 0) + (row.total_seeds ?? 0));
  }
  return Array.from(byName.entries())
    .map(([name, seeds]) => ({ name, seeds }))
    .sort((a, b) => b.seeds - a.seeds)
    .slice(0, 4);
}
