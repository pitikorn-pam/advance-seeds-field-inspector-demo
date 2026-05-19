import { useEffect, useMemo, useState } from "react";
import { ScrollView, View, Text, Alert, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import { X, Trash2, Cpu } from "lucide-react-native";
import type { GradeCriteriaGrade, Json, Variety, VarietyGradeCriteria } from "@advance-seeds/types";
import { useAuth } from "@/lib/auth";
import { policyFor } from "@/lib/access";
import { useDeleteVariety, useUpsertVariety, useVarieties } from "@/lib/queries";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { readActiveModel } from "@/lib/models/modelStore";
import type { InstalledModelRecord } from "@/lib/models/types";

interface FormState {
  name: string;
  scientificName: string;
  description: string;
  imageUrl: string;
  colorKey: string;
  modelClassAliases: string[];
  refLength: string;
  refWidth: string;
  gradeCriteria: GradeCriteriaForm;
  isActive: boolean;
}

type GradeCriteriaField = "lengthMin" | "lengthMax" | "widthMin" | "widthMax";
type GradeCriteriaForm = Record<GradeCriteriaGrade, Record<GradeCriteriaField, string>>;

const GRADE_KEYS: GradeCriteriaGrade[] = ["A", "B", "C"];

const EMPTY_GRADE_CRITERIA: GradeCriteriaForm = {
  A: { lengthMin: "", lengthMax: "", widthMin: "", widthMax: "" },
  B: { lengthMin: "", lengthMax: "", widthMin: "", widthMax: "" },
  C: { lengthMin: "", lengthMax: "", widthMin: "", widthMax: "" },
};

const EMPTY_FORM: FormState = {
  name: "",
  scientificName: "",
  description: "",
  imageUrl: "",
  colorKey: "rice",
  modelClassAliases: [],
  refLength: "",
  refWidth: "",
  gradeCriteria: emptyGradeCriteriaForm(),
  isActive: true,
};

type FamilyKey = "rice" | "corn" | "legume" | "mungbean";

const FAMILY_TINTS: Record<FamilyKey, { bg: string; text: string; seed: string }> = {
  rice: { bg: "bg-rice-bg", text: "text-rice-text", seed: "#0F6E56" },
  corn: { bg: "bg-corn-bg", text: "text-corn-text", seed: "#704B00" },
  legume: { bg: "bg-legume-bg", text: "text-legume-text", seed: "#3F249B" },
  mungbean: { bg: "bg-mungbean-bg", text: "text-mungbean-text", seed: "#8C3C12" },
};

const FAMILY_KEYS: FamilyKey[] = ["rice", "corn", "legume", "mungbean"];

function resolveFamily(colorKey: string): FamilyKey {
  return (FAMILY_KEYS as readonly string[]).includes(colorKey) ? (colorKey as FamilyKey) : "rice";
}

/**
 * Variety editor — single source of truth for create + edit on the
 * `varieties` table. Owns the public profile fields (name, scientific
 * name, description, image, family color) and the master-data fields
 * (detector class, grading criteria). The Varieties tab now reads
 * from the same row but never edits.
 */
export default function VarietyEditor() {
  const { t } = useTranslation(["common", "varieties", "more", "library"]);
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const isCreate = params.id === "new";
  const { profile } = useAuth();
  const policy = policyFor(profile);
  const varietiesQuery = useVarieties();
  const upsert = useUpsertVariety();
  const del = useDeleteVariety();

  const editing = useMemo<Variety | null>(() => {
    if (isCreate) return null;
    return varietiesQuery.data?.find((v) => v.id === params.id) ?? null;
  }, [isCreate, params.id, varietiesQuery.data]);

  const [form, setForm] = useState<FormState>(() => (editing ? hydrateForm(editing) : EMPTY_FORM));
  const [hydrated, setHydrated] = useState(isCreate);
  if (!hydrated && editing) {
    setForm(hydrateForm(editing));
    setHydrated(true);
  }

  const [activeModel, setActiveModel] = useState<InstalledModelRecord | null>(null);
  useEffect(() => {
    let cancelled = false;
    void readActiveModel().then((rec) => {
      if (!cancelled) setActiveModel(rec);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const modelClassNames = useMemo<readonly string[]>(() => {
    const names = activeModel?.metadata?.class_names;
    return Array.isArray(names) ? names : [];
  }, [activeModel]);

  const onSave = async () => {
    const name = form.name.trim();
    if (!name) {
      Alert.alert(t("more:masterData.invalidName"));
      return;
    }
    const parsedLen = form.refLength === "" ? null : Number(form.refLength);
    const parsedWid = form.refWidth === "" ? null : Number(form.refWidth);
    if (parsedLen !== null && !(parsedLen > 0)) {
      Alert.alert(t("more:masterData.invalidLength"));
      return;
    }
    if (parsedWid !== null && !(parsedWid > 0)) {
      Alert.alert(t("more:masterData.invalidWidth"));
      return;
    }
    let gradeCriteria: VarietyGradeCriteria | null;
    try {
      gradeCriteria = buildGradeCriteria(form.gradeCriteria);
    } catch {
      Alert.alert(t("more:masterData.invalidGradeCriteria"));
      return;
    }
    try {
      await upsert.mutateAsync({
        id: editing?.id,
        name,
        scientific_name: form.scientificName.trim() || null,
        description: form.description.trim() || null,
        image_url: form.imageUrl.trim() || null,
        color_key: form.colorKey || "rice",
        // Detector binding is now name-based via model_class_aliases. The
        // legacy COCO id column is preserved (for varieties created before
        // this change) but no longer written from the editor.
        coco_class_id: editing?.coco_class_id ?? null,
        model_class_aliases: form.modelClassAliases.length > 0 ? form.modelClassAliases : null,
        ref_length_mm: parsedLen,
        ref_width_mm: parsedWid,
        grade_criteria: gradeCriteria as unknown as Json | null,
        is_active: form.isActive,
      });
      router.back();
    } catch (error) {
      Alert.alert(t("common:states.error"), saveErrorMessage(error, t));
    }
  };

  const onDelete = () => {
    if (!editing) return;
    const target = editing;
    Alert.alert(t("common:actions.delete"), t("varieties:deleteConfirm"), [
      { text: t("common:actions.cancel"), style: "cancel" },
      {
        text: t("common:actions.delete"),
        style: "destructive",
        onPress: async () => {
          try {
            await del.mutateAsync(target.id);
            router.back();
          } catch (error) {
            Alert.alert(t("common:states.error"), deleteErrorMessage(error, t));
          }
        },
      },
    ]);
  };

  const title = isCreate ? t("more:masterData.newTitle") : t("more:masterData.editTitle");

  if (!isCreate && varietiesQuery.isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
        <AppTopBar title={title} left={closeAction(router, t)} />
        <LoadingState />
      </SafeAreaView>
    );
  }
  if (!isCreate && !editing) {
    return (
      <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
        <AppTopBar title={title} left={closeAction(router, t)} />
        <ErrorState onRetry={() => void varietiesQuery.refetch()} />
      </SafeAreaView>
    );
  }

  const canDelete = !isCreate && policy.canDeleteVariety();
  const familyKey = resolveFamily(form.colorKey);
  const tint = FAMILY_TINTS[familyKey];
  const familyLabel = t(`varieties:family.${familyKey}`);

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar title={title} left={closeAction(router, t)} />
      <ScrollView contentContainerClassName="pb-3xl" keyboardShouldPersistTaps="handled">
        {/* Hero band — family-tinted, full-bleed */}
        <View className={`px-xl pt-lg pb-xl ${tint.bg}`}>
          <View className="flex-row items-center gap-md">
            <View
              className="items-center justify-center overflow-hidden rounded-lg"
              style={{ height: 64, width: 64, backgroundColor: "rgba(255,255,255,0.55)" }}
            >
              <View className="flex-row gap-[3px]">
                <SeedShape color={tint.seed} rotate="-15deg" />
                <SeedShape color={tint.seed} rotate="8deg" />
                <SeedShape color={tint.seed} rotate="-22deg" />
              </View>
            </View>
            <View className="flex-1">
              <Text
                className={`text-label uppercase font-medium ${tint.text}`}
                style={{ letterSpacing: 0.6 }}
              >
                {familyLabel}
              </Text>
              <Text
                className="text-fg-primary font-medium mt-[2px]"
                style={{ fontSize: 22, letterSpacing: -0.4 }}
                numberOfLines={2}
              >
                {form.name.trim() || title}
              </Text>
              {form.scientificName ? (
                <Text className="text-caption italic text-fg-secondary mt-[2px]" numberOfLines={1}>
                  {form.scientificName}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* Basic info card */}
        <View className="px-xl pt-xl">
          <SectionHeader label={t("more:masterData.basicInfo")} />
          <View className="rounded-lg bg-bg-primary border border-line-tertiary p-lg gap-md">
            <LabeledField label={t("varieties:fields.name").toUpperCase()}>
              <Input
                placeholder={t("varieties:fields.name")}
                value={form.name}
                onChangeText={(name) => setForm((s) => ({ ...s, name }))}
                autoCapitalize="words"
              />
            </LabeledField>
            <LabeledField label={t("varieties:fields.scientificName").toUpperCase()}>
              <Input
                placeholder={t("varieties:fields.scientificName")}
                value={form.scientificName}
                onChangeText={(scientificName) => setForm((s) => ({ ...s, scientificName }))}
                autoCapitalize="words"
              />
            </LabeledField>
            <LabeledField label={t("varieties:fields.description").toUpperCase()}>
              <Input
                placeholder={t("more:masterData.descriptionPlaceholder")}
                value={form.description}
                onChangeText={(description) => setForm((s) => ({ ...s, description }))}
                multiline
                textAlignVertical="top"
                style={{ height: 96, paddingTop: 12, paddingBottom: 12 }}
              />
            </LabeledField>
            <LabeledField
              label={t("varieties:fields.imageUrl").toUpperCase()}
              hint={t("more:masterData.imageHint")}
            >
              <Input
                placeholder="https://…"
                value={form.imageUrl}
                onChangeText={(imageUrl) => setForm((s) => ({ ...s, imageUrl }))}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </LabeledField>
            <View className="flex-row gap-sm">
              <LabeledField label={t("more:masterData.colorKey").toUpperCase()} className="flex-1">
                <FamilyPicker
                  value={familyKey}
                  onChange={(colorKey) => setForm((s) => ({ ...s, colorKey }))}
                  t={t}
                />
              </LabeledField>
              <LabeledField label={t("varieties:fields.status").toUpperCase()} className="flex-1">
                <ActiveControl
                  value={form.isActive}
                  onChange={(isActive) => setForm((s) => ({ ...s, isActive }))}
                  activeLabel={t("varieties:status.active")}
                  inactiveLabel={t("varieties:status.inactive")}
                />
              </LabeledField>
            </View>
          </View>
        </View>

        {/* Model classes card */}
        <View className="px-xl pt-xl">
          <SectionHeader label={t("more:masterData.modelClasses")} />
          <View className="rounded-lg bg-bg-primary border border-line-tertiary p-lg gap-md">
            <View className="flex-row items-center gap-sm">
              <View className="h-5 w-5 items-center justify-center rounded-xs bg-rice-bg">
                <Cpu color="#6E40E0" size={12} />
              </View>
              <Text className="text-caption text-fg-secondary">
                {modelClassNames.length === 0
                  ? t("more:masterData.modelClassesNoActive")
                  : t("more:masterData.classesFrom", {
                      name: activeModel?.displayName ?? "",
                    })}
              </Text>
            </View>
            {modelClassNames.length > 0 ? (
              <>
                <View className="flex-row flex-wrap gap-sm">
                  {modelClassNames.map((cls) => {
                    const active = form.modelClassAliases.includes(cls);
                    return (
                      <ClassChip
                        key={cls}
                        label={cls}
                        active={active}
                        onPress={() =>
                          setForm((s) => {
                            // Read membership from the *latest* state inside
                            // the setter, not the render-time closure —
                            // back-to-back taps would otherwise resolve
                            // against stale `active` values.
                            const has = s.modelClassAliases.includes(cls);
                            return {
                              ...s,
                              modelClassAliases: has
                                ? s.modelClassAliases.filter((c) => c !== cls)
                                : [...s.modelClassAliases, cls],
                            };
                          })
                        }
                      />
                    );
                  })}
                </View>
                <Text className="text-caption text-fg-tertiary">
                  {t("more:masterData.modelClassesSelected", {
                    count: form.modelClassAliases.length,
                  })}
                </Text>
              </>
            ) : null}
          </View>
        </View>

        {/* Reference dimensions card */}
        <View className="px-xl pt-xl">
          <SectionHeader label={t("more:masterData.referenceDimensions")} />
          <View className="rounded-lg bg-bg-primary border border-line-tertiary p-lg">
            <View className="flex-row gap-sm">
              <LabeledField
                label={t("more:masterData.refLengthMm").toUpperCase()}
                className="flex-1"
              >
                <Input
                  placeholder="0.0"
                  keyboardType="decimal-pad"
                  value={form.refLength}
                  onChangeText={(refLength) => setForm((s) => ({ ...s, refLength }))}
                />
              </LabeledField>
              <LabeledField
                label={t("more:masterData.refWidthMm").toUpperCase()}
                className="flex-1"
              >
                <Input
                  placeholder="0.0"
                  keyboardType="decimal-pad"
                  value={form.refWidth}
                  onChangeText={(refWidth) => setForm((s) => ({ ...s, refWidth }))}
                />
              </LabeledField>
            </View>
          </View>
        </View>

        {/* Grade criteria card */}
        <View className="px-xl pt-xl">
          <SectionHeader label={t("more:masterData.gradeCriteria")} />
          <View className="rounded-lg bg-bg-primary border border-line-tertiary p-lg gap-md">
            <Text className="text-caption text-fg-tertiary">
              {t("more:masterData.gradeCriteriaHint")}
            </Text>
            <GradeCriteriaEditor
              value={form.gradeCriteria}
              onChange={(grade, field, text) =>
                setForm((s) => ({
                  ...s,
                  gradeCriteria: {
                    ...s.gradeCriteria,
                    [grade]: {
                      ...s.gradeCriteria[grade],
                      [field]: text,
                    },
                  },
                }))
              }
            />
          </View>
        </View>

        {/* Danger zone */}
        {canDelete ? (
          <View className="px-xl pt-xl">
            <Button
              variant="danger"
              label={t("common:actions.delete")}
              disabled={del.isPending}
              renderLeadingIcon={() => <Trash2 color="#8A1F1B" size={14} />}
              onPress={onDelete}
            />
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky Save CTA */}
      <View className="px-xl pt-md pb-md border-t border-line-tertiary bg-bg-primary">
        <Button
          variant="primary"
          label={t("common:actions.save")}
          disabled={upsert.isPending || !form.name.trim()}
          onPress={() => void onSave()}
        />
      </View>
    </SafeAreaView>
  );
}

function closeAction(
  router: ReturnType<typeof useRouter>,
  t: ReturnType<typeof useTranslation>["t"],
) {
  return {
    accessibilityLabel: t("common:actions.cancel"),
    renderIcon: () => <X color="#171717" size={20} />,
    onPress: () => router.back(),
  };
}

function SectionHeader({ label }: { label: string }) {
  return (
    <Text
      className="text-label uppercase font-medium text-fg-tertiary mb-sm"
      style={{ fontSize: 11, letterSpacing: 0.6 }}
    >
      {label}
    </Text>
  );
}

function LabeledField({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <View className={`gap-xs ${className}`}>
      <Text
        className="text-label uppercase font-medium text-fg-tertiary"
        style={{ fontSize: 11, letterSpacing: 0.6 }}
      >
        {label}
      </Text>
      {children}
      {hint ? <Text className="text-caption text-fg-tertiary">{hint}</Text> : null}
    </View>
  );
}

function SeedShape({ color, rotate }: { color: string; rotate: string }) {
  return (
    <View
      style={{
        width: 12,
        height: 20,
        borderRadius: 999,
        backgroundColor: color,
        opacity: 0.55,
        transform: [{ rotate }],
      }}
    />
  );
}

function FamilyPicker({
  value,
  onChange,
  t,
}: {
  value: FamilyKey;
  onChange: (next: FamilyKey) => void;
  t: TFunction;
}) {
  const next: Record<FamilyKey, FamilyKey> = {
    rice: "corn",
    corn: "legume",
    legume: "mungbean",
    mungbean: "rice",
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("more:masterData.colorKey")}
      onPress={() => onChange(next[value])}
      className="h-11 w-full rounded-md border border-line-secondary bg-bg-primary px-lg justify-center active:bg-bg-secondary"
    >
      <Text className="text-title text-fg-primary">{t(`varieties:family.${value}`)}</Text>
    </Pressable>
  );
}

function ActiveControl({
  value,
  onChange,
  activeLabel,
  inactiveLabel,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <View className="h-11 w-full flex-row items-center justify-between rounded-md border border-line-secondary bg-bg-primary px-md">
      <Text className="text-title text-fg-primary">{value ? activeLabel : inactiveLabel}</Text>
      <Toggle value={value} onValueChange={onChange} accessibilityLabel={activeLabel} />
    </View>
  );
}

function ClassChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      className={`rounded-full px-md py-sm ${
        active
          ? "bg-primary active:opacity-90"
          : "bg-bg-primary border border-line-secondary active:bg-bg-secondary"
      }`}
    >
      <Text
        className={`text-caption ${
          active ? "font-semibold text-primary-on" : "font-medium text-fg-primary"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function GradeCriteriaEditor({
  value,
  onChange,
}: {
  value: GradeCriteriaForm;
  onChange: (grade: GradeCriteriaGrade, field: GradeCriteriaField, text: string) => void;
}) {
  const { t } = useTranslation(["more"]);
  return (
    <View className="gap-md">
      {GRADE_KEYS.map((grade) => (
        <View key={grade} className="gap-xs">
          <Text className="text-title text-fg-primary">{grade}</Text>
          <View className="flex-row gap-sm">
            <Input
              className="flex-1"
              placeholder={t("more:masterData.gradeLengthMin")}
              keyboardType="decimal-pad"
              value={value[grade].lengthMin}
              onChangeText={(text) => onChange(grade, "lengthMin", text)}
            />
            <Input
              className="flex-1"
              placeholder={t("more:masterData.gradeLengthMax")}
              keyboardType="decimal-pad"
              value={value[grade].lengthMax}
              onChangeText={(text) => onChange(grade, "lengthMax", text)}
            />
          </View>
          <View className="flex-row gap-sm">
            <Input
              className="flex-1"
              placeholder={t("more:masterData.gradeWidthMin")}
              keyboardType="decimal-pad"
              value={value[grade].widthMin}
              onChangeText={(text) => onChange(grade, "widthMin", text)}
            />
            <Input
              className="flex-1"
              placeholder={t("more:masterData.gradeWidthMax")}
              keyboardType="decimal-pad"
              value={value[grade].widthMax}
              onChangeText={(text) => onChange(grade, "widthMax", text)}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function hydrateForm(v: Variety): FormState {
  return {
    name: v.name,
    scientificName: v.scientific_name ?? "",
    description: v.description ?? "",
    imageUrl: v.image_url ?? "",
    colorKey: v.color_key ?? "rice",
    modelClassAliases: Array.isArray(v.model_class_aliases) ? [...v.model_class_aliases] : [],
    refLength:
      v.ref_length_mm !== null && v.ref_length_mm !== undefined ? String(v.ref_length_mm) : "",
    refWidth: v.ref_width_mm !== null && v.ref_width_mm !== undefined ? String(v.ref_width_mm) : "",
    gradeCriteria: hydrateGradeCriteria(v.grade_criteria),
    isActive: v.is_active !== false,
  };
}

function hydrateGradeCriteria(criteria: VarietyGradeCriteria | null): GradeCriteriaForm {
  const next = emptyGradeCriteriaForm();
  if (!criteria) return next;
  for (const grade of GRADE_KEYS) {
    const rule = criteria[grade];
    if (!rule) continue;
    next[grade] = {
      lengthMin: formatCriteriaNumber(rule.length_mm?.min),
      lengthMax: formatCriteriaNumber(rule.length_mm?.max),
      widthMin: formatCriteriaNumber(rule.width_mm?.min),
      widthMax: formatCriteriaNumber(rule.width_mm?.max),
    };
  }
  return next;
}

function buildGradeCriteria(form: GradeCriteriaForm): VarietyGradeCriteria | null {
  const criteria: VarietyGradeCriteria = {};
  for (const grade of GRADE_KEYS) {
    const lengthMin = parseCriteriaNumber(form[grade].lengthMin);
    const lengthMax = parseCriteriaNumber(form[grade].lengthMax);
    const widthMin = parseCriteriaNumber(form[grade].widthMin);
    const widthMax = parseCriteriaNumber(form[grade].widthMax);
    assertValidRange(lengthMin, lengthMax);
    assertValidRange(widthMin, widthMax);
    if (lengthMin === null && lengthMax === null && widthMin === null && widthMax === null) {
      continue;
    }
    criteria[grade] = {
      length_mm: { min: lengthMin, max: lengthMax },
      width_mm: { min: widthMin, max: widthMax },
    };
  }
  return Object.keys(criteria).length > 0 ? criteria : null;
}

function emptyGradeCriteriaForm(): GradeCriteriaForm {
  return {
    A: { ...EMPTY_GRADE_CRITERIA.A },
    B: { ...EMPTY_GRADE_CRITERIA.B },
    C: { ...EMPTY_GRADE_CRITERIA.C },
  };
}

function formatCriteriaNumber(value: number | null | undefined): string {
  return value !== null && value !== undefined && Number.isFinite(value) ? String(value) : "";
}

function parseCriteriaNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("INVALID_GRADE_CRITERIA");
  return parsed;
}

function assertValidRange(min: number | null, max: number | null): void {
  if (min !== null && max !== null && min > max) throw new Error("INVALID_GRADE_CRITERIA");
}

function deleteErrorMessage(error: unknown, t: TFunction): string {
  if (error instanceof Error && error.message === "VARIETY_IN_USE") {
    return t("varieties:deleteBlocked");
  }
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "23503"
  ) {
    return t("varieties:deleteBlocked");
  }
  if (error instanceof Error && error.message) return error.message;
  return t("varieties:deleteFailed");
}

function saveErrorMessage(error: unknown, t: TFunction): string {
  if (isMissingActiveStatusColumn(error)) {
    return t("varieties:saveNeedsMigration");
  }
  if (error instanceof Error && error.message) return error.message;
  return t("varieties:saveFailed");
}

function isMissingActiveStatusColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string };
  const message = candidate.message ?? "";
  return (
    candidate.code === "PGRST204" ||
    candidate.code === "42703" ||
    /is_active/i.test(message) ||
    /schema cache/i.test(message)
  );
}
