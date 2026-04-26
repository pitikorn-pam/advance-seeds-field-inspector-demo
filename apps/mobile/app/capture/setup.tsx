import { useState } from "react";
import { ScrollView, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Camera } from "lucide-react-native";
import { useVarieties, useBatches, useCalibrations } from "@/lib/queries";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingState } from "@/components/ui/States";
import { useCaptureSession } from "@/lib/capture/session";

type Mode = "live" | "precise";

export default function CaptureSetup() {
  const { t } = useTranslation(["common", "inspections"]);
  const router = useRouter();
  const session = useCaptureSession();

  const varieties = useVarieties();
  const batches = useBatches();
  const calibrations = useCalibrations();

  const [varietyId, setVarietyId] = useState<string | null>(session.varietyId);
  const [batchId, setBatchId] = useState<string | null>(session.batchId);
  const [calibrationId, setCalibrationId] = useState<string | null>(session.calibrationId);
  const [mode, setMode] = useState<Mode>(session.mode ?? "live");

  if (varieties.isLoading || batches.isLoading || calibrations.isLoading) {
    return <LoadingState />;
  }

  const canStart = !!varietyId;

  const startCapture = () => {
    session.set({
      varietyId,
      batchId,
      calibrationId: calibrationId ?? calibrations.data?.[0]?.id ?? null,
      mode,
    });
    router.push(mode === "live" ? "/capture/scan" : "/capture/precise");
  };

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <ScrollView contentContainerClassName="px-xl py-xl gap-xl">
        <Text className="text-h1 font-medium text-fg-primary">
          {t("common:actions.newInspection")}
        </Text>

        <Card>
          <Text className="text-h2 font-medium text-fg-primary mb-md">
            {t("inspections:capture.setup")}
          </Text>

          <Text className="text-caption uppercase text-fg-secondary mb-xs">
            {t("inspections:capture.selectVariety")}
          </Text>
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

          <Text className="text-caption uppercase text-fg-secondary mb-xs mt-md">
            {t("inspections:capture.selectBatch")}
          </Text>
          <View className="flex-row flex-wrap gap-xs">
            <Button
              size="sm"
              variant={batchId === null ? "primary" : "outline"}
              label="—"
              onPress={() => setBatchId(null)}
            />
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

          <Text className="text-caption uppercase text-fg-secondary mb-xs mt-md">
            {t("inspections:capture.selectCalibration")}
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
          <View className="gap-sm">
            <ModeOption
              active={mode === "live"}
              title={t("inspections:capture.modeLive")}
              hint={t("inspections:capture.modeLiveHint")}
              onPress={() => setMode("live")}
            />
            <ModeOption
              active={mode === "precise"}
              title={t("inspections:capture.modePrecise")}
              hint={t("inspections:capture.modePreciseHint")}
              onPress={() => setMode("precise")}
            />
          </View>
        </Card>

        <Button
          label={t("inspections:capture.startCapture")}
          leadingIcon={<Camera color="#FFFFFF" size={18} />}
          disabled={!canStart}
          onPress={startCapture}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function ModeOption({
  active,
  title,
  hint,
  onPress,
}: {
  active: boolean;
  title: string;
  hint: string;
  onPress: () => void;
}) {
  const ringClass = active ? "border-brand bg-brand-soft" : "border-line-tertiary bg-bg-primary";
  return (
    <View className={`rounded-lg border ${ringClass}`}>
      <Button variant="ghost" className="items-start justify-start py-md" onPress={onPress}>
        <View className="flex-1 gap-xs">
          <Text
            className={`text-title font-medium ${active ? "text-brand-deep" : "text-fg-primary"}`}
          >
            {title}
          </Text>
          <Text className="text-caption text-fg-secondary">{hint}</Text>
        </View>
      </Button>
    </View>
  );
}
