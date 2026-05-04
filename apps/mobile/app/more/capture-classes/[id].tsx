import { useEffect, useMemo, useState } from "react";
import { ScrollView, View, Text, Alert, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Trash2 } from "lucide-react-native";
import type { Variety } from "@advance-seeds/types";
import { useAuth } from "@/lib/auth";
import { policyFor } from "@/lib/access";
import { useDeleteVariety, useUpsertVariety, useVarieties } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { DEFAULT_CAPTURE_CLASSES } from "@/lib/analyzer/captureClasses";
import { readActiveModel } from "@/lib/models/modelStore";
import type { InstalledModelRecord } from "@/lib/models/types";

interface FormState {
  name: string;
  scientificName: string;
  description: string;
  imageUrl: string;
  colorKey: string;
  cocoClassId: string;
  modelClassAliases: string[];
  refLength: string;
  refWidth: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  scientificName: "",
  description: "",
  imageUrl: "",
  colorKey: "rice",
  cocoClassId: "",
  modelClassAliases: [],
  refLength: "",
  refWidth: "",
};

const COLOR_KEYS: ReadonlyArray<{ key: string; bg: string; fg: string }> = [
  { key: "corn", bg: "#FAEEDA", fg: "#854F0B" },
  { key: "rice", bg: "#EAF3DE", fg: "#3B6D11" },
  { key: "legume", bg: "#E1F5EE", fg: "#0F6E56" },
  { key: "mungbean", bg: "#FAECE7", fg: "#993C1D" },
];

