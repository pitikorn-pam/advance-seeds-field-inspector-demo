import { useState } from "react";
import { ScrollView, View, Text, Image, Alert, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { X, Share2, ChevronRight, Check } from "lucide-react-native";
import type { AnalysisResult, AnalyzedSeed, SeedGrade } from "@advance-seeds/types";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useCaptureSession } from "@/lib/capture/session";
import { useCreateInspection } from "@/lib/queries";
import { Button } from "@/components/ui/Button";
import { GradeRing } from "@/components/inspections/GradeRing";

/**
 * Post-analysis review screen.
 *
 * Mirrors the prototype's review layout:
 *   • Top bar  — close (X) + "Inspection result" + share icon
 *   • Hero     — captured photo with bounding-box overlay (placeholder until
 *                Phase 4 supplies real bboxes — today the image renders alone)
 *   • Summary  — Grade A ring + total seeds + avg dimensions
 *   • Per-seed — scrollable list of seeds with grade pill + dimensions
 *   • Footer   — "Save draft" outline + "Save and sync" primary
 *
 * Save draft and Save and sync currently both persist the inspection and
 * route home; the spec doesn't yet have a draft state. The visual layout
 * preserves the prototype's two-button affordance for the later split.
 *
 * Per-seed rows are not yet tappable — the per-seed detail screen
 * (`/inspections/seed/[index]`) lands in Phase 8.1.
 */
