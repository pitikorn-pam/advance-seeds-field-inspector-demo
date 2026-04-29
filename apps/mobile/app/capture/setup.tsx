import { useEffect, useMemo } from "react";
import { ScrollView, View, Text, Pressable, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { X, MapPin } from "lucide-react-native";
import { useVarieties, useBatches, useCalibrations } from "@/lib/queries";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { LoadingState } from "@/components/ui/States";
import { DropdownSearch } from "@/components/ui/DropdownSearch";
import type { DropdownItem } from "@/components/ui/DropdownSearch";
import { useCaptureSession } from "@/lib/capture/session";

const VARIETY_TINTS: Record<string, { bg: string; fg: string }> = {
  corn: { bg: "#FAEEDA", fg: "#854F0B" },
  rice: { bg: "#EAF3DE", fg: "#3B6D11" },
  legume: { bg: "#E1F5EE", fg: "#0F6E56" },
  mungbean: { bg: "#FAECE7", fg: "#993C1D" },
};

/**
 * /capture/setup — first step of the three-step capture journey.
 *
 * Variety + batch are now in-place dropdown-search inputs (instead of
 * the previous variety-picker route + button list). Variety is mandatory
 * with an "Other (unspecified)" fallback option always available. Batch
 * is non-mandatory. Continue button is disabled while mandatory fields
 * are unset.
 *
 * Calibration profile selector remains as a button list — only a handful
 * of profiles in the demo dataset, so a full picker is overkill.
 *
 * Auto-tag location toggle records intent in capture session; actual
 * GPS capture is wired by the upcoming expo-location commit.
 */
export default function CaptureSetup() {
  const { t } = useTranslation(["common", "inspections"]);
  const router = useRouter();
  const session = useCaptureSession();

  const varieties = useVarieties();
  const batches = useBatches();
  const calibrations = useCalibrations();

  // Default to first calibration profile so manual calibration is active
  // out of the box. Don't reset if the user has explicitly cleared.
  useEffect(() => {
    if (!session.calibrationId && calibrations.data && calibrations.data.length > 0) {
      session.set({ calibrationId: calibrations.data[0].id });
    }
  }, [calibrations.data, session]);

  const varietyOptions = useMemo<DropdownItem[]>(() => {
    if (!varieties.data) return [];
    return varieties.data.map((v) => {
      const tint = VARIETY_TINTS[v.color_key ?? ""] ?? null;
      return {
        id: v.id,
        label: v.name,
        meta: v.scientific_name ?? null,
        leading: tint ? (
          <VarietyThumb letter={v.name.charAt(0)} tint={tint} />
        ) : (
          <VarietyThumb letter={v.name.charAt(0)} tint={{ bg: "#F4F4F1", fg: "#6B6B68" }} />
        ),
      };
    });
  }, [varieties.data]);

  const batchOptions = useMemo<DropdownItem[]>(() => {
    if (!batches.data) return [];
    return batches.data.map((b) => ({
      id: b.id,
      label: b.code,
      meta: b.location ?? null,
    }));
  }, [batches.data]);

  if (varieties.isLoading || batches.isLoading || calibrations.isLoading) {
    return <LoadingState />;
  }

  const canContinue = !!session.varietyId;

  const onContinue = () => {
    if (!canContinue) return;
    router.push("/capture/mode" as never);
  };

  const onClose = () => router.replace("/");

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("common:actions.newInspection")}
        left={{
          accessibilityLabel: t("common:actions.cancel"),
          icon: <X color="#1A1A1A" size={18} />,
          onPress: onClose,
        }}
      />
      <ScrollView contentContainerClassName="px-xl py-md gap-lg">
        <Text className="text-body text-fg-secondary px-xs">
          {t("inspections:capture.setupSubtitle")}
        </Text>

        {/* Variety — mandatory dropdown with search. */}
        <View className="gap-xs">
          <Text className="text-caption uppercase text-fg-secondary px-xs">
            {t("inspections:capture.selectVariety")}
            <Text className="text-danger-text"> *</Text>
          </Text>
          <DropdownSearch
            value={session.varietyId}
            onChange={(id) => session.set({ varietyId: id })}
            options={varietyOptions}
            placeholder={t("inspections:capture.varietyPlaceholder")}
            invalid={!session.varietyId}
          />
        </View>

        {/* Batch — non-mandatory dropdown with search. */}
        <View className="gap-xs">
          <Text className="text-caption uppercase text-fg-secondary px-xs">
            {t("inspections:capture.selectBatch")}
          </Text>
          <DropdownSearch
            value={session.batchId}
            onChange={(id) => session.set({ batchId: id })}
            options={batchOptions}
            placeholder={t("inspections:capture.batchPlaceholder")}
            clearable
          />
        </View>

        {/* Calibration profile — small set; button list is fine. */}
        <View className="gap-xs">
          <Text className="text-caption uppercase text-fg-secondary px-xs">
            {t("inspections:capture.selectCalibration")}
          </Text>
          <View className="flex-row flex-wrap gap-xs">
            {calibrations.data?.map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant={session.calibrationId === c.id ? "primary" : "outline"}
                label={c.name}
                onPress={() => session.set({ calibrationId: c.id })}
              />
            ))}
          </View>
        </View>

        {/* Notes textarea. */}
        <View className="gap-xs">
          <Text className="text-caption uppercase text-fg-secondary px-xs">
            {t("inspections:capture.notesLabel")}{" "}
            <Text className="text-caption text-fg-tertiary">
              · {t("inspections:capture.notesOptional")}
            </Text>
          </Text>
          <TextInput
            placeholder={t("inspections:capture.notesPlaceholder")}
            placeholderTextColor="#9D9D9A"
            value={session.notes}
            onChangeText={(notes) => session.set({ notes })}
            multiline
            textAlignVertical="top"
            className="rounded-xl bg-bg-primary border border-line-tertiary px-md py-md text-body text-fg-primary"
            style={{ minHeight: 96 }}
          />
        </View>

        {/* Auto-tag location toggle — actual GPS capture wired in upcoming
            expo-location commit; today we record intent only. */}
        <Card className="flex-row items-center gap-md">
          <View
            className="items-center justify-center bg-brand-soft"
            style={{ width: 32, height: 32, borderRadius: 10 }}
          >
            <MapPin color="#0F6E56" size={16} />
          </View>
          <View className="flex-1">
            <Text className="text-title text-fg-primary font-medium">
              {t("inspections:capture.autoTagTitle")}
            </Text>
            <Text className="text-caption text-fg-secondary">
              {t("inspections:capture.autoTagSubtitle")}
            </Text>
          </View>
          <Toggle
            value={session.locationTagEnabled}
            onChange={(v) => session.set({ locationTagEnabled: v })}
          />
        </Card>
      </ScrollView>

      <View className="px-xl pb-xl pt-sm">
        <Button label={t("common:actions.continue")} disabled={!canContinue} onPress={onContinue} />
      </View>
    </SafeAreaView>
  );
}

function VarietyThumb({ letter, tint }: { letter: string; tint: { bg: string; fg: string } }) {
  return (
    <View
      className="items-center justify-center"
      style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: tint.bg }}
    >
      <Text className="font-medium" style={{ color: tint.fg, fontSize: 13 }}>
        {letter}
      </Text>
    </View>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={{
        width: 50,
        height: 30,
        borderRadius: 15,
        padding: 3,
        backgroundColor: value ? "#0F6E56" : "rgba(0,0,0,0.16)",
      }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: "white",
          transform: [{ translateX: value ? 20 : 0 }],
        }}
      />
    </Pressable>
  );
}
