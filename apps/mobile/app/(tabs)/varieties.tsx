import { useMemo, useState } from "react";
import { FlatList, View, Text, Pressable, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { ChevronRight, Search, X } from "lucide-react-native";
import type { Variety } from "@advance-seeds/types";
import { useVarieties, useInspections } from "@/lib/queries";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { SkeletonList } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";

/**
 * Varieties tab — read-only catalog browser.
 *
 * AppTopBar with title, a pill-shaped search field on the off-white surface,
 * then full-bleed list rows with neutral variety thumbnails.
 * Data wiring (useVarieties / useInspections / navigation) is unchanged.
 */
export default function LibraryTab() {
  const { t } = useTranslation(["common", "varieties", "library"]);
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useVarieties();
  const inspections = useInspections();
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((v) => {
      if (v.is_active === false) return false;
      if (!q) return true;
      const hay = v.name.toLowerCase();
      return hay.includes(q);
    });
  }, [data, query]);

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top"]}>
      <AppTopBar title={t("varieties:title")} />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerClassName="pb-2xl"
        keyboardShouldPersistTaps="handled"
        initialNumToRender={14}
        maxToRenderPerBatch={14}
        windowSize={9}
        removeClippedSubviews
        ListHeaderComponent={
          <View className="px-xl pt-xs pb-md">
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
          </View>
        }
        renderItem={({ item, index }) => (
          <VarietyRow
            variety={item}
            isLast={index === filtered.length - 1}
            observed={observed.get(item.id)}
            onPress={() => router.push(`/varieties/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          isLoading ? (
            <View className="px-xl pt-lg">
              <SkeletonList rows={5} rowHeight={64} />
            </View>
          ) : isError ? (
            <ErrorState onRetry={() => void refetch()} />
          ) : filtered.length === 0 ? (
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
      <View className="h-11 w-11 items-center justify-center rounded-md bg-bg-tertiary border border-line-tertiary">
        <Text className="text-title font-semibold text-fg-secondary">
          {variety.name.trim().charAt(0).toUpperCase() || "?"}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-title font-medium text-fg-primary" numberOfLines={1}>
          {variety.name}
        </Text>
        <Text className="text-caption text-fg-secondary mt-xs" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <ChevronRight color="#8C8C87" size={16} />
    </Pressable>
  );
}
