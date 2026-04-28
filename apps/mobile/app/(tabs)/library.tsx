import { useMemo, useState } from "react";
import { ScrollView, View, Text, Alert, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Plus, Pencil, Trash2, ChevronRight } from "lucide-react-native";
import type { Variety } from "@advance-seeds/types";
import { useAuth } from "@/lib/auth";
import { policyFor } from "@/lib/access";
import { useVarieties, useUpsertVariety, useDeleteVariety, useInspections } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";

type FamilyKey = "all" | "corn" | "rice" | "legume" | "mungbean";

const FAMILY_TINTS: Record<string, { bg: string; fg: string }> = {
  corn: { bg: "#FAEEDA", fg: "#854F0B" },
  rice: { bg: "#EAF3DE", fg: "#3B6D11" },
  legume: { bg: "#E1F5EE", fg: "#0F6E56" },
  mungbean: { bg: "#FAECE7", fg: "#993C1D" },
};

interface FormState {
  id?: string;
  name: string;
  scientific_name: string;
  description: string;
  image_url: string;
  color_key: string;
}
const empty: FormState = {
  name: "",
  scientific_name: "",
  description: "",
  image_url: "",
  color_key: "rice",
};

/**
 * Library tab — varieties browser. Mirrors the prototype's segmented
 * filter + grouped sections (prototype-fidelity-pass D6).
 *
 * Each section is one variety family (corn / rice / legume / mungbean)
 * and renders its varieties as colored-thumb rows. Tapping a row routes
 * to /varieties/[id] for the read-only detail page; the detail's
 * "Start inspection" CTA continues into the capture flow with the
 * variety pre-selected.
 *
 * Reference dimensions on each row are *observed* — averaged from this
 * variety's recent inspections — until a true reference column lands on
 * the varieties table. Marked with "(observed)" so demo viewers don't
 * mistake derived means for spec values.
 *
 * Admin CRUD (add / edit / delete) lives below the list as a collapsing
 * form, gated by the existing access policy. We keep it here rather
 * than a dedicated /varieties/edit route to avoid extra navigation
 * surface for what's an occasional task.
 */
