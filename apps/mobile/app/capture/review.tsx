import { useState } from "react";
import { ScrollView, View, Text, Image, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Save, X } from "lucide-react-native";
import type { AnalysisResult } from "@advance-seeds/types";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useCaptureSession } from "@/lib/capture/session";
import { useCreateInspection } from "@/lib/queries";
import { Card, StatTile } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";

/**
 * Post-analysis review screen. Renders the captured frame with bounding-box
 * overlays + summary stat tiles. The user chooses to Save (commits an
 * inspection row + child seeds) or Discard (deletes the uploaded image
 * from storage and returns to setup).
 *
 * Phase 2 scope: bbox overlay is a placeholder count of detected seeds —
 * the actual SVG box layer lands once Phase 4 supplies real bbox data.
 * Stat tiles are wired off the analyzer's summary regardless of mock vs
 * real implementation.
 */
export default function CaptureReview() {
  const { t } = useTranslation(["common", "inspections"]);
  const router = useRouter();
  const { profile } = useAuth();
  const session = useCaptureSession();
  const create = useCreateInspection();
  const [saving, setSaving] = useState(false);

  // The processing screen stashes lastResult on the session as a private
  // field — typed-cast through unknown to read it back. Once Phase 4 lands,
  // this will move to a typed slot on the session shape.
  const result = (session as unknown as { lastResult?: AnalysisResult }).lastResult ?? null;

  const onSave = async () => {
    if (!profile || !result || !session.uploadedImageUrl || !session.varietyId) return;
    setSaving(true);
    try {
      const id = await create.mutateAsync({
        inspector_id: profile.id,
        variety_id: session.varietyId,
        batch_id: session.batchId,
        calibration_id: session.calibrationId,
        image_url: session.uploadedImageUrl,
        ...result.summary,
        seeds: result.seeds,
      });
      session.reset();
      router.replace(`/inspections/${id}`);
    } catch (err) {
      Alert.alert(t("common:states.error"), err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  const onDiscard = () => {
    Alert.alert(t("common:actions.delete"), t("inspections:detail.deleteConfirm"), [
      { text: t("common:actions.cancel"), style: "cancel" },
      {
        text: t("common:actions.delete"),
        style: "destructive",
        onPress: async () => {
          // Best-effort delete the orphaned upload before bailing.
          if (session.uploadedImageUrl) {
            const path = session.uploadedImageUrl.split("/inspection-images/")[1];
            if (path) {
              void supabase.storage.from("inspection-images").remove([path]);
            }
          }
          session.reset();
          router.replace("/capture/setup");
        },
      },
    ]);
  };

  if (!result || !session.uploadedImageUrl) {
    return (
      <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
        <View className="flex-1 items-center justify-center gap-md px-xl">
          <Text className="text-h2 text-fg-primary">{t("common:states.error")}</Text>
          <Button
            label={t("common:actions.back")}
            onPress={() => router.replace("/capture/setup")}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <ScrollView contentContainerClassName="px-xl py-md gap-lg pb-2xl">
        <View className="rounded-xl overflow-hidden">
          <Image
            source={{ uri: session.uploadedImageUrl }}
            className="aspect-[4/3] w-full"
            resizeMode="cover"
          />
          {/* Phase 4 will overlay an SVG layer of bounding boxes here,
              colored by grade. Today we render a count badge. */}
          <View className="absolute right-md top-md">
            <Pill tone="brand" label={`${result.summary.total_seeds} seeds`} />
          </View>
        </View>

        <View className="flex-row gap-sm">
          <StatTile
            value={result.summary.total_seeds}
            label={t("inspections:detail.summary.totalSeeds")}
          />
          <StatTile
            value={Number(result.summary.mean_length_mm).toFixed(2)}
            label={t("inspections:detail.summary.meanLength")}
          />
        </View>
        <View className="flex-row gap-sm">
          <StatTile
            value={Number(result.summary.mean_width_mm).toFixed(2)}
            label={t("inspections:detail.summary.meanWidth")}
          />
          <StatTile
            value={Number(result.summary.mean_area_mm2).toFixed(2)}
            label={t("inspections:detail.summary.meanArea")}
          />
        </View>

        <Card>
          <Text className="text-h2 font-medium text-fg-primary mb-md">
            {t("inspections:detail.perSeedTitle")}
          </Text>
          <Text className="text-body text-fg-secondary">
            {result.seeds.length} {t("inspections:detail.summary.totalSeeds").toLowerCase()}
          </Text>
        </Card>

        <View className="flex-row gap-md">
          <Button
            className="flex-1"
            variant="outline"
            label={t("common:actions.cancel")}
            leadingIcon={<X color="#1A1A1A" size={16} />}
            onPress={onDiscard}
          />
          <Button
            className="flex-1"
            label={t("common:actions.save")}
            leadingIcon={<Save color="#FFFFFF" size={16} />}
            disabled={saving}
            onPress={onSave}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
