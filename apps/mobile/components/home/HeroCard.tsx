import { View, Text } from "react-native";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Activity, Clock3, Layers3, Ruler } from "lucide-react-native";
import type { InspectionRow } from "@/lib/queries";
import { useTheme } from "@/lib/theme";

interface Props {
  /** Inspections already filtered by the selected Home dashboard date range. */
  inspections: InspectionRow[];
  dateLabel: string;
}

/**
 * Compact operations dashboard for Home. This is intentionally not a capture
 * CTA; Home summarizes field progress while the Inspect tab / edge gesture own
 * starting a new capture.
 */
export function HeroCard({ inspections, dateLabel }: Props) {
  const { t } = useTranslation("home");
  const { resolved } = useTheme();
  const palette = resolved === "dark" ? darkPalette : lightPalette;

  const totalSeeds = inspections.reduce((s, r) => s + (r.total_seeds ?? 0), 0);
  const batchesToday = new Set(
    inspections.map((r) => r.batch_id).filter((id): id is string => !!id),
  ).size;
  const weightedLength = weightedMean(
    inspections.map((row) => ({
      value: row.mean_length_mm,
      weight: row.total_seeds ?? 0,
    })),
  );
  const lastCapture = inspections[0]?.captured_at ?? null;
  const buckets = buildSevenDayBuckets(inspections);
  const maxBucket = Math.max(1, ...buckets.map((b) => b.count));
  const varieties = topVarieties(inspections, t("unassigned"));

  return (
    <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: palette.card }}>
      <View className="px-xl pt-lg pb-md">
        <View className="flex-row items-center justify-between gap-md">
          <View className="flex-1">
            <Text
              className="text-caption uppercase"
              style={{ color: palette.caption, letterSpacing: 0.4 }}
            >
              {t("heroLabel")}
            </Text>
            <Text className="font-medium mt-xs" style={{ color: palette.text, fontSize: 24 }}>
              {t("dashboardTitle")}
            </Text>
            <Text className="text-caption mt-[2px]" style={{ color: palette.caption }}>
              {dateLabel}
            </Text>
          </View>
          <View className="rounded-lg px-md py-sm" style={{ backgroundColor: palette.tile }}>
            <Text className="text-caption" style={{ color: palette.caption }}>
              {t("lastCapture")}
            </Text>
            <Text className="text-caption font-medium mt-[2px]" style={{ color: palette.text }}>
              {lastCapture ? formatRelative(lastCapture, t) : t("noneYet")}
            </Text>
          </View>
        </View>

        <View className="flex-row gap-sm mt-lg">
          <MetricTile
            icon={<Activity color={palette.iconPrimary} size={16} />}
            iconBg={palette.iconPrimaryBg}
            value={inspections.length.toLocaleString()}
            label={t("metricInspections")}
            palette={palette}
          />
          <MetricTile
            icon={<Layers3 color={palette.iconWarning} size={16} />}
            iconBg={palette.iconWarningBg}
            value={totalSeeds.toLocaleString()}
            label={t("metricSeeds")}
            palette={palette}
          />
        </View>

        <View className="flex-row gap-sm mt-sm">
          <MetricTile
            icon={<Ruler color={palette.iconInfo} size={16} />}
            iconBg={palette.iconInfoBg}
            value={weightedLength === null ? "--" : weightedLength.toFixed(1)}
            label={t("metricAvgLength")}
            palette={palette}
          />
          <MetricTile
            icon={<Clock3 color={palette.iconNeutral} size={16} />}
            iconBg={palette.iconNeutralBg}
            value={batchesToday.toLocaleString()}
            label={t("metricBatches")}
            palette={palette}
          />
        </View>
      </View>

      <View className="px-xl py-md" style={{ backgroundColor: palette.band }}>
        <View className="flex-row items-end gap-xs" style={{ height: 42 }}>
          {buckets.map((bucket) => (
            <View key={bucket.key} className="flex-1 items-center justify-end gap-xs">
              <View
                className="w-full rounded-sm"
                style={{
                  minHeight: 4,
                  height: Math.max(4, Math.round((bucket.count / maxBucket) * 30)),
                  backgroundColor: bucket.isAnchor ? palette.accent : palette.bar,
                }}
              />
              <Text className="text-[10px]" style={{ color: palette.caption }}>
                {bucket.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View className="px-xl py-md">
        <Text
          className="text-caption uppercase"
          style={{ color: palette.caption, letterSpacing: 0.4 }}
        >
          {t("varietyMix")}
        </Text>
        <View className="flex-row flex-wrap gap-sm mt-sm">
          {varieties.length > 0 ? (
            varieties.map((item) => (
              <View
                key={item.name}
                className="rounded-md px-md py-sm"
                style={{ backgroundColor: palette.tile }}
              >
                <Text className="text-caption font-medium" style={{ color: palette.text }}>
                  {item.name}
                </Text>
                <Text className="text-[11px] mt-[2px]" style={{ color: palette.caption }}>
                  {t("varietySeedCount", { count: item.seeds })}
                </Text>
              </View>
            ))
          ) : (
            <Text className="text-caption" style={{ color: palette.caption }}>
              {t("heroSubtitleEmpty")}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

interface DashboardPalette {
  card: string;
  tile: string;
  band: string;
  text: string;
  caption: string;
  accent: string;
  bar: string;
  iconPrimary: string;
  iconWarning: string;
  iconInfo: string;
  iconNeutral: string;
  iconPrimaryBg: string;
  iconWarningBg: string;
  iconInfoBg: string;
  iconNeutralBg: string;
}

const lightPalette: DashboardPalette = {
  card: "#F7F4EA",
  tile: "rgba(15,110,86,0.09)",
  band: "rgba(15,110,86,0.08)",
  text: "#16352E",
  caption: "#66736D",
  accent: "#0F6E56",
  bar: "rgba(15,110,86,0.22)",
  iconPrimary: "#087257",
  iconWarning: "#9E5A00",
  iconInfo: "#2662A6",
  iconNeutral: "#7C3B73",
  iconPrimaryBg: "#DDF4E9",
  iconWarningBg: "#FFE6B8",
  iconInfoBg: "#DDEBFF",
  iconNeutralBg: "#F2DDF0",
};

const darkPalette: DashboardPalette = {
  card: "#082F29",
  tile: "rgba(255,255,255,0.1)",
  band: "rgba(0,0,0,0.16)",
  text: "#F5F5F4",
  caption: "rgba(245,245,244,0.64)",
  accent: "#9DDBC9",
  bar: "rgba(255,255,255,0.34)",
  iconPrimary: "#9DDBC9",
  iconWarning: "#F4C46E",
  iconInfo: "#BFD8FF",
  iconNeutral: "#D9D3C7",
  iconPrimaryBg: "rgba(157,219,201,0.12)",
  iconWarningBg: "rgba(244,196,110,0.12)",
  iconInfoBg: "rgba(191,216,255,0.12)",
  iconNeutralBg: "rgba(217,211,199,0.12)",
};

function MetricTile({
  icon,
  iconBg,
  value,
  label,
  palette,
}: {
  icon: ReactNode;
  iconBg: string;
  value: string;
  label: string;
  palette: DashboardPalette;
}) {
  return (
    <View className="flex-1 rounded-lg px-md py-md" style={{ backgroundColor: palette.tile }}>
      <View className="flex-row items-center justify-between">
        <View
          className="h-7 w-7 items-center justify-center rounded-md"
          style={{ backgroundColor: iconBg }}
        >
          {icon}
        </View>
        <Text className="text-[10px] uppercase" style={{ color: palette.caption }}>
          {label}
        </Text>
      </View>
      <Text className="font-medium mt-sm" style={{ color: palette.text, fontSize: 24 }}>
        {value}
      </Text>
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
    .slice(0, 3);
}

function formatRelative(iso: string, t: ReturnType<typeof useTranslation>["t"]): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return t("now");
  if (diffMin < 60) return t("minutesAgo", { count: diffMin });
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return t("hoursAgo", { count: diffHr });
  return new Date(iso).toLocaleDateString();
}