export default function LibraryTab() {
  const { t } = useTranslation(["common", "varieties", "library"]);
  const { profile } = useAuth();
  const policy = policyFor(profile);
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useVarieties();
  const inspections = useInspections();
  const upsert = useUpsertVariety();
  const del = useDeleteVariety();
  const [form, setForm] = useState<FormState | null>(null);
  const [family, setFamily] = useState<FamilyKey>("all");

  // Observed reference dims keyed by variety_id — averaged across this
  // variety's recent inspections. Empty entries fall back to "—".
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
    const filtered = (data ?? []).filter((v) => family === "all" || v.color_key === family);
    return groupByFamily(filtered);
  }, [data, family]);

  const open = (v?: Variety) =>
    setForm(
      v
        ? {
            id: v.id,
            name: v.name,
            scientific_name: v.scientific_name ?? "",
            description: v.description ?? "",
            image_url: v.image_url ?? "",
            color_key: v.color_key ?? "rice",
          }
        : empty,
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
      <ScrollView contentContainerClassName="px-xl py-md gap-md">
        <View className="flex-row items-center justify-between">
          <Text className="text-h1 font-medium text-fg-primary">{t("varieties:title")}</Text>
          {policy.canCreateVariety() ? (
            <Button
              size="sm"
              label={t("varieties:newVariety")}
              leadingIcon={<Plus color="#FFFFFF" size={14} />}
              onPress={() => open()}
            />
          ) : null}
        </View>

        <Segmented<FamilyKey>
          value={family}
          onChange={setFamily}
          options={segmentOptions}
          scrollable
        />

        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : grouped.length === 0 ? (
          <EmptyState hint={t("varieties:empty")} />
        ) : (
          grouped.map(({ familyKey, items }) => (
            <View key={familyKey} className="gap-xs">
              <Text className="text-caption text-fg-secondary px-xs">
                {t(`library:sections.${familyKey}`)}
              </Text>
              <Card className="p-0">
                {items.map((variety, idx) => (
                  <VarietyRow
                    key={variety.id}
                    variety={variety}
                    isLast={idx === items.length - 1}
                    observed={observed.get(variety.id)}
                    canEdit={policy.canEditVariety()}
                    onPress={() => router.push(`/varieties/${variety.id}`)}
                    onEdit={() => open(variety)}
                    onDelete={() =>
                      Alert.alert(t("common:actions.delete"), t("varieties:deleteConfirm"), [
                        { text: t("common:actions.cancel"), style: "cancel" },
                        {
                          text: t("common:actions.delete"),
                          style: "destructive",
                          onPress: async () => {
                            await del.mutateAsync(variety.id);
                          },
                        },
                      ])
                    }
                  />
                ))}
              </Card>
            </View>
          ))
        )}

        {form ? (
          <Card className="mt-lg">
            <Text className="text-h2 font-medium text-fg-primary mb-md">
              {form.id ? t("varieties:editVariety") : t("varieties:newVariety")}
            </Text>
            <View className="gap-md">
              <Input
                placeholder={t("varieties:fields.name")}
                value={form.name}
                onChangeText={(name) => setForm({ ...form, name })}
              />
              <Input
                placeholder={t("varieties:fields.scientificName")}
                value={form.scientific_name}
                onChangeText={(scientific_name) => setForm({ ...form, scientific_name })}
              />
              <Input
                placeholder={t("varieties:fields.description")}
                value={form.description}
                onChangeText={(description) => setForm({ ...form, description })}
                multiline
              />
              <Input
                placeholder={t("varieties:fields.imageUrl")}
                value={form.image_url}
                onChangeText={(image_url) => setForm({ ...form, image_url })}
              />
              <Input
                placeholder={t("varieties:fields.colorKey")}
                value={form.color_key}
                onChangeText={(color_key) => setForm({ ...form, color_key })}
              />
              <View className="flex-row gap-sm">
                <Button
                  className="flex-1"
                  variant="outline"
                  label={t("common:actions.cancel")}
                  onPress={() => setForm(null)}
                />
                <Button
                  className="flex-1"
                  label={t("common:actions.save")}
                  disabled={!form.name || upsert.isPending}
                  onPress={async () => {
                    await upsert.mutateAsync({
                      id: form.id,
                      name: form.name,
                      scientific_name: form.scientific_name || null,
                      description: form.description || null,
                      image_url: form.image_url || null,
                      color_key: form.color_key || null,
                    });
                    setForm(null);
                  }}
                />
              </View>
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

interface RowProps {
  variety: Variety;
  isLast: boolean;
  observed: { l: number; w: number; n: number } | undefined;
  canEdit: boolean;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function VarietyRow({ variety, isLast, observed, canEdit, onPress, onEdit, onDelete }: RowProps) {
  const { t } = useTranslation(["library", "varieties"]);
  const tint = FAMILY_TINTS[variety.color_key ?? ""] ?? FAMILY_TINTS.rice;
  const dims = observed
    ? t("library:dimensionsObserved", {
        l: observed.l.toFixed(1),
        w: observed.w.toFixed(1),
      })
    : t("library:dimensionsPending");

  return (
    <View className={`${isLast ? "" : "border-b border-line-tertiary"}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={variety.name}
        onPress={onPress}
        className="flex-row items-center gap-md px-lg py-md"
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
      {canEdit ? (
        <View className="flex-row gap-sm pb-md px-lg">
          <Button
            size="sm"
            variant="outline"
            label={t("varieties:editVariety")}
            leadingIcon={<Pencil color="#1A1A1A" size={12} />}
            onPress={onEdit}
          />
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<Trash2 color="#791F1F" size={12} />}
            onPress={onDelete}
          />
        </View>
      ) : null}
    </View>
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