export default function CaptureReview() {
  const { t } = useTranslation(["common", "inspections"]);
  const router = useRouter();
  const { profile } = useAuth();
  const session = useCaptureSession();
  const create = useCreateInspection();
  const [saving, setSaving] = useState(false);

  const result = (session as unknown as { lastResult?: AnalysisResult }).lastResult ?? null;

  if (!result || !session.uploadedImageUrl) {
    return (
      <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
        <View className="flex-1 items-center justify-center gap-md px-xl">
          <Text className="text-h2 text-fg-primary">{t("inspections:capture.review.missing")}</Text>
          <Button
            label={t("common:actions.back")}
            onPress={() => router.replace("/capture/setup")}
          />
        </View>
      </SafeAreaView>
    );
  }

  const seeds = result.seeds;
  const gradeAPct =
    seeds.length > 0
      ? Math.round((seeds.filter((s) => s.grade === "A").length / seeds.length) * 100)
      : 0;
  const avgLen = result.summary.mean_length_mm;
  const avgWid = result.summary.mean_width_mm;

  const onSave = async () => {
    if (!profile || !session.uploadedImageUrl || !session.varietyId) return;
    setSaving(true);
    try {
      // Persist the active ROI (if any) on inspection metadata. Future fields
      // (calibration confidence, model version) join this same bag.
      const metadata = session.roi ? { roi: session.roi } : null;
      const id = await create.mutateAsync({
        inspector_id: profile.id,
        variety_id: session.varietyId,
        batch_id: session.batchId,
        calibration_id: session.calibrationId,
        image_url: session.uploadedImageUrl,
        ...result.summary,
        seeds: result.seeds,
        metadata,
      });
      session.reset();
      router.replace(`/inspections/${id}`);
    } catch (err) {
      Alert.alert(t("common:states.error"), err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  const onClose = () => {
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
          router.replace("/");
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <View className="flex-row items-center justify-between px-xl py-md">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common:actions.cancel")}
          className="h-9 w-9 items-center justify-center rounded-full bg-bg-tertiary"
          onPress={onClose}
        >
          <X color="#1A1A1A" size={18} />
        </Pressable>
        <Text className="text-title text-fg-primary font-medium">
          {t("inspections:capture.review.title")}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share"
          className="h-9 w-9 items-center justify-center rounded-full bg-bg-tertiary"
        >
          <Share2 color="#1A1A1A" size={18} />
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="px-xl pb-2xl gap-lg">
        <View
          className="rounded-xl overflow-hidden"
          style={{ height: 200, backgroundColor: "#1a1816" }}
        >
          <Image
            source={{ uri: session.uploadedImageUrl }}
            className="w-full h-full"
            resizeMode="cover"
          />
          {/* Phase 4 overlays an SVG layer of bounding boxes here. */}
        </View>

        <View className="flex-row items-center gap-lg">
          <GradeRing
            percent={gradeAPct}
            sublabel={t("inspections:seedGrade.A")
              .replace(/^Grade\s+/, "")
              .trim()}
          />
          <View className="flex-1 gap-md">
            <View>
              <Text className="text-caption text-fg-secondary">
                {t("inspections:detail.summary.totalSeeds")}
              </Text>
              <Text
                className="text-fg-primary font-medium"
                style={{ fontSize: 22, letterSpacing: -0.4 }}
              >
                {result.summary.total_seeds}
              </Text>
            </View>
            <View>
              <Text className="text-caption text-fg-secondary">
                {t("inspections:detail.summary.meanLength")}
              </Text>
              <Text className="text-fg-primary font-medium" style={{ fontSize: 16 }}>
                {avgLen.toFixed(1)} × {avgWid.toFixed(1)} mm
              </Text>
            </View>
          </View>
        </View>

        <View className="flex-row items-center justify-between mt-sm">
          <Text className="text-title text-fg-primary font-medium">
            {t("inspections:capture.review.perSeedTitle")}
          </Text>
          <Pressable accessibilityRole="button">
            <Text className="text-brand text-caption font-medium">
              {t("inspections:capture.review.sort")}
            </Text>
          </Pressable>
        </View>

        <View className="rounded-xl bg-bg-primary border border-line-tertiary overflow-hidden">
          {seeds.map((seed, i) => (
            <SeedRow key={seed.index} seed={seed} isLast={i === seeds.length - 1} />
          ))}
        </View>
      </ScrollView>

      <View className="flex-row gap-md px-xl pb-xl pt-sm">
        <Button
          className="flex-1"
          variant="outline"
          label={t("inspections:capture.review.saveDraft")}
          disabled={saving}
          onPress={onSave}
        />
        <Button
          className="flex-1"
          label={t("inspections:capture.review.saveAndSync")}
          leadingIcon={<Check color="#FFFFFF" size={16} />}
          disabled={saving}
          onPress={onSave}
        />
      </View>
    </SafeAreaView>
  );
}

const GRADE_BG: Record<SeedGrade, string> = {
  A: "#EAF3DE",
  B: "#FAEEDA",
  C: "#FCEBEB",
  reject: "#FCEBEB",
};
const GRADE_FG: Record<SeedGrade, string> = {
  A: "#27500A",
  B: "#633806",
  C: "#791F1F",
  reject: "#791F1F",
};

function SeedRow({ seed, isLast }: { seed: AnalyzedSeed; isLast: boolean }) {
  return (
    <Pressable
      // Per-seed detail (`/inspections/seed/[index]`) lands in Phase 8.1.
      accessibilityRole="button"
      className={`flex-row items-center gap-md px-lg py-md ${isLast ? "" : "border-b border-line-tertiary"}`}
    >
      <View
        className="h-[26px] w-[26px] items-center justify-center rounded-full"
        style={{ backgroundColor: GRADE_BG[seed.grade] }}
      >
        <Text className="font-medium" style={{ fontSize: 11, color: GRADE_FG[seed.grade] }}>
          {seed.grade === "reject" ? "R" : seed.grade}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-fg-primary font-medium" style={{ fontSize: 14 }}>
          Seed #{seed.index}
        </Text>
        <Text className="text-fg-secondary" style={{ fontSize: 12 }}>
          {seed.length_mm.toFixed(1)} × {seed.width_mm.toFixed(1)} mm · area{" "}
          {seed.area_mm2.toFixed(1)} mm²
        </Text>
      </View>
      <ChevronRight color="#9D9D9A" size={16} />
    </Pressable>
  );
}
