import { useMemo, useState } from "react";
import { FlatList, View, Text, Pressable, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { ChevronRight, Search, X } from "lucide-react-native";
import type { Variety } from "@advance-seeds/types";
import { useVarieties, useInspections } from "@/lib/queries";
import { Segmented } from "@/components/ui/Segmented";
import { SkeletonList } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";

type FamilyKey = "all" | "corn" | "rice" | "legume" | "mungbean";
type VarietyListEntry =
  | { kind: "section"; key: string; familyKey: string }
  | { kind: "item"; key: string; variety: Variety; isFirst: boolean; isLast: boolean };

const FAMILY_TINTS: Record<string, { bg: string; fg: string }> = {
  corn: { bg: "#FAEEDA", fg: "#854F0B" },
  rice: { bg: "#EAF3DE", fg: "#3B6D11" },
  legume: { bg: "#E1F5EE", fg: "#0F6E56" },
  mungbean: { bg: "#FAECE7", fg: "#993C1D" },
};

/**
 * Varieties tab — read-only catalog browser.
 *
 * Mirrors the prototype's segmented filter + grouped sections. Tapping a
 * row routes to /varieties/[id] (the public read-only detail page); the
 * detail page exposes an admin Edit button that jumps to the unified
 * editor at /more/capture-classes/[id]. CRUD lives entirely in More →
 * Reference → Varieties so this tab stays a pure browse surface.
 *
 * Reference dimensions on each row are *observed* — averaged from this
 * variety's recent inspections. The new master-data form lets admins set
 * spec-level reference dims (`ref_length_mm`, `ref_width_mm`); a future
 * pass can prefer those over the observed averages here.
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
        { kind: "section", key: `section-${familyKey}`, familyKey },
        ...items.map((variety, idx) => ({
          kind: "item" as const,
          key: variety.id,
          variety,
          isFirst: idx === 0,
          isLast: idx === items.length - 1,
        })),
      ]),
    [grouped],
  );

  const segmentOptions: Array<{ value: FamilyKey; label: string }> = [
    { value: "all", label: t("library:segments.all") },
    { value: "corn", label: t("library:segments.corn") },
    { value: "rice", label: t("library:segments.rice") },
    { value: "legume", label: t("library:segments.legume") },
    { value: "mungbean", label: t("library:segments.mungbean") },
  ];

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top"]}>
      <FlatList
        data={listData}
        keyExtractor={(item) => item.key}
        contentContainerClassName="px-xl py-md"
        keyboardShouldPersistTaps="handled"
        initialNumToRender={14}
        maxToRenderPerBatch={14}
        windowSize={9}
        removeClippedSubviews
        ListHeaderComponent={
          <View className="gap-md mb-md">
            <Text className="text-h1 font-medium text-fg-primary">{t("varieties:title")}</Text>

            <View className="flex-row items-center gap-sm rounded-xl bg-bg-primary border border-line-tertiary px-md py-sm">
              <Search color="#9D9D9A" size={16} />
              <TextInput
                placeholder={t("library:searchPlaceholder")}
                placeholderTextColor="#9D9D9A"
                value={query}
                onChangeText={setQuery}
                className="flex-1 text-body text-fg-primary"
                returnKeyType="search"
              />
              {query ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("common:actions.cancel")}
                  onPress={() => setQuery("")}
                >
                  <X color="#9D9D9A" size={16} />
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
            <Text className="text-caption text-fg-secondary px-xs mt-md mb-xs">
              {t(`library:sections.${item.familyKey}`)}
            </Text>
          ) : (
            <VarietyRow
              variety={item.variety}
              isFirst={item.isFirst}
              isLast={item.isLast}
              observed={observed.get(item.variety.id)}
              onPress={() => router.push(`/varieties/${item.variety.id}`)}
            />
          )
        }
        ListEmptyComponent={
          isLoading ? (
            <SkeletonList rows={5} rowHeight={64} />
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
  isFirst: boolean;
  isLast: boolean;
  observed: { l: number; w: number; n: number } | undefined;
  onPress: () => void;
}

function VarietyRow({ variety, isFirst, isLast, observed, onPress }: RowProps) {
  const { t } = useTranslation(["library"]);
  const tint = FAMILY_TINTS[variety.color_key ?? ""] ?? FAMILY_TINTS.rice;
  const dims = observed
    ? t("library:dimensionsObserved", {
        l: observed.l.toFixed(1),
        w: observed.w.toFixed(1),
      })
    : t("library:dimensionsPending");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={variety.name}
      onPress={onPress}
      className={`flex-row items-center gap-md bg-bg-primary px-lg py-md ${
        isFirst ? "rounded-t-2xl" : ""
      } ${isLast ? "rounded-b-2xl" : "border-b border-line-tertiary"}`}
    >
      <View
        className="items-center justify-center"
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: tint.bg,
        }}
      >
        <Text className="font-medium" style={{ color: tint.fg, fontSize: 14 }}>
          {variety.name.charAt(0)}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-title text-fg-primary font-medium" numberOfLines={1}>
          {variety.name}
        </Text>
        <Text className="text-caption text-fg-secondary mt-xs" numberOfLines={1}>
          {dims}
        </Text>
      </View>
      <ChevronRight color="#9D9D9A" size={16} />
    </Pressable>
  );
}

function groupByFamily(items: Variety[]) {
  const FAMILY_ORDER: Array<Exclude<FamilyKey, "all">> = ["corn", "rice", "legume", "mungbean"];
  const buckets = new Map<string, Variety[]>();
  for (const v of items) {
    const key = v.color_key ?? "rice";
    const list = buckets.get(key) ?? [];
    list.push(v);
    buckets.set(key, list);
  }
  return FAMILY_ORDER.flatMap((f) => {
    const list = buckets.get(f);
    if (!list || list.length === 0) return [];
    return [{ familyKey: f, items: list }];
  });
}
