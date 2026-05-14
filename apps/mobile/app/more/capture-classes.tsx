import { useMemo, useState } from "react";
import { ScrollView, View, Text, Pressable, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight, Plus, Search, Sparkles, X } from "lucide-react-native";
import { useAuth } from "@/lib/auth";
import { policyFor } from "@/lib/access";
import { useVarieties } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { SkeletonList } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { DEFAULT_CAPTURE_CLASSES } from "@/lib/analyzer/captureClasses";

/**
 * Capture-class master-data list.
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

  const sorted = useMemo(() => {
    const rows = data ?? [];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter((v) => {
          // Match name, scientific name, OR the resolved COCO class label so
          // searching "apple" or "47" both find the right row.
          const cocoLabel = labelForCocoId(v.coco_class_id) ?? "";
          const hay =
            `${v.name} ${v.scientific_name ?? ""} ${cocoLabel} ${v.coco_class_id ?? ""}`.toLowerCase();
          return hay.includes(q);
        })
      : rows;
    return filtered.slice().sort((a, b) => {
      const aMapped = a.coco_class_id !== null && a.coco_class_id !== undefined;
      const bMapped = b.coco_class_id !== null && b.coco_class_id !== undefined;
      if (aMapped !== bMapped) return aMapped ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [data, query]);

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
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
      <ScrollView contentContainerClassName="px-xl py-md gap-md">
        <View className="flex-row items-center gap-sm rounded-lg bg-bg-primary border border-line-tertiary px-md py-sm">
          <Search color="#8C8C87" size={16} />
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

        {isLoading ? (
          <SkeletonList rows={5} rowHeight={64} />
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : sorted.length === 0 ? (
          <EmptyState hint={t("varieties:empty")} />
        ) : (
          <Card className="p-0">
            {sorted.map((variety, idx) => {
              const isLast = idx === sorted.length - 1;
              const cocoName = labelForCocoId(variety.coco_class_id);
              return (
                <Pressable
                  key={variety.id}
                  accessibilityRole="button"
                  accessibilityLabel={variety.name}
                  onPress={() => router.push(`/more/capture-classes/${variety.id}` as never)}
                  disabled={!editable}
                  className={`flex-row items-center gap-md px-lg py-md ${isLast ? "" : "border-b border-line-tertiary"}`}
                >
                  <View
                    className="items-center justify-center"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: cocoName ? "#DFF6EC" : "#F2F1ED",
                    }}
                  >
                    <Sparkles color={cocoName ? "#6C47FF" : "#8C8C87"} size={16} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-title text-fg-primary">{variety.name}</Text>
                    <Text className="text-caption text-fg-secondary">
                      {cocoName
                        ? t("more:masterData.classRow", {
                            klass: cocoName,
                            id: variety.coco_class_id,
                          })
                        : t("more:masterData.unmapped")}
                    </Text>
                  </View>
                  <View className="items-end gap-[2px]">
                    <Pill
                      tone={variety.is_active ? "success" : "warning"}
                      label={t(
                        variety.is_active ? "varieties:status.active" : "varieties:status.inactive",
                      )}
                    />
                    {hasGradeCriteria(variety.grade_criteria) ? (
                      <Pill tone="neutral" label={t("more:masterData.gradeCriteriaSet")} />
                    ) : variety.ref_length_mm && variety.ref_width_mm ? (
                      <Pill
                        tone="neutral"
                        label={t("more:masterData.refDims", {
                          l: variety.ref_length_mm,
                          w: variety.ref_width_mm,
                        })}
                      />
                    ) : (
                      <Text className="text-caption text-fg-tertiary">
                        {t("more:masterData.noRefDims")}
                      </Text>
                    )}
                  </View>
                  {editable ? <ChevronRight color="#8C8C87" size={16} /> : null}
                </Pressable>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function labelForCocoId(id: number | null | undefined): string | null {
  if (id === null || id === undefined) return null;
  return DEFAULT_CAPTURE_CLASSES.find((c) => c.cocoClassId === id)?.name ?? `class ${id}`;
}

function hasGradeCriteria(criteria: unknown): boolean {
  return Boolean(criteria && typeof criteria === "object" && Object.keys(criteria).length > 0);
}
