import { useEffect, useMemo, useState } from "react";
import { ScrollView, View, Text, Alert, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { ChevronLeft, Share2, ChevronRight, Check } from "lucide-react-native";
import type { AnalyzedSeed, SeedGrade } from "@advance-seeds/types";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useCaptureSession } from "@/lib/capture/session";
import { getCurrentLocation } from "@/lib/capture/location";
import { shareImageWithRoi, shareVideo } from "@/lib/capture/imageActions";
import { useCreateInspection } from "@/lib/queries";
import { useNotify } from "@/lib/notifications";
import { Button } from "@/components/ui/Button";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { GradeRing } from "@/components/inspections/GradeRing";
import { CaptureMediaPreview } from "@/components/capture/CaptureMediaPreview";

type SortMode = "index" | "grade" | "length";

/**
 * Post-analysis review screen.
 *
 * Mirrors the prototype's review layout:
 *   • Top bar  — back + "Inspection result" + share icon
 *   • Hero     — captured photo, plus live-mode ROI overlay when present
 *   • Summary  — Grade A ring + total seeds + avg dimensions
 *   • Per-seed — scrollable list of seeds with grade pill + dimensions
 *   • Footer   — cancel + "Save and sync" primary
 *
 * Per-seed rows are not yet tappable — the per-seed detail screen
 * (`/inspections/seed/[index]`) lands in Phase 8.1.
 */
