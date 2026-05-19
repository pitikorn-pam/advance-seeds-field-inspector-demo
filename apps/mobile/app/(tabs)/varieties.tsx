import { useMemo, useState } from "react";
import { FlatList, View, Text, Pressable, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { ChevronRight, Search, X } from "lucide-react-native";
import Svg, { Ellipse } from "react-native-svg";
import type { Variety } from "@advance-seeds/types";
import { useVarieties, useInspections } from "@/lib/queries";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { Segmented } from "@/components/ui/Segmented";
import { SkeletonList } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";

type FamilyKey = "all" | "corn" | "rice" | "legume" | "mungbean";
type VarietyFamily = Exclude<FamilyKey, "all">;
type VarietyListEntry =
  | { kind: "section"; key: string; familyKey: VarietyFamily; count: number }
  | { kind: "item"; key: string; variety: Variety; isLast: boolean };

// Family tint classes — token-driven, never use legacy #6C47FF.
// Resolved from `bg-{family}-bg` and `text-{family}-text` Tailwind utilities.
const FAMILY_CLASSES: Record<VarietyFamily, { thumb: string; ink: string }> = {
  corn: { thumb: "bg-corn-bg", ink: "text-corn-text" },
  rice: { thumb: "bg-rice-bg", ink: "text-rice-text" },
  legume: { thumb: "bg-legume-bg", ink: "text-legume-text" },
  mungbean: { thumb: "bg-mungbean-bg", ink: "text-mungbean-text" },
};

// Resolved CSS-var hex for the seed-dot SVG fill — kept in step with
// global.css `--as-{family}-text`. SVG `fill` cannot consume Tailwind
// classes, so a small hex map mirrors the token's resolved colour.
const FAMILY_INK_HEX: Record<VarietyFamily, string> = {
  corn: "#704B00",
  rice: "#0F6E56",
  legume: "#3F249B",
  mungbean: "#8C3C12",
};

/**
 * Varieties tab — read-only catalog browser.
 *
 * Visual layer mirrors the Field Inspector redesign prototype:
 * AppTopBar with title and a magnifier action, a pill-shaped search field
 * on the off-white surface, family chip row (active = solid black), then
 * grouped sections rendered as full-bleed list rows with hairlines and a
 * single tinted seed-dot thumb per row.
 * Data wiring (useVarieties / useInspections / navigation) is unchanged.
 */
export default function LibraryTab() {
  const { t } = useTranslation(["common", "varieties", "library"]);
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useVarieties();
  const inspections = useInspections();
  const [family, setFamily] = useState<FamilyKey>("all");
  const [query, setQuery] = useState("");

  const observed = useMemo(() => {
    const byVariety = new Map<string, { lengths: number[]; widths: number[] }>();
    for (const row of inspections.data ?? []) {
      const id = row.variety_id;
      if (!id || row.mean_length_mm === null || row.mean_width_mm === null) continue;
      const entry = byVariety.get(id) ?? { lengths: [], widths: [] };
      entry.lengths.push(Number(row.mean_length_mm));
      entry.widths.push(Number(row.mean_width_mm));
      byVariety.set(id, entry);
    }
    const result = new Map<string, { l: number; w: number; n: number }>();
    for (const [id, { lengths, widths }] of byVariety) {
      const l = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      const w = widths.reduce((a, b) => a + b, 0) / widths.length;
      result.set(id, { l, w, n: lengths.length });
    }
    return result;
  }, [inspections.data]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (data ?? []).filter((v) => {
      if (v.is_active === false) return false;
      if (family !== "all" && v.color_key !== family) return false;
      if (!q) return true;
      const hay = `${v.name} ${v.scientific_name ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
    return groupByFamily(filtered);
  }, [data, family, query]);

  const listData = useMemo<VarietyListEntry[]>(
    () =>
      grouped.flatMap(({ familyKey, items }) => [
        {
          kind: "section" as const,
          key: `section-${familyKey}`,
          familyKey,
          count: items.length,
        },
        ...items.map((variety, idx) => ({
          kind: "item" as const,
          key: variety.id,
          variety,
          isLast: idx === items.length - 1,
        })),
      ]),
    [grouped],
  );

  const segmentOptions: Array<{ value: FamilyKey; label: string }> = [
    { value: "all", label: t("library:segments.all") },
    { value: "rice", label: t("library:segments.rice") },
    { value: "corn", label: t("library:segments.corn") },
    { value: "legume", label: t("library:segments.legume") },
    { value: "mungbean", label: t("library:segments.mungbean") },
  ];

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top"]}>
      <AppTopBar title={t("varieties:title")} />
      <FlatList
        data={listData}
        keyExtractor={(item) => item.key}
        contentContainerClassName="pb-2xl"
        keyboardShouldPersistTaps="handled"
        initialNumToRender={14}
        maxToRenderPerBatch={14}
        windowSize={9}
        removeClippedSubviews
        ListHeaderComponent={
          <View className="px-xl pt-xs pb-md gap-sm">
            <View className="flex-row items-center gap-sm rounded-full bg-bg-primary px-md h-11 border border-line-tertiary">
              <Search color="#8C8C87" size={18} />
              <TextInput
                placeholder={t("library:searchPlaceholder")}
                placeholderTextColor="#8C8C87"
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                autoCorrect={false}
                className="flex-1 text-body text-fg-primary"
                returnKeyType="search"
              />
              {query ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("common:actions.cancel")}
                  onPress={() => setQuery("")}
                >
                  <X color="#8C8C87" size={16} />
                </Pressable>
              ) : null}
            </View>

            <Segmented<FamilyKey>
              value={family}
              onChange={setFamily}
              options={segmentOptions}
              scrollable
              variant="tag"
            />
          </View>
        }
        renderItem={({ item }) =>
          item.kind === "section" ? (
            <View className="flex-row items-baseline justify-between px-xl pt-lg pb-xs">
              <Text className="text-caption font-medium uppercase tracking-wide text-fg-secondary">
                {t(`library:sections.${item.familyKey}`)}
              </Text>
              <Text className="text-caption text-fg-tertiary">{item.count}</Text>
            </View>
          ) : (
            <VarietyRow
              variety={item.variety}
              isLast={item.isLast}
              observed={observed.get(item.variety.id)}
              onPress={() => router.push(`/varieties/${item.variety.id}`)}
            />
          )
        }
        ListEmptyComponent={
          isLoading ? (
            <View className="px-xl pt-lg">
              <SkeletonList rows={5} rowHeight={64} />
            </View>
          ) : isError ? (
            <ErrorState onRetry={() => void refetch()} />
          ) : grouped.length === 0 ? (
            <EmptyState hint={t("varieties:empty")} />
          ) : null
        }
      />
    </SafeAreaView>
  );
}

interface RowProps {
  variety: Variety;
  isLast: boolean;
  observed: { l: number; w: number; n: number } | undefined;
  onPress: () => void;
}

function VarietyRow({ variety, isLast, observed, onPress }: RowProps) {
  const { t } = useTranslation(["library"]);
  const familyKey: VarietyFamily =
    (variety.color_key as VarietyFamily | null | undefined) && variety.color_key! in FAMILY_CLASSES
      ? (variety.color_key as VarietyFamily)
      : "rice";
  const classes = FAMILY_CLASSES[familyKey];
  const inkHex = FAMILY_INK_HEX[familyKey];
  const subtitle = observed
    ? t("library:row.refDims", {
        l: observed.l.toFixed(1),
        w: observed.w.toFixed(1),
      })
    : t("library:row.refPending");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={variety.name}
      onPress={onPress}
      className={`flex-row items-center gap-md px-xl py-md ${
        isLast ? "" : "border-b border-line-tertiary"
      }`}
    >
      <View className={`h-11 w-11 items-center justify-center rounded-md ${classes.thumb}`}>
        <SeedDotIcon color={inkHex} size={44} />
      </View>
      <View className="flex-1">
        <Text className="text-title font-medium text-fg-primary" numberOfLines={1}>
          {variety.name}
        </Text>
        <Text className="text-caption text-fg-secondary mt-xs" numberOfLines={1}>
          {variety.scientific_name ? (
            <Text className="italic">{variety.scientific_name}</Text>
          ) : null}
          {variety.scientific_name ? " · " : ""}
          {subtitle}
        </Text>
      </View>
      {observed ? (
        <View className="items-end mr-sm">
          <Text className="text-title font-medium text-fg-primary tabular-nums">{observed.n}</Text>
          <Text className="text-caption text-fg-tertiary mt-xs">{t("library:row.sevenDay")}</Text>
        </View>
      ) : null}
      <ChevronRight color="#8C8C87" size={16} />
    </Pressable>
  );
}

/**
 * Seed-dot thumbnail icon — four tilted ellipses mirroring the prototype's
 * `VarietyIcon`. Rendered inside a tinted square so the dots read at small
 * sizes regardless of the family colour.
 */
function SeedDotIcon({ color, size = 44 }: { color: string; size?: number }) {
  const dots: Array<[number, number, number]> = [
    [10, 12, 0],
    [22, 16, 30],
    [16, 26, 60],
    [28, 28, 90],
  ];
  return (
    <Svg viewBox="0 0 44 44" width={size} height={size}>
      {dots.map(([x, y, r], i) => (
        <Ellipse
          key={i}
          cx={x}
          cy={y}
          rx={3.5}
          ry={2.2}
          fill={color}
          opacity={0.45}
          transform={`rotate(${r} ${x} ${y})`}
        />
      ))}
    </Svg>
  );
}

function groupByFamily(items: Variety[]) {
  const FAMILY_ORDER: VarietyFamily[] = ["rice", "corn", "legume", "mungbean"];
  const buckets = new Map<VarietyFamily, Variety[]>();
  for (const v of items) {
    const key = (v.color_key as VarietyFamily) ?? "rice";
    const bucketKey: VarietyFamily = key in FAMILY_CLASSES ? key : "rice";
    const list = buckets.get(bucketKey) ?? [];
    list.push(v);
    buckets.set(bucketKey, list);
  }
  return FAMILY_ORDER.flatMap((f) => {
    const list = buckets.get(f);
    if (!list || list.length === 0) return [];
    return [{ familyKey: f, items: list }];
  });
}
