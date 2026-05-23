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

type FilterKey = "all" | "mapped" | "unmapped" | "active" | "inactive";

/**
 * Capture-class master-data list.
 *
 * Visual layer mirrors the Field Inspector redesign prototype's
 * `AdminCaptureClassesScreen`: a pill-shaped search field on the screen
 * surface (not inside a card), followed by an All / Mapped / Unmapped
 * tag-style segmented row whose active option is ink-black. The list
 * itself is a flat sequence of full-bleed rows separated by hairlines —
 * no surrounding row card. Each row shows the variety name, a mono
 * scientific name, and three boolean status chips (class / grade /
 * ref dim) that summarise the editable reference state.
 *
 * Tapping a row routes to `/more/capture-classes/<id>` for editing; the
 * top-right `+` routes to `/more/capture-classes/new` for creating.
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

  // Pre-sort once (active first, then alpha) and derive counts before
  // filter is applied so the segmented row stays stable as the user
  // types a search query.
  const baseSorted = useMemo(() => {
    const rows = data ?? [];
    return rows.slice().sort((a, b) => {
      const activeRank = Number(b.is_active !== false) - Number(a.is_active !== false);
      if (activeRank !== 0) return activeRank;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }, [data]);

  const counts = useMemo(() => {
    let mapped = 0;
    let unmapped = 0;
    let active = 0;
    let inactive = 0;
    for (const v of baseSorted) {
      if (isMapped(v.coco_class_id)) mapped += 1;
      else unmapped += 1;
      if (v.is_active !== false) active += 1;
      else inactive += 1;
    }
    return { all: baseSorted.length, mapped, unmapped, active, inactive };
  }, [baseSorted]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return baseSorted.filter((v) => {
      const mapped = isMapped(v.coco_class_id);
      const active = v.is_active !== false;
      if (filter === "mapped" && !mapped) return false;
      if (filter === "unmapped" && mapped) return false;
      if (filter === "active" && !active) return false;
      if (filter === "inactive" && active) return false;
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
    {
      value: "active",
      label: t("more:masterData.filterWithCount", {
        label: t("varieties:status.active"),
        count: counts.active,
      }),
    },
    {
      value: "inactive",
      label: t("more:masterData.filterWithCount", {
        label: t("varieties:status.inactive"),
        count: counts.inactive,
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

      {/* Search lives on the screen surface, not inside a card. Pill-shaped
          bg-secondary fill with a magnifier, matching the prototype shot. */}
      <View className="px-xl pt-xs pb-md gap-md bg-bg-primary">
        <View className="flex-row items-center gap-sm rounded-full bg-bg-secondary px-md h-11">
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
            const hasGrade = hasGradeCriteria(variety.grade_criteria);
            const hasRef = Boolean(variety.ref_length_mm && variety.ref_width_mm);
            const active = variety.is_active !== false;
            return (
              <Pressable
                key={variety.id}
                accessibilityRole="button"
                accessibilityLabel={variety.name}
                onPress={() => router.push(`/more/capture-classes/${variety.id}` as never)}
                disabled={!editable}
                className={`flex-row items-center gap-md bg-bg-primary px-xl py-md ${
                  isLast ? "" : "border-b border-line-tertiary"
                } ${active ? "" : "opacity-60"}`}
              >
                <View className="flex-1 min-w-0">
                  <View className="flex-row items-center gap-sm">
                    <Text
                      className="text-title font-medium text-fg-primary flex-shrink"
                      numberOfLines={1}
                    >
                      {variety.name}
                    </Text>
                    {active ? null : <Pill tone="warning" label={t("varieties:status.inactive")} />}
                  </View>
                  {variety.scientific_name ? (
                    <Text
                      className="text-caption font-mono text-fg-secondary mt-xs"
                      numberOfLines={1}
                    >
                      {variety.scientific_name}
                    </Text>
                  ) : null}
                  <View className="flex-row flex-wrap gap-xs mt-sm">
                    <StatusChip
                      ok={mapped}
                      label={t("more:masterData.chips.class", { defaultValue: "class" })}
                    />
                    <StatusChip
                      ok={hasGrade}
                      label={t("more:masterData.chips.grade", { defaultValue: "grade" })}
                    />
                    <StatusChip
                      ok={hasRef}
                      label={t("more:masterData.chips.refDim", { defaultValue: "ref dim" })}
                    />
                  </View>
                </View>
                {editable ? <ChevronRight color="#8C8C87" size={16} /> : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Compact boolean status chip used inside list rows. Renders green (ok)
 * or orange (missing) with a leading dot, mirroring the prototype's
 * `BoolChip` (`fi-tag fi-tag-green` / `fi-tag fi-tag-orange`). We reuse
 * the shared `Pill` primitive with a `dot` to stay token-driven.
 */
function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return <Pill tone={ok ? "success" : "warning"} dot label={label} />;
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
