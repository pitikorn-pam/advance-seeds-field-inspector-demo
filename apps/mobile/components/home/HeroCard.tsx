import { View, Text } from "react-native";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Svg, { Rect } from "react-native-svg";
import { TrendingUp } from "lucide-react-native";
import type { InspectionRow } from "@/lib/queries";
import { Card } from "@/components/ui/Card";

interface Props {
  /** Inspections already filtered by the selected Home dashboard date range. */
  inspections: InspectionRow[];
  /**
   * Inspections from the equal-length window immediately preceding the
   * active range — drives the small ↗ deltas under each KPI tile.
   */
  priorInspections?: InspectionRow[];
  dateLabel: string;
}

/**
 * Home dashboard summary block — ports the Field Inspector prototype's
 * Journey 2 body. Three parts:
 *   1. 2x2 KPI grid (Runs / Seeds / Avg length / Last run), plain white
 *      cards with hairlines and an optional green ↗ delta line.
 *   2. "Inspections today" Card with an inline 12-bucket SVG MiniBars
 *      chart (per-hour distribution) + 06:00 / 12:00 / 18:00 axis.
 *   3. "Variety mix" Card with a solid stacked bar in brand colors
 *      (purple/orange/green/yellow) + a 2-column legend.
 *
 * All four parts are deliberately untinted by default — tints belong on
 * grade chips, status pills, and small icon squares, not on full surfaces.
 *
 * KPI #4 ("Last run") and the delta values are computed from the same
 * `inspections` array the screen already supplies — no new data wiring.
 * Grade A % proxy uses `mean_length_mm >= GRADE_A_LENGTH_MM` since the
 * list projection does not include per-seed grades.
 */
const GRADE_A_LENGTH_MM = 7.0;

