import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Path } from "react-native-svg";
import type { InspectionRow } from "@/lib/queries";

interface Props {
  /** Today's inspections (already filtered to start-of-today). */
  todayInspections: InspectionRow[];
}

/**
 * Brand-deep hero card showing today's inspection stats. Mirrors the
 * prototype's `.hero-card` element — dark green surface, large headline
 * number, sub-caption, and a decorative sparkline at the bottom.
 *
 * The number is total seeds inspected today (sum of total_seeds across
 * today's rows). Batches today is a distinct-count of batch_id. The
 * sparkline is decorative — a real per-hour aggregation would require
 * either a Supabase RPC or all of today's seed rows; both feel out of
 * scope for a v0.2 home screen, and the prototype's sparkline is
 * non-interactive anyway.
 *
 * Empty state: when today has 0 inspections, the headline reads "Today: 0"
 * and the sub-caption falls back to a static encouragement string. The
 * sparkline still renders so the layout doesn't collapse.
 */
export function HeroCard({ todayInspections }: Props) {
  const { t } = useTranslation("home");

  const totalSeeds = todayInspections.reduce((s, r) => s + (r.total_seeds ?? 0), 0);
  const batchesToday = new Set(
    todayInspections.map((r) => r.batch_id).filter((id): id is string => !!id),
  ).size;
  const isEmpty = todayInspections.length === 0;

  return (
    <View className="rounded-2xl px-xl py-lg" style={{ backgroundColor: "#04342C" }}>
      <Text className="text-white/70 text-caption uppercase" style={{ letterSpacing: 0.4 }}>
        {t("heroLabel")}
      </Text>
      <Text
        className="text-white font-medium mt-xs"
        style={{ fontSize: 44, letterSpacing: -1.2, lineHeight: 48 }}
      >
        {isEmpty ? "0" : totalSeeds.toLocaleString()}
      </Text>
      <Text className="text-white/70 mt-xs" style={{ fontSize: 13 }}>
        {isEmpty
          ? t("heroSubtitleEmpty")
          : t("heroSubtitle", {
              seeds: totalSeeds,
              batches: batchesToday,
            })}
      </Text>

      <View className="mt-md">
        <Sparkline />
      </View>
    </View>
  );
}

/**
 * Decorative line chart. The prototype uses a hardcoded SVG path; we keep
 * the same shape for visual parity. A real data-bound chart can replace
 * this when per-hour aggregation arrives — the surrounding layout is
 * sized for a 36 px-tall path so the swap is visual-only.
 */
function Sparkline() {
  return (
    <Svg width="100%" height={36} viewBox="0 0 280 36" preserveAspectRatio="none">
      <Path
        d="M0,28 L25,24 L50,26 L75,18 L100,20 L125,12 L150,14 L175,8 L200,10 L225,4 L250,6 L280,2"
        fill="none"
        stroke="rgba(255,255,255,0.7)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
