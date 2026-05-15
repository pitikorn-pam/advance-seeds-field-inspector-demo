import { useMemo, useState } from "react";
import { ScrollView, View, Text, Pressable, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import { X, Check, Search, Cpu } from "lucide-react-native";
import { useVarieties, useUpsertVariety } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { policyFor } from "@/lib/access";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { LoadingState, ErrorState } from "@/components/ui/States";

/**
 * Variety editor screen — admin-only.
 *
 * 1:1 port of the prototype `VarietyEditorScreen` (screens/varieties.jsx).
 * Sections: Basic info, Model classes, Reference dimensions, Grade criteria,
 * Danger zone. Field structure (name / scientific name / family chip /
 * length+width / A,B,C ranges / capture defaults toggles) mirrors the
 * prototype verbatim — no interpretation.
 */
export default function VarietyEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation(["common", "varieties"]);
  const router = useRouter();
  const { profile } = useAuth();
  const policy = policyFor(profile);

  const varieties = useVarieties();
  const upsert = useUpsertVariety();

  const variety = useMemo(
    () => varieties.data?.find((v) => v.id === id) ?? null,
    [varieties.data, id],
  );

  // Pre-fill local state from the variety being edited.
  const [name, setName] = useState("");
  const [scientific, setScientific] = useState("");
  const [family, setFamily] = useState<string>("rice");
  const [refL, setRefL] = useState("");
  const [refW, setRefW] = useState("");
  const [grades, setGrades] = useState(() => DEFAULT_GRADES);
  const [classQuery, setClassQuery] = useState("");
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [defLighting, setDefLighting] = useState(true);
  const [defSurface, setDefSurface] = useState(true);
  const [defMultiSeed, setDefMultiSeed] = useState(false);

  const [hydrated, setHydrated] = useState(false);
  if (!hydrated && variety) {
    setName(variety.name ?? "");
    setScientific(variety.scientific_name ?? "");
    setFamily((variety.color_key as string) ?? "rice");
    setRefL(variety.ref_length_mm != null ? String(variety.ref_length_mm) : "");
    setRefW(variety.ref_width_mm != null ? String(variety.ref_width_mm) : "");
    setSelectedClasses(variety.model_class_aliases ?? []);
    setHydrated(true);
  }

  // Admin guard — same shape as policy.canEditVariety() used elsewhere.
  if (profile && !policy.canEditVariety()) {
    return (
      <SafeAreaView className="flex-1 bg-bg-primary" edges={["top", "bottom"]}>
        <View className="flex-1 items-center justify-center px-xl">
          <Text className="text-title font-medium text-fg-primary">
            {t("common:errors.forbiddenTitle", { defaultValue: "Admin only" })}
          </Text>
          <Text className="mt-sm text-body text-fg-secondary text-center">
            {t("common:errors.forbiddenBody", {
              defaultValue: "You need admin access to edit varieties.",
            })}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (varieties.isLoading) return <LoadingState />;
  if (varieties.isError || !variety) {
    return <ErrorState onRetry={() => void varieties.refetch()} />;
  }

  const onSave = () => {
    // TODO: wire save mutation — `useUpsertVariety` lacks fields for
    //   grade thresholds (grades A/B/C ranges) and capture defaults
    //   (lighting / surface / multi-seed). The expected shape is:
    //     { id, name, scientific_name, color_key: family,
    //       ref_length_mm: Number(refL), ref_width_mm: Number(refW),
    //       model_class_aliases: selectedClasses,
    //       grade_criteria: { A: {...}, B: {...}, C: {...} },
    //       capture_defaults: { lighting, surface, multiSeed } }
    upsert.mutate(
      {
        id: variety.id,
        name,
        scientific_name: scientific,
        description: variety.description,
        image_url: variety.image_url,
        color_key: family,
        is_active: variety.is_active,
        ref_length_mm: refL ? Number(refL) : null,
        ref_width_mm: refW ? Number(refW) : null,
        model_class_aliases: selectedClasses.length ? selectedClasses : null,
      },
      { onSuccess: () => router.back() },
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      {/* NavBar — close left, Save right (text-primary) */}
      <View className="flex-row items-center justify-between px-xl py-md">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common:actions.close", { defaultValue: "Close" })}
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-md bg-bg-tertiary active:bg-bg-secondary"
        >
          <X color="#171717" size={22} />
        </Pressable>
        <View className="flex-1 mx-md">
          <Text className="text-center text-title font-medium text-fg-primary" numberOfLines={1}>
            {t("varieties:editor.title", { name: variety.name })}
          </Text>
          <Text className="text-center text-caption text-fg-secondary">
            {t("varieties:editor.adminSubtitle", { defaultValue: "Admin" })}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onSave}
          className="h-10 px-md items-center justify-center"
        >
          <Text className="text-primary font-semibold" style={{ fontSize: 13 }}>
            {t("common:actions.save", { defaultValue: "Save" })}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerClassName="px-lg pt-md pb-2xl"
        keyboardShouldPersistTaps="handled"
      >
        {/* Identity */}
        <FormSection title={t("varieties:editor.sectionIdentity")}>
          <Field label={t("varieties:editor.fieldName")} value={name} onChangeText={setName} />
          <Field
            label={t("varieties:editor.fieldScientific")}
            value={scientific}
            onChangeText={setScientific}
            mono
          />
          <Caption>{t("varieties:editor.fieldFamily")}</Caption>
          <View className="flex-row flex-wrap gap-xs px-xs">
            {FAMILIES.map((f) => (
              <FamilyChip
                key={f.key}
                label={t(`varieties:family.${f.key}`)}
                active={family === f.key}
                onPress={() => setFamily(f.key)}
              />
            ))}
          </View>
        </FormSection>

        {/* Reference dimensions */}
        <FormSection title={t("varieties:editor.sectionReference")}>
          <View className="flex-row gap-sm">
            <FieldHalf
              label={t("varieties:editor.fieldLengthMm")}
              value={refL}
              onChangeText={setRefL}
              mono
              keyboardType="decimal-pad"
            />
            <FieldHalf
              label={t("varieties:editor.fieldWidthMm")}
              value={refW}
              onChangeText={setRefW}
              mono
              keyboardType="decimal-pad"
            />
          </View>
        </FormSection>

        {/* Grade thresholds */}
        <FormSection title={t("varieties:editor.sectionGrades")}>
          {grades.map((g) => (
            <View
              key={g.g}
              className="rounded-md border border-line-tertiary bg-bg-primary p-md mb-sm"
            >
              <View className="flex-row items-center gap-sm mb-sm">
                <View
                  className={`rounded-sm items-center justify-center ${g.tintBg}`}
                  style={{ width: 28, height: 28 }}
                >
                  <Text className={`font-semibold ${g.tintInk}`} style={{ fontSize: 13 }}>
                    {g.g}
                  </Text>
                </View>
                <Text className="text-body font-medium text-fg-primary">
                  {t("varieties:editor.gradeLabel", { grade: g.g })}
                </Text>
              </View>
              <RangeField
                label={t("varieties:editor.lengthRange")}
                lo={g.lo}
                hi={g.hi}
                unit="mm"
                onChangeLo={(v) => updateGrade(setGrades, g.g, { lo: v })}
                onChangeHi={(v) => updateGrade(setGrades, g.g, { hi: v })}
              />
            </View>
          ))}
        </FormSection>

        {/* Detector class — search + chip grid */}
        <FormSection title={t("varieties:editor.sectionDetectorClass")}>
          <View className="flex-row items-center gap-xs px-xs pb-sm">
            <View
              className="rounded-sm bg-card-lavender items-center justify-center"
              style={{ width: 18, height: 18 }}
            >
              <Cpu color="#5B3FD9" size={12} />
            </View>
            <Text className="text-caption text-fg-secondary">
              {t("varieties:editor.classesFrom", { model: "Seed-Detect v3.1" })}
            </Text>
          </View>
          <View className="flex-row items-center gap-sm rounded-md border border-line-secondary bg-bg-primary px-md h-11">
            <Search color="#8C8C87" size={16} />
            <TextInput
              value={classQuery}
              onChangeText={setClassQuery}
              placeholder={t("varieties:editor.searchClasses", {
                defaultValue: "Search classes",
              })}
              placeholderTextColor="rgba(23,23,23,0.42)"
              className="flex-1 text-title text-fg-primary"
            />
          </View>
          <View className="flex-row flex-wrap gap-xs pt-sm px-xs">
            {MODEL_CLASSES.filter((c) =>
              !classQuery ? true : c.toLowerCase().includes(classQuery.toLowerCase()),
            ).map((cls) => {
              const active = selectedClasses.includes(cls);
              return (
                <ModelClassChip
                  key={cls}
                  label={cls}
                  active={active}
                  onPress={() =>
                    setSelectedClasses((prev) =>
                      prev.includes(cls) ? prev.filter((p) => p !== cls) : [...prev, cls],
                    )
                  }
                />
              );
            })}
          </View>
          <Text className="text-caption text-fg-tertiary px-xs pt-sm">
            {t("varieties:editor.selectedHint", {
              count: selectedClasses.length,
            })}
          </Text>
        </FormSection>

        {/* Capture defaults */}
        <FormSection title={t("varieties:editor.sectionCaptureDefaults")}>
          <ToggleRow
            label={t("varieties:editor.captureLighting")}
            value={defLighting}
            onValueChange={setDefLighting}
          />
          <ToggleRow
            label={t("varieties:editor.captureSurface")}
            value={defSurface}
            onValueChange={setDefSurface}
          />
          <ToggleRow
            label={t("varieties:editor.captureMultiSeed")}
            value={defMultiSeed}
            onValueChange={setDefMultiSeed}
          />
        </FormSection>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers — mirror prototype's FormSection / Field / FieldHalf / RangeField

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-xl">
      <Text className="px-xs pb-sm text-body font-medium text-fg-primary">{title}</Text>
      {children}
    </View>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <Text
      className="px-xs pb-xs font-semibold uppercase text-fg-tertiary"
      style={{ fontSize: 11, letterSpacing: 0.6 }}
    >
      {children}
    </Text>
  );
}

function Field({
  label,
  value,
  onChangeText,
  mono,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <View className="mb-sm">
      <Caption>{label}</Caption>
      <Input
        value={value}
        onChangeText={onChangeText}
        style={mono ? { fontFamily: "Menlo", fontSize: 13 } : undefined}
      />
    </View>
  );
}

function FieldHalf({
  label,
  value,
  onChangeText,
  mono,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  mono?: boolean;
  keyboardType?: "decimal-pad" | "default";
}) {
  return (
    <View className="flex-1 mb-sm">
      <Caption>{label}</Caption>
      <Input
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        style={mono ? { fontFamily: "Menlo", fontSize: 13 } : undefined}
      />
    </View>
  );
}

function RangeField({
  label,
  lo,
  hi,
  unit,
  onChangeLo,
  onChangeHi,
}: {
  label: string;
  lo: string;
  hi: string;
  unit: string;
  onChangeLo: (v: string) => void;
  onChangeHi: (v: string) => void;
}) {
  return (
    <View>
      <Caption>{label}</Caption>
      <View className="flex-row items-center gap-xs">
        <TextInput
          value={lo}
          onChangeText={onChangeLo}
          keyboardType="decimal-pad"
          className="flex-1 h-10 rounded-md border border-line-secondary bg-bg-primary text-center text-fg-primary"
          style={{ fontFamily: "Menlo", fontSize: 13 }}
        />
        <Text className="text-caption text-fg-tertiary">—</Text>
        <TextInput
          value={hi}
          onChangeText={onChangeHi}
          keyboardType="decimal-pad"
          className="flex-1 h-10 rounded-md border border-line-secondary bg-bg-primary text-center text-fg-primary"
          style={{ fontFamily: "Menlo", fontSize: 13 }}
        />
        <Text className="text-caption text-fg-tertiary">{unit}</Text>
      </View>
    </View>
  );
}

function FamilyChip({
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
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`h-8 px-md rounded-full items-center justify-center ${
        active ? "bg-primary" : "bg-bg-primary border border-line-secondary"
      }`}
    >
      <Text
        className={`${active ? "text-primary-on font-semibold" : "text-fg-primary font-medium"}`}
        style={{ fontSize: 12 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ModelClassChip({
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
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`h-[30px] px-md rounded-full flex-row items-center gap-xs ${
        active ? "bg-primary" : "bg-bg-primary border border-line-secondary"
      }`}
    >
      {active ? <Check color="#FFFFFF" size={12} /> : null}
      <Text
        className={active ? "text-primary-on" : "text-fg-primary"}
        style={{
          fontFamily: "Menlo",
          fontSize: 12,
          fontWeight: active ? "600" : "500",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between rounded-md border border-line-tertiary bg-bg-primary px-md mb-xs h-11">
      <Text className="text-body font-medium text-fg-primary">{label}</Text>
      <Toggle value={value} onValueChange={onValueChange} accessibilityLabel={label} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Data — mirrors the prototype's hardcoded sets

const FAMILIES: { key: "rice" | "corn" | "legume" | "mungbean" }[] = [
  { key: "rice" },
  { key: "corn" },
  { key: "legume" },
  { key: "mungbean" },
];

interface GradeRow {
  g: "A" | "B" | "C";
  tintBg: string;
  tintInk: string;
  lo: string;
  hi: string;
}

const DEFAULT_GRADES: GradeRow[] = [
  { g: "A", tintBg: "bg-card-mint", tintInk: "text-grade-a-ink", lo: "7.5", hi: "9.0" },
  { g: "B", tintBg: "bg-card-yellow", tintInk: "text-grade-b-ink", lo: "6.5", hi: "7.5" },
  { g: "C", tintBg: "bg-card-peach", tintInk: "text-grade-c-ink", lo: "5.5", hi: "6.5" },
];

function updateGrade(
  setGrades: React.Dispatch<React.SetStateAction<GradeRow[]>>,
  g: "A" | "B" | "C",
  patch: Partial<Pick<GradeRow, "lo" | "hi">>,
) {
  setGrades((prev) => prev.map((row) => (row.g === g ? { ...row, ...patch } : row)));
}

const MODEL_CLASSES = [
  "oryza_sativa",
  "zea_mays",
  "glycine_max",
  "vigna_radiata",
  "vigna_mungo",
  "sorghum_bicolor",
  "triticum_aestivum",
  "arachis_hypogaea",
  "phaseolus_vulgaris",
];
