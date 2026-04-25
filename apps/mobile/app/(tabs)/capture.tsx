import { useState, useEffect } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Camera, CheckCircle2 } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/lib/auth";
import { useVarieties, useBatches, useCalibrations, useCreateInspection } from "@/lib/queries";
import { useAnalyzer } from "@/lib/analyzer/AnalyzerProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { LoadingState } from "@/components/ui/States";

type Stage = "setup" | "mode" | "analyzing" | "saving" | "done";
type Mode = "single" | "batch";

const SAMPLE_IMAGE_URL = "https://images.pexels.com/photos/4110251/pexels-photo-4110251.jpeg";

export default function CaptureScreen() {
  const { t } = useTranslation(["common", "inspections"]);
  const { profile } = useAuth();
  const router = useRouter();
  const analyzer = useAnalyzer();
  const create = useCreateInspection();

  const varieties = useVarieties();
  const batches = useBatches();
  const calibrations = useCalibrations();

  const [stage, setStage] = useState<Stage>("setup");
  const [varietyId, setVarietyId] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [calibrationId, setCalibrationId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("single");
  const [progress, setProgress] = useState(0);
  const [createdId, setCreatedId] = useState<string | null>(null);

  // Default to first available calibration
  useEffect(() => {
    if (!calibrationId && calibrations.data?.[0]) setCalibrationId(calibrations.data[0].id);
  }, [calibrationId, calibrations.data]);

  const runCapture = async () => {
    if (!profile || !varietyId || !calibrationId) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStage("analyzing");
    setProgress(0);
    const cal = calibrations.data?.find((c) => c.id === calibrationId);
    const result = await analyzer.analyze(
      { kind: "uri", uri: SAMPLE_IMAGE_URL },
      {
        pxPerMm: cal?.px_per_mm ?? 38.4,
        onProgress: (p) => setProgress(p),
      },
    );
    setStage("saving");
    const id = await create.mutateAsync({
      inspector_id: profile.id,
      variety_id: varietyId,
      batch_id: batchId,
      calibration_id: calibrationId,
      image_url: SAMPLE_IMAGE_URL,
      ...result.summary,
      seeds: result.seeds,
    });
    setCreatedId(id);
    setStage("done");
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  if (varieties.isLoading || batches.isLoading || calibrations.isLoading) {
    return <LoadingState />;
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top"]}>
      <ScrollView contentContainerClassName="px-xl py-xl gap-xl">
        <Text className="text-h1 font-medium text-fg-primary">
          {t("common:actions.newInspection")}
        </Text>

        {stage === "setup" || stage === "mode" ? (
          <>
            <Card>
              <Text className="text-h2 font-medium text-fg-primary mb-md">
                {t("inspections:capture.setup")}
              </Text>
              <Text className="text-caption text-fg-secondary mb-xs">
                {t("inspections:list.filters.variety")}
              </Text>
              <View className="flex-row flex-wrap gap-xs mb-md">
                {varieties.data?.map((v) => (
                  <Pill key={v.id} tone={varietyId === v.id ? "brand" : "neutral"} label={v.name} />
                ))}
              </View>
              <View className="flex-row flex-wrap gap-xs mb-md">
                {varieties.data?.map((v) => (
                  <Button
                    key={v.id}
                    size="sm"
                    variant={varietyId === v.id ? "primary" : "outline"}
                    label={v.name}
                    onPress={() => setVarietyId(v.id)}
                  />
                ))}
              </View>

              <Text className="text-caption text-fg-secondary mb-xs mt-md">
                {t("inspections:list.filters.batch")}
              </Text>
              <View className="flex-row flex-wrap gap-xs">
                {batches.data?.map((b) => (
                  <Button
                    key={b.id}
                    size="sm"
                    variant={batchId === b.id ? "primary" : "outline"}
                    label={b.code}
                    onPress={() => setBatchId(b.id)}
                  />
                ))}
              </View>

              <Text className="text-caption text-fg-secondary mb-xs mt-md">
                {t("settings:sections.calibration")}
              </Text>
              <View className="flex-row flex-wrap gap-xs">
                {calibrations.data?.map((c) => (
                  <Button
                    key={c.id}
                    size="sm"
                    variant={calibrationId === c.id ? "primary" : "outline"}
                    label={c.name}
                    onPress={() => setCalibrationId(c.id)}
                  />
                ))}
              </View>
            </Card>

            <Card>
              <Text className="text-h2 font-medium text-fg-primary mb-md">
                {t("inspections:capture.mode")}
              </Text>
              <View className="flex-row gap-md">
                <Button
                  className="flex-1"
                  variant={mode === "single" ? "primary" : "outline"}
                  label={t("inspections:capture.modeSingle")}
                  onPress={() => setMode("single")}
                />
                <Button
                  className="flex-1"
                  variant={mode === "batch" ? "primary" : "outline"}
                  label={t("inspections:capture.modeBatch")}
                  onPress={() => setMode("batch")}
                />
              </View>
            </Card>

            <Button
              label={t("inspections:capture.shutter")}
              leadingIcon={<Camera color="#FFFFFF" size={18} />}
              disabled={!varietyId || !calibrationId}
              onPress={runCapture}
            />
          </>
        ) : null}

        {stage === "analyzing" ? (
          <Card>
            <View className="items-center gap-md py-2xl">
              <ActivityIndicator size="large" />
              <Text className="text-h2 font-medium text-fg-primary">
                {t("inspections:capture.analyzing")}
              </Text>
              <View className="h-2 w-full overflow-hidden rounded-full bg-bg-secondary">
                <View
                  className="h-2 rounded-full bg-brand"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </View>
            </View>
          </Card>
        ) : null}

        {stage === "saving" ? (
          <Card>
            <View className="items-center gap-md py-2xl">
              <ActivityIndicator />
              <Text className="text-h2 font-medium text-fg-primary">
                {t("inspections:capture.saving")}
              </Text>
            </View>
          </Card>
        ) : null}

        {stage === "done" ? (
          <Card>
            <View className="items-center gap-md py-2xl">
              <CheckCircle2 color="#0F6E56" size={36} />
              <Text className="text-h2 font-medium text-fg-primary">
                {t("inspections:capture.successToast")}
              </Text>
              <View className="flex-row gap-md mt-md">
                <Button
                  variant="outline"
                  label={t("common:actions.back")}
                  onPress={() => {
                    setStage("setup");
                    setCreatedId(null);
                  }}
                />
                <Button
                  label={t("common:actions.continue")}
                  onPress={() => {
                    if (createdId) router.replace(`/inspections/${createdId}`);
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
