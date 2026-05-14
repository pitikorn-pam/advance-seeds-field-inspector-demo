import { useMemo, useState } from "react";
import { ScrollView, View, Text, Pressable, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react-native";
import { useAuth } from "@/lib/auth";
import { policyFor } from "@/lib/access";
import { useVarieties } from "@/lib/queries";
import { Pill } from "@/components/ui/Pill";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { Segmented } from "@/components/ui/Segmented";
import { SkeletonList } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { DEFAULT_CAPTURE_CLASSES } from "@/lib/analyzer/captureClasses";

type FilterKey = "all" | "mapped" | "unmapped";

/**
 * Capture-class master-data list.
 *
 * Visual layer mirrors the Field Inspector redesign prototype's
 * `AdminCaptureClassesScreen`: search field, then an All / Mapped /
 * Unmapped filter row over a flat list whose rows expose the row's
 * mapped/unmapped state via a status `Pill` plus a tap-to-edit chevron.
 *
 * Tapping a row routes to `/more/capture-classes/<id>` for editing; the
 * top-right `+` routes to `/more/capture-classes/new` for creating. The
 * form lives on its own page so a long variety list doesn't squeeze the
 * editor below the fold.
 */
export default function CaptureClassesScreen() {
  const { t } = useTranslation(["common", "varieties", "more"]);
  const router = useRouter();
  const { profile } = useAuth();
  const policy = policyFor(profile);
  const { data, isLoading, isError, refetch } = useVarieties();
  const editable = policy.canEditVariety();
  const canCreate = policy.canCreateVariety();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  // Pre-sort once (mapped first, then alpha) and derive counts before
  // filter is applied so the segmented row stays stable as the user
  // types a search query.
  const baseSorted = useMemo(() => {
    const rows = data ?? [];
    return rows.slice().sort((a, b) => {
      const aMapped = isMapped(a.coco_class_id);
      const bMapped = isMapped(b.coco_class_id);
      if (aMapped !== bMapped) return aMapped ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [data]);

  const counts = useMemo(() => {
    let mapped = 0;
    let unmapped = 0;
    for (const v of baseSorted) {
      if (isMapped(v.coco_class_id)) mapped += 1;
      else unmapped += 1;
    }
    return { all: baseSorted.length, mapped, unmapped };
  }, [baseSorted]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return baseSorted.filter((v) => {
      const mapped = isMapped(v.coco_class_id);
      if (filter === "mapped" && !mapped) return false;
      if (filter === "unmapped" && mapped) return false;
      if (!q) return true;
      // Match name, scientific name, OR the resolved COCO class label so
      // searching "apple" or "47" both find the right row.
      const cocoLabel = labelForCocoId(v.coco_class_id) ?? "";
      const hay =
        `${v.name} ${v.scientific_name ?? ""} ${cocoLabel} ${v.coco_class_id ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [baseSorted, filter, query]);

  const segmentOptions: Array<{ value: FilterKey; label: string }> = [
    {
      value: "all",
      label: t("more:masterData.filterWithCount", {
        label: t("more:masterData.filters.all"),
        count: counts.all,
      }),
    },
    {
      value: "mapped",
      label: t("more:masterData.filterWithCount", {
        label: t("more:masterData.filters.mapped"),
        count: counts.mapped,
      }),
    },
    {
      value: "unmapped",
      label: t("more:masterData.filterWithCount", {
        label: t("more:masterData.filters.unmapped"),
        count: counts.unmapped,
      }),
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-bg-primary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("more:masterData.varieties")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#171717" size={20} />,
          onPress: () => router.back(),
        }}
        right={
          canCreate
            ? {
                accessibilityLabel: t("varieties:newVariety"),
                renderIcon: () => <Plus color="#171717" size={20} />,
                onPress: () => router.push("/more/capture-classes/new" as never),
              }
            : undefined
        }
      />

      <View className="border-b border-line-tertiary px-xl pt-xs pb-md gap-md bg-bg-primary">
        <View className="flex-row items-center gap-sm rounded-md bg-bg-secondary border border-line-tertiary px-md h-11">
          <Search color="#8C8C87" size={18} />
          <TextInput
            placeholder={t("more:masterData.searchPlaceholder")}
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

        <Segmented<FilterKey>
          value={filter}
          onChange={setFilter}
          options={segmentOptions}
          scrollable
          variant="tag"
        />
      </View>

      <ScrollView contentContainerClassName="pb-2xl">
        {isLoading ? (
          <View className="px-xl pt-lg">
            <SkeletonList rows={5} rowHeight={72} />
          </View>
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : visible.length === 0 ? (
          <EmptyState hint={t("varieties:empty")} />
        ) : (
          visible.map((variety, idx) => {
            const isLast = idx === visible.length - 1;
            const mapped = isMapped(variety.coco_class_id);
            const cocoName = labelForCocoId(variety.coco_class_id);
            return (
              <Pressable
                key={variety.id}
                accessibilityRole="button"
                accessibilityLabel={variety.name}
                onPress={() => router.push(`/more/capture-classes/${variety.id}` as never)}
                disabled={!editable}
                className={`flex-row items-center gap-md bg-bg-primary px-xl py-md ${
                  isLast ? "" : "border-b border-line-tertiary"
                } ${variety.is_active ? "" : "opacity-60"}`}
              >
                <View className="flex-1">
                  <View className="flex-row items-center gap-sm">
                    <Text
                      className="text-title font-medium text-fg-primary flex-shrink"
                      numberOfLines={1}
                    >
                      {variety.name}
                    </Text>
                    {variety.is_active ? null : (
                      <Pill tone="warning" label={t("varieties:status.inactive")} />
                    )}
                  </View>
                  {variety.scientific_name ? (
                    <Text className="text-caption text-fg-secondary italic mt-xs" numberOfLines={1}>
                      {variety.scientific_name}
                    </Text>
                  ) : null}
                  <Text className="text-caption text-fg-tertiary mt-xs" numberOfLines={1}>
                    {cocoName
                      ? t("more:masterData.classRow", {
                          klass: cocoName,
                          id: variety.coco_class_id,
                        })
                      : t("more:masterData.unmapped")}
                    {hasGradeCriteria(variety.grade_criteria)
                      ? ` · ${t("more:masterData.gradeCriteriaSet")}`
                      : variety.ref_length_mm && variety.ref_width_mm
                        ? ` · ${t("more:masterData.refDims", {
                            l: variety.ref_length_mm,
                            w: variety.ref_width_mm,
                          })}`
                        : ""}
                  </Text>
                </View>
                <Pill
                  tone={mapped ? "success" : "warning"}
                  label={t(mapped ? "more:masterData.mappedPill" : "more:masterData.unmappedPill")}
                />
                {editable ? <ChevronRight color="#8C8C87" size={16} /> : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function isMapped(id: number | null | undefined): boolean {
  return id !== null && id !== undefined;
}

function labelForCocoId(id: number | null | undefined): string | null {
  if (id === null || id === undefined) return null;
  return DEFAULT_CAPTURE_CLASSES.find((c) => c.cocoClassId === id)?.name ?? `class ${id}`;
}

function hasGradeCriteria(criteria: unknown): boolean {
  return Boolean(criteria && typeof criteria === "object" && Object.keys(criteria).length > 0);
}