export function HeroCard({ inspections, priorInspections = [] }: Props) {
  const { t } = useTranslation("home");

  const totalSeeds = inspections.reduce((s, r) => s + (r.total_seeds ?? 0), 0);
  const weightedLength = weightedMean(
    inspections.map((row) => ({
      value: row.mean_length_mm,
      weight: row.total_seeds ?? 0,
    })),
  );
  const lastRun = formatLastRun(inspections[0]?.captured_at ?? null);

  // Deltas vs the prior equal-length window. Returned as already-formatted
  // strings (e.g. "+3" / "-12 / "+0.2") so the KpiCard can render them
  // directly. `null` means we don't have a comparable prior period (open
  // history or both periods empty) and the delta line is hidden.
  const priorSeeds = priorInspections.reduce((s, r) => s + (r.total_seeds ?? 0), 0);
  const priorAvgLength = weightedMean(
    priorInspections.map((row) => ({ value: row.mean_length_mm, weight: row.total_seeds ?? 0 })),
  );
  const runsDelta = formatCountDelta(inspections.length, priorInspections.length);
  const seedsDelta = formatCountDelta(totalSeeds, priorSeeds);
  const avgLengthDelta = formatFloatDelta(weightedLength, priorAvgLength, 2);
  const hourly = buildHourlyBuckets(inspections);
  const varieties = topVarieties(inspections, t("unassigned"));
  const totalVarietySeeds = varieties.reduce((s, v) => s + v.seeds, 0);

  return (
    <View className="gap-sm">
      {/* KPI grid — plain white cards, hairline border, UPPERCASE caption,
          big number + optional unit, optional green ↗ delta below. */}
      <View className="flex-row gap-sm">
        <KpiCard
          label={t("metricInspections")}
          value={inspections.length.toString()}
          delta={runsDelta}
        />
        <KpiCard label={t("metricSeeds")} value={totalSeeds.toLocaleString()} delta={seedsDelta} />
      </View>
      <View className="flex-row gap-sm">
        <KpiCard
          label={t("metricAvgLength")}
          value={
            weightedLength === null ? (
              "--"
            ) : (
              <>
                {weightedLength.toFixed(2)}
                <Text className="text-caption text-fg-tertiary"> mm</Text>
              </>
            )
          }
          delta={avgLengthDelta}
        />
        <KpiCard label={t("metricLastRun")} value={lastRun.value} sub={lastRun.sub} mono />
      </View>

      {/* Inspections today — per-hour MiniBars */}
      <Card className="px-lg py-md">
        <View className="flex-row items-baseline justify-between">
          <Text className="text-h4 font-semibold text-fg-primary">{t("trendTitle")}</Text>
          <Text className="text-[11px] font-semibold uppercase tracking-[0.6px] text-fg-tertiary">
            {t("trendEyebrow")}
          </Text>
        </View>
        <View className="mt-sm">
          <MiniBars data={hourly} height={48} />
          <View className="flex-row justify-between mt-[6px]">
            <Text className="text-[11px] font-semibold uppercase tracking-[0.4px] text-fg-tertiary">
              06:00
            </Text>
            <Text className="text-[11px] font-semibold uppercase tracking-[0.4px] text-fg-tertiary">
              12:00
            </Text>
            <Text className="text-[11px] font-semibold uppercase tracking-[0.4px] text-fg-tertiary">
              18:00
            </Text>
          </View>
        </View>
      </Card>

      {/* Variety mix — solid stacked bar in brand colors + 2-col legend */}
      <Card className="px-lg py-md">
        <Text className="text-h4 font-semibold text-fg-primary">{t("varietyMix")}</Text>
        {varieties.length > 0 && totalVarietySeeds > 0 ? (
          <>
            <View className="flex-row overflow-hidden mt-md" style={{ height: 8, borderRadius: 4 }}>
              {varieties.map((v, i) => {
                const pct = (v.seeds / totalVarietySeeds) * 100;
                if (pct <= 0) return null;
                return (
                  <View
                    key={v.name}
                    style={{ width: `${pct}%`, height: "100%", backgroundColor: BRAND[i] }}
                  />
                );
              })}
            </View>
            <View className="mt-sm flex-row flex-wrap">
              {varieties.map((v, i) => {
                const pct = Math.round((v.seeds / totalVarietySeeds) * 100);
                return (
                  <View
                    key={v.name}
                    className="flex-row items-center gap-[6px]"
                    style={{ width: "50%", paddingRight: 12, paddingVertical: 3 }}
                  >
                    <View
                      style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: BRAND[i] }}
                    />
                    <Text
                      className="flex-1 text-[13px] font-medium text-fg-primary"
                      numberOfLines={1}
                    >
                      {v.name}
                    </Text>
                    <Text className="text-caption text-fg-tertiary">{pct}%</Text>
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

// Solid brand-colour palette for the variety-mix stacked bar. Pulled directly
// from the prototype's MixRow swatches. Order matters: most-seeded variety
// gets the primary purple, next the orange, etc.
const BRAND = ["#6E40E0", "#E07B3F", "#4DAB6D", "#E0B842", "#E255A0"];

function KpiCard({
  label,
  value,
  sub,
  delta,
  mono,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  delta?: string | null;
  mono?: boolean;
}) {
  const negative = delta?.startsWith("-");
  return (
    <View className="flex-1 rounded-lg border border-line-tertiary bg-bg-primary px-md py-md">
      <Text className="text-[11px] font-semibold uppercase tracking-[0.6px] text-fg-tertiary">
        {label}
      </Text>
      <View className="flex-row items-baseline gap-xs mt-[6px]">
        <Text
          className={`font-semibold text-fg-primary ${mono ? "font-mono" : ""}`}
          style={{ fontSize: 24, letterSpacing: -0.4 }}
        >
          {value}
        </Text>
        {sub ? <Text className="text-caption text-fg-tertiary">{sub}</Text> : null}
      </View>
      {delta ? (
        <View className="flex-row items-center gap-[3px] mt-[4px]">
          <TrendingUp
            color={negative ? "#A02828" : "#4DAB6D"}
            size={12}
            strokeWidth={2.4}
            style={negative ? { transform: [{ scaleY: -1 }] } : undefined}
          />
          <Text
            className={`text-[11px] font-semibold ${negative ? "text-error" : "text-success-text"}`}
          >
            {delta}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Integer-delta formatter — returns null when there's nothing to compare. */
function formatCountDelta(current: number, prior: number): string | null {
  if (prior === 0 && current === 0) return null;
  const diff = current - prior;
  if (diff === 0) return null;
  return diff > 0 ? `+${diff}` : `${diff}`;
}

/** Float-delta formatter with N-digit precision; null when either side missing. */
function formatFloatDelta(
  current: number | null,
  prior: number | null,
  digits: number,
): string | null {
  if (current === null || prior === null) return null;
  const diff = current - prior;
  if (Math.abs(diff) < 0.05) return null;
  const formatted = Math.abs(diff).toFixed(digits);
  return diff > 0 ? `+${formatted}` : `-${formatted}`;
}

function MiniBars({ data, height }: { data: number[]; height: number }) {
  const max = Math.max(1, ...data);
  const w = 200;
  const gap = 4;
  const n = data.length;
  const bw = (w - gap * (n - 1)) / n;
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
      {data.map((d, i) => {
        const h = Math.max(2, (d / max) * (height - 4));
        return (
          <Rect
            key={i}
            x={i * (bw + gap)}
            y={height - h}
            width={bw}
            height={h}
            rx={2}
            fill="#6E40E0"
            opacity={i === n - 1 ? 1 : 0.55}
          />
        );
      })}
    </Svg>
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

function formatLastRun(iso: string | null): { value: string; sub?: string } {
  if (!iso) return { value: "--" };
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return { value: "now" };
  if (diffMin < 60) return { value: `${diffMin}m`, sub: "ago" };
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return { value: `${diffHr}h`, sub: "ago" };
  const diffD = Math.round(diffHr / 24);
  return { value: `${diffD}d`, sub: "ago" };
}

/**
 * Bucket inspections by hour-of-day for the most recent capture date.
 * The prototype chart shows 06:00 → 18:00 — a 12-hour fieldwork window,
 * so we project all captures' captured_at into the 6..18 slots and zero
 * out outliers. If the data has nothing in this window the chart still
 * renders flat which reads as "quiet day" rather than as a bug.
 */
function buildHourlyBuckets(inspections: InspectionRow[]): number[] {
  const buckets = Array.from({ length: 12 }, () => 0);
  for (const row of inspections) {
    const h = new Date(row.captured_at).getHours();
    if (h >= 6 && h <= 17) buckets[h - 6]++;
  }
  return buckets;
}

// GRADE_A_LENGTH_MM kept for downstream callers that still derive grade-A% —
// not used in HeroCard today.
export { GRADE_A_LENGTH_MM };

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