/**
 * Variety editor — single source of truth for create + edit on the
 * `varieties` table. Owns the public profile fields (name, scientific
 * name, description, image, family color) and the master-data fields
 * (detector class, reference dimensions). The Varieties tab now reads
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
    const parsedClass = form.cocoClassId === "" ? null : Number(form.cocoClassId);
    const parsedLen = form.refLength === "" ? null : Number(form.refLength);
    const parsedWid = form.refWidth === "" ? null : Number(form.refWidth);
    if (parsedClass !== null && !Number.isInteger(parsedClass)) {
      Alert.alert(t("more:masterData.invalidClass"));
      return;
    }
    if (parsedLen !== null && !(parsedLen > 0)) {
      Alert.alert(t("more:masterData.invalidLength"));
      return;
    }
    if (parsedWid !== null && !(parsedWid > 0)) {
      Alert.alert(t("more:masterData.invalidWidth"));
      return;
    }
    await upsert.mutateAsync({
      id: editing?.id,
      name,
      scientific_name: form.scientificName.trim() || null,
      description: form.description.trim() || null,
      image_url: form.imageUrl.trim() || null,
      color_key: form.colorKey || "rice",
      coco_class_id: parsedClass,
      // null means "no opinion → fall back to name match / COCO";
      // [] means "operator explicitly cleared all model classes".
      model_class_aliases: form.modelClassAliases.length > 0 ? form.modelClassAliases : null,
      ref_length_mm: parsedLen,
      ref_width_mm: parsedWid,
    });
    router.back();
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
          await del.mutateAsync(target.id);
          router.back();
        },
      },
    ]);
  };

  const title = isCreate ? t("more:masterData.newTitle") : t("more:masterData.editTitle");

  if (!isCreate && varietiesQuery.isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
        <AppTopBar title={title} left={backAction(router, t)} />
        <LoadingState />
      </SafeAreaView>
    );
  }
  if (!isCreate && !editing) {
    return (
      <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
        <AppTopBar title={title} left={backAction(router, t)} />
        <ErrorState onRetry={() => void varietiesQuery.refetch()} />
      </SafeAreaView>
    );
  }

  const canDelete = !isCreate && policy.canDeleteVariety();

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar title={title} left={backAction(router, t)} />
      <ScrollView contentContainerClassName="px-xl py-md gap-md">
        <Card>
          <View className="gap-md">
            <Field label={t("varieties:fields.name")}>
              <Input
                placeholder={t("varieties:fields.name")}
                value={form.name}
                onChangeText={(name) => setForm((s) => ({ ...s, name }))}
                autoCapitalize="words"
              />
            </Field>
            <Field label={t("varieties:fields.scientificName")}>
              <Input
                placeholder={t("varieties:fields.scientificName")}
                value={form.scientificName}
                onChangeText={(scientificName) => setForm((s) => ({ ...s, scientificName }))}
                autoCapitalize="words"
              />
            </Field>
            <Field label={t("varieties:fields.description")}>
              <Input
                placeholder={t("more:masterData.descriptionPlaceholder")}
                value={form.description}
                onChangeText={(description) => setForm((s) => ({ ...s, description }))}
                multiline
                textAlignVertical="top"
                style={{ height: 140, paddingTop: 12, paddingBottom: 12 }}
              />
            </Field>
            <Field label={t("varieties:fields.imageUrl")} hint={t("more:masterData.imageHint")}>
              <Input
                placeholder="https://…"
                value={form.imageUrl}
                onChangeText={(imageUrl) => setForm((s) => ({ ...s, imageUrl }))}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </Field>
            <Field label={t("more:masterData.colorKey")}>
              <View className="flex-row flex-wrap gap-sm">
                {COLOR_KEYS.map((opt) => (
                  <ColorChip
                    key={opt.key}
                    label={t(`library:segments.${opt.key}` as never, opt.key)}
                    bg={opt.bg}
                    fg={opt.fg}
                    active={form.colorKey === opt.key}
                    onPress={() => setForm((s) => ({ ...s, colorKey: opt.key }))}
                  />
                ))}
              </View>
            </Field>

            <Field label={t("more:masterData.detectorClass")}>
              <View className="flex-row flex-wrap gap-sm">
                <ClassChip
                  label={t("more:masterData.unmappedShort")}
                  active={form.cocoClassId === ""}
                  onPress={() => setForm((s) => ({ ...s, cocoClassId: "" }))}
                />
                {DEFAULT_CAPTURE_CLASSES.map((opt) => (
                  <ClassChip
                    key={opt.cocoClassId}
                    label={`${opt.name} · ${opt.cocoClassId}`}
                    active={form.cocoClassId === String(opt.cocoClassId)}
                    onPress={() => setForm((s) => ({ ...s, cocoClassId: String(opt.cocoClassId) }))}
                  />
                ))}
              </View>
            </Field>

            <Field
              label={t("more:masterData.modelClasses")}
              hint={
                modelClassNames.length === 0
                  ? t("more:masterData.modelClassesNoActive")
                  : t("more:masterData.modelClassesHint", { name: activeModel?.displayName ?? "" })
              }
            >
              {modelClassNames.length > 0 ? (
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
              ) : null}
            </Field>

            <Field label={t("more:masterData.refLengthMm")}>
              <Input
                placeholder={t("more:masterData.refLengthMm")}
                keyboardType="decimal-pad"
                value={form.refLength}
                onChangeText={(refLength) => setForm((s) => ({ ...s, refLength }))}
              />
            </Field>
            <Field label={t("more:masterData.refWidthMm")}>
              <Input
                placeholder={t("more:masterData.refWidthMm")}
                keyboardType="decimal-pad"
                value={form.refWidth}
                onChangeText={(refWidth) => setForm((s) => ({ ...s, refWidth }))}
              />
            </Field>

            <View className="flex-row gap-sm mt-sm">
              {canDelete ? (
                <Button
                  className="flex-1"
                  variant="danger"
                  label={t("common:actions.delete")}
                  disabled={del.isPending}
                  renderLeadingIcon={() => <Trash2 color="#791F1F" size={14} />}
                  onPress={onDelete}
                />
              ) : null}
              <Button
                className="flex-1"
                label={t("common:actions.save")}
                disabled={upsert.isPending || !form.name.trim()}
                onPress={() => void onSave()}
              />
            </View>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function backAction(
  router: ReturnType<typeof useRouter>,
  t: ReturnType<typeof useTranslation>["t"],
) {
  return {
    accessibilityLabel: t("common:actions.back"),
    renderIcon: () => <ChevronLeft color="#1A1A1A" size={20} />,
    onPress: () => router.back(),
  };
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-xs">
      <Text className="text-caption uppercase tracking-wide text-fg-secondary">{label}</Text>
      {children}
      {hint ? <Text className="text-caption text-fg-tertiary">{hint}</Text> : null}
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
      accessibilityLabel={label}
      onPress={onPress}
      className={`rounded-full px-md py-sm ${active ? "bg-brand active:opacity-90" : "bg-bg-primary border border-line-tertiary"}`}
    >
      <Text className={`text-caption font-medium ${active ? "text-brand-on" : "text-fg-primary"}`}>
        {label}
      </Text>
    </Pressable>
  );
}

function ColorChip({
  label,
  bg,
  fg,
  active,
  onPress,
}: {
  label: string;
  bg: string;
  fg: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`rounded-full px-md py-sm border-2 ${active ? "border-brand" : "border-transparent"}`}
      style={{ backgroundColor: bg }}
    >
      <Text className="text-caption font-medium" style={{ color: fg }}>
        {label}
      </Text>
    </Pressable>
  );
}

function hydrateForm(v: Variety): FormState {
  return {
    name: v.name,
    scientificName: v.scientific_name ?? "",
    description: v.description ?? "",
    imageUrl: v.image_url ?? "",
    colorKey: v.color_key ?? "rice",
    cocoClassId:
      v.coco_class_id !== null && v.coco_class_id !== undefined ? String(v.coco_class_id) : "",
    modelClassAliases: Array.isArray(v.model_class_aliases) ? [...v.model_class_aliases] : [],
    refLength:
      v.ref_length_mm !== null && v.ref_length_mm !== undefined ? String(v.ref_length_mm) : "",
    refWidth: v.ref_width_mm !== null && v.ref_width_mm !== undefined ? String(v.ref_width_mm) : "",
  };
}