export default function CaptureReview() {
  const { t } = useTranslation(["common", "inspections", "notifications"]);
  const router = useRouter();
  const { profile } = useAuth();
  const session = useCaptureSession();
  const create = useCreateInspection();
  const notify = useNotify();
  const [saving, setSaving] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("index");

  const result = session.analysisResult;
  const seeds = useMemo(() => {
    if (!result) return [];
    const next = [...result.seeds];
    if (sortMode === "grade") {
      const order: Record<SeedGrade, number> = { A: 0, B: 1, C: 2, reject: 3 };
      return next.sort((a, b) => order[a.grade] - order[b.grade] || a.index - b.index);
    }
    if (sortMode === "length") {
      return next.sort((a, b) => b.length_mm - a.length_mm || a.index - b.index);
    }
    return next.sort((a, b) => a.index - b.index);
  }, [result, sortMode]);

  // Fetch GPS once on mount when the user opted into auto-tag location.
  // Done here rather than at save time so the reading is captured close
  // to the actual photo moment (the user is still standing where they
  // pointed the camera) — and so the save click stays snappy.
  useEffect(() => {
    if (!session.locationTagEnabled) return;
    if (session.capturedLocation) return;
    void (async () => {
      const loc = await getCurrentLocation(t);
      if (loc) session.set({ capturedLocation: loc });
    })();
    // Intentional: depend only on the toggle so we fetch once per
    // session-enabled review. `session` is a hook closure that changes
    // each render — including it would re-trigger fetches.
  }, [session.locationTagEnabled]);

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

  const gradeAPct =
    seeds.length > 0
      ? Math.round((seeds.filter((s) => s.grade === "A").length / seeds.length) * 100)
      : 0;
  const avgLen = result.summary.mean_length_mm;
  const avgWid = result.summary.mean_width_mm;
  const mediaKind = session.capturedMediaKind;
  const previewRoi = session.mode === "live" && mediaKind === "photo" ? session.roi : null;

  const openSort = () => {
    Alert.alert(t("inspections:capture.review.sort"), undefined, [
      {
        text: t("inspections:capture.review.sortIndex"),
        onPress: () => setSortMode("index"),
      },
      {
        text: t("inspections:capture.review.sortGrade"),
        onPress: () => setSortMode("grade"),
      },
      {
        text: t("inspections:capture.review.sortLength"),
        onPress: () => setSortMode("length"),
      },
      { text: t("common:actions.cancel"), style: "cancel" },
    ]);
  };

  const onShare = async () => {
    const uri =
      mediaKind === "video"
        ? (session.uploadedImageUrl ?? session.capturedVideoUri)
        : (session.capturedImageUri ?? session.uploadedImageUrl);
    if (!uri) return;
    try {
      if (mediaKind === "video") {
        await shareVideo(uri, t("inspections:capture.review.shareVideo"));
      } else {
        await shareImageWithRoi(uri, previewRoi, t("inspections:capture.review.shareImage"));
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      Alert.alert(t("common:states.error"), reason);
    }
  };

  const onSave = async () => {
    if (!profile || !session.uploadedImageUrl || !session.varietyId) return;
    setSaving(true);
    try {
      // Persist capture-time context on inspection metadata: ROI shape (if
      // drawn), notes, and the auto-tag-location intent. Future fields
      // (calibration confidence, model version) join this same bag.
      const metadataParts: Record<string, unknown> = {};
      if (session.roi) metadataParts.roi = session.roi;
      metadataParts.capture_media = {
        kind: mediaKind,
        url: session.uploadedImageUrl,
        recording_id: mediaKind === "video" ? session.recordingId : null,
        duration_ms: mediaKind === "video" ? session.recordingDurationMs : null,
      };
      if (session.locationTagEnabled) {
        metadataParts.location_capture_enabled = true;
        if (session.capturedLocation) metadataParts.location = session.capturedLocation;
      }
      const trimmedNotes = session.notes.trim();
      const metadata = Object.keys(metadataParts).length > 0 ? metadataParts : null;
      const id = await create.mutateAsync({
        inspector_id: profile.id,
        variety_id: session.varietyId,
        batch_id: session.batchId,
        calibration_id: session.calibrationId,
        image_url: session.uploadedImageUrl,
        ...result.summary,
        seeds: result.seeds,
        metadata,
        notes: trimmedNotes.length > 0 ? trimmedNotes : null,
      });
      // Fire-and-forget — the notification is a milestone marker, not a
      // gating action. If it fails to insert, the local optimistic add
      // still shows the user immediate feedback.
      notify({
        kind: "success",
        title: t("notifications:captureSaved.title"),
        body: t("notifications:captureSaved.body", {
          variety: result.summary.total_seeds,
          count: result.summary.total_seeds,
        }),
        route: `/inspections/${id}`,
      });
      session.reset();
      router.replace(`/inspections/${id}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      notify({
        kind: "error",
        title: t("notifications:captureFailed.title"),
        body: t("notifications:captureFailed.body", { reason }),
      });
      Alert.alert(t("common:states.error"), reason);
      setSaving(false);
    }
  };

  const onCancel = () => {
    Alert.alert(t("common:actions.delete"), t("inspections:detail.deleteConfirm"), [
      { text: t("common:actions.cancel"), style: "cancel" },
      {
        text: t("common:actions.delete"),
        style: "destructive",
        onPress: async () => {
          // Best-effort delete the orphaned upload before bailing.
          if (session.uploadedImageUrl) {
            if (session.capturedMediaKind === "video") {
              const path = session.uploadedImageUrl.split("/recordings/")[1];
              if (path) void supabase.storage.from("recordings").remove([path]);
              if (session.recordingId) {
                void supabase
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  .from("recordings" as any)
                  .delete()
                  .eq("id", session.recordingId);
              }
            } else {
              const path = session.uploadedImageUrl.split("/inspection-images/")[1];
              if (path) {
                void supabase.storage.from("inspection-images").remove([path]);
              }
            }
          }
          session.reset();
          router.replace("/");
        },
      },
    ]);
  };

  const onBack = () => {
    router.replace("/capture/mode");
  };

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("inspections:capture.review.title")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          icon: <ChevronLeft color="#1A1A1A" size={20} />,
          onPress: onBack,
        }}
        right={{
          accessibilityLabel: t(
            mediaKind === "video"
              ? "inspections:capture.review.shareVideo"
              : "inspections:capture.review.shareImage",
          ),
          icon: <Share2 color="#1A1A1A" size={18} />,
          onPress: onShare,
        }}
      />

      <ScrollView contentContainerClassName="px-xl pb-2xl gap-lg">
        <View
          className="rounded-xl overflow-hidden"
          style={{ height: 200, backgroundColor: "#1a1816" }}
        >
          <CaptureMediaPreview uri={session.uploadedImageUrl} kind={mediaKind} roi={previewRoi} />
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
          <Pressable accessibilityRole="button" onPress={openSort}>
            <Text className="text-brand text-caption font-medium">
              {t("inspections:capture.review.sort")} ·{" "}
              {t(`inspections:capture.review.${sortModeLabelKey(sortMode)}`)}
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
          label={t("common:actions.cancel")}
          disabled={saving}
          onPress={onCancel}
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

function sortModeLabelKey(mode: SortMode) {
  switch (mode) {
    case "grade":
      return "sortGrade";
    case "length":
      return "sortLength";
    case "index":
      return "sortIndex";
  }
}

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
