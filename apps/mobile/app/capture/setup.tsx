import { ScrollView, View, Text, Pressable, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { ChevronDown, X, MapPin } from "lucide-react-native";
import { useEffect } from "react";
import { useVarieties, useBatches, useCalibrations } from "@/lib/queries";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingState } from "@/components/ui/States";
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
 * Per prototype-fidelity-pass D2 / D3, this screen captures inspection
 * metadata (variety, batch, calibration profile, notes, location toggle).
 * Mode selection moved to /capture/mode in the Continue flow.
 *
 * The variety selector opens /capture/variety-picker (a dedicated screen
 * scoped to selection rather than reusing the Library tab) so dismiss
 * back to setup is unambiguous.
 *
 * Batch is still a button-list because admin-only RLS on the batches
 * table means an inspector can't free-form add a batch row.
 *
 * Calibration selector returns in this commit (Phase 5 manual): the
 * chosen profile drives the precise-mode CalibrationBanner via the
 * `useCalibrator` hook. Defaults to the first available profile so the
 * banner reads "locked" out of the box; user can switch.
 */
export default function CaptureSetup() {
  const { t } = useTranslation(["common", "inspections"]);
  const router = useRouter();
  const session = useCaptureSession();

  const varieties = useVarieties();
  const batches = useBatches();
  const calibrations = useCalibrations();

  // Default to the first calibration profile so manual calibration is
  // active out of the box. Without this, every fresh capture session
  // would show "Calibration unavailable" until the user tapped a profile.
  // Run-once on profile-data arrival; intentionally don't list session
  // in deps to avoid re-firing after the user clears the selection.
  useEffect(() => {
    if (!session.calibrationId && calibrations.data && calibrations.data.length > 0) {
      session.set({ calibrationId: calibrations.data[0].id });
    }
  }, [calibrations.data, session]);

  if (varieties.isLoading || batches.isLoading || calibrations.isLoading) {
    return <LoadingState />;
  }

  const selectedVariety = varieties.data?.find((v) => v.id === session.varietyId) ?? null;
  const tint = selectedVariety
    ? (VARIETY_TINTS[selectedVariety.color_key ?? ""] ?? VARIETY_TINTS.rice)
    : null;
  const canContinue = !!session.varietyId;

  const onContinue = () => {
    // typedRoutes regenerates these path types when Metro starts; cast
    // until then so typecheck doesn't block on a fresh route file.
    router.push("/capture/mode" as never);
  };

  const onClose = () => router.replace("/");

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <ScrollView contentContainerClassName="px-xl py-md gap-lg">
        <View className="flex-row items-center gap-md">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common:actions.cancel")}
            className="h-9 w-9 items-center justify-center rounded-full bg-bg-tertiary"
            onPress={onClose}
          >
            <X color="#1A1A1A" size={18} />
          </Pressable>
          <Text className="flex-1 text-h1 font-medium text-fg-primary">
            {t("common:actions.newInspection")}
          </Text>
        </View>

        <Text className="text-body text-fg-secondary px-xs">
          {t("inspections:capture.setupSubtitle")}
        </Text>

        {/* Variety selector — opens /capture/variety-picker. */}
        <View className="gap-xs">
          <Text className="text-caption uppercase text-fg-secondary px-xs">
            {t("inspections:capture.selectVariety")}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/capture/variety-picker" as never)}
            className="flex-row items-center gap-md rounded-xl bg-bg-primary border border-line-tertiary px-md py-md"
          >
            {selectedVariety && tint ? (
              <View
                className="items-center justify-center"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  backgroundColor: tint.bg,
                }}
              >
                <Text className="font-medium" style={{ color: tint.fg, fontSize: 13 }}>
                  {selectedVariety.name.charAt(0)}
                </Text>
              </View>
            ) : (
              <View
                className="items-center justify-center bg-bg-secondary"
                style={{ width: 32, height: 32, borderRadius: 10 }}
              />
            )}
            <View className="flex-1">
              <Text className="text-body text-fg-primary">
                {selectedVariety?.name ?? t("inspections:capture.varietyPlaceholder")}
              </Text>
              {selectedVariety?.scientific_name ? (
                <Text className="text-caption text-fg-secondary italic">
                  {selectedVariety.scientific_name}
                </Text>
              ) : null}
            </View>
            <ChevronDown color="#9D9D9A" size={16} />
          </Pressable>
        </View>

        {/* Batch — see file header on why this stays a button list. */}
        <View className="gap-xs">
          <Text className="text-caption uppercase text-fg-secondary px-xs">
            {t("inspections:capture.selectBatch")}
          </Text>
          <View className="flex-row flex-wrap gap-xs">
            <Button
              size="sm"
              variant={session.batchId === null ? "primary" : "outline"}
              label="—"
              onPress={() => session.set({ batchId: null })}
            />
            {batches.data?.map((b) => (
              <Button
                key={b.id}
                size="sm"
                variant={session.batchId === b.id ? "primary" : "outline"}
                label={b.code}
                onPress={() => session.set({ batchId: b.id })}
              />
            ))}
          </View>
        </View>

        {/* Calibration profile (manual). Drives the precise-mode banner. */}
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

        {/* Notes textarea — free-form, persisted on the inspection. */}
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

        {/* Auto-tag location — UI-only toggle for now. */}
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

/**
 * Small inline toggle. Uses Pressable + animated translate for a clean
 * iOS/Android-neutral look without pulling in @react-native-community/slider.
 */
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
