import { useEffect, useRef, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import type { AnalysisResult } from "@advance-seeds/types";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useAnalyzer } from "@/lib/analyzer/AnalyzerProvider";
import { useCaptureSession } from "@/lib/capture/session";
import { ProcessingOrb } from "@/components/camera/ProcessingOrb";
import { Button } from "@/components/ui/Button";

/**
 * Post-shutter processing screen.
 *
 * Sequence (real work):
 *   1. Upload the captured frame to Supabase Storage.
 *   2. Run the analyzer on the URI to produce an AnalysisResult.
 *   3. Stash the result on the session and route to /capture/review.
 *
 * Visual (prototype-faithful):
 *   • Brand-tinted spinning orb above the headline.
 *   • Four-step checklist:
 *       - "Frame captured"        — checked immediately on mount.
 *       - "Calibration applied"   — checked at ~600 ms (decorative; Phase 5
 *                                    hooks a real LiveCalibrator here).
 *       - "Detected N seeds"      — checked once the analyzer returns the
 *                                    actual count from AnalysisResult.
 *       - "Grading quality…"      — spinner until the full result lands.
 *   • "View results" CTA — disabled until the analyzer completes; on tap,
 *     replaces this route with /capture/review.
 *
 * Errors fall back to a single-screen retry/cancel state. We don't leave
 * the user staring at a stuck checklist.
 */
type Step = "captured" | "calibration" | "detected" | "grading";

export default function CaptureProcessing() {
  const { t } = useTranslation(["common", "inspections"]);
  const router = useRouter();
  const { profile } = useAuth();
  const analyzer = useAnalyzer();
  const session = useCaptureSession();

  const [completed, setCompleted] = useState<Set<Step>>(new Set());
  const [detectedCount, setDetectedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const cancelledRef = useRef(false);

  const markStep = (step: Step) =>
    setCompleted((prev) => {
      if (prev.has(step)) return prev;
      const next = new Set(prev);
      next.add(step);
      return next;
    });

  useEffect(() => {
    if (!session.capturedImageUri || !profile) {
      router.replace("/capture/setup");
      return;
    }

    cancelledRef.current = false;

    // Step 1 fires immediately — the captured frame already exists locally
    // by the time we land on this screen.
    markStep("captured");

    // Step 2 fires shortly after for ceremony. Real LiveCalibrator output
    // (Phase 5) replaces this timer with a `reading.confidence >= 0.6` gate.
    const calibrationTimer = setTimeout(() => {
      if (!cancelledRef.current) markStep("calibration");
    }, 600);

    void (async () => {
      try {
        // Stage 1: upload via FormData. Canonical RN pattern for Supabase
        // Storage — supabase-js detects FormData and forwards multipart.
        const path = `${profile.id}/${Date.now()}.jpg`;
        const fd = new FormData();
        fd.append("file", {
          uri: session.capturedImageUri!,
          type: "image/jpeg",
          name: "capture.jpg",
        } as unknown as Blob);
        const { error: uploadErr } = await supabase.storage
          .from("inspection-images")
          .upload(path, fd, { contentType: "image/jpeg", upsert: false });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("inspection-images").getPublicUrl(path);
        if (cancelledRef.current) return;
        session.set({ uploadedImageUrl: urlData.publicUrl });

        // Stage 2: analyze (mock for now; TFLite swaps in via Phase 4).
        const result: AnalysisResult = await analyzer.analyze(
          { kind: "uri", uri: session.capturedImageUri! },
          { pxPerMm: 38.4 },
        );
        if (cancelledRef.current) return;

        // Reveal the count step once we know the number of seeds, then
        // grading after a short pause so the user sees the transition.
        setDetectedCount(result.summary.total_seeds);
        markStep("detected");

        // Stash on session for the review screen — review will persist on Save.
        (session as unknown as { lastResult?: AnalysisResult }).lastResult = result;

        setTimeout(() => {
          if (cancelledRef.current) return;
          markStep("grading");
          setDone(true);
        }, 350);
      } catch (err) {
        if (cancelledRef.current) return;
        console.error("[processing] failed", err);
        setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelledRef.current = true;
      clearTimeout(calibrationTimer);
    };
    // Intentionally run-once on mount: the captured URI at first render is
    // what we want to upload + analyze. Re-running on session/profile/analyzer
    // changes would trigger duplicate uploads.
  }, []);

  const onViewResults = () => router.replace("/capture/review");
  const onCancel = () => {
    session.reset();
    router.replace("/capture/setup");
  };
  const onRetry = () => router.replace("/capture/processing");

  if (error) {
    return (
      <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
        <View className="flex-1 items-center justify-center gap-md px-xl">
          <Text className="text-h1 text-fg-primary font-medium">{t("common:states.error")}</Text>
          <Text className="text-body text-fg-secondary text-center">{error}</Text>
          <View className="flex-row gap-md mt-md">
            <Button variant="outline" label={t("common:actions.cancel")} onPress={onCancel} />
            <Button label={t("common:actions.retry")} onPress={onRetry} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <View className="flex-1 items-center px-xl pt-3xl">
        <View className="mt-3xl mb-xl">
          <ProcessingOrb />
        </View>

        <Text className="text-h1 text-fg-primary font-medium" style={{ fontSize: 26 }}>
          {t("inspections:capture.processing.title")}
        </Text>
        <Text className="text-body text-fg-secondary text-center mt-sm" style={{ maxWidth: 320 }}>
          {t("inspections:capture.processing.subtitle")}
        </Text>

        <View className="mt-2xl gap-md self-start" style={{ width: 240, alignSelf: "center" }}>
          <Step
            label={t("inspections:capture.processing.stepCaptured")}
            done={completed.has("captured")}
          />
          <Step
            label={t("inspections:capture.processing.stepCalibration")}
            done={completed.has("calibration")}
          />
          <Step
            label={t("inspections:capture.processing.stepDetected", {
              count: detectedCount ?? 0,
            })}
            done={completed.has("detected")}
          />
          <Step
            label={t("inspections:capture.processing.stepGrading")}
            done={completed.has("grading")}
            spinning={!completed.has("grading") && completed.has("detected")}
          />
        </View>

        <View className="mt-3xl" style={{ width: 240 }}>
          <Button
            variant="tinted"
            label={t("inspections:capture.processing.viewResults")}
            disabled={!done}
            onPress={onViewResults}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function Step({
  label,
  done,
  spinning = false,
}: {
  label: string;
  done: boolean;
  spinning?: boolean;
}) {
  return (
    <View className="flex-row items-center gap-md">
      {done ? (
        <Check color="#0F6E56" size={16} />
      ) : spinning ? (
        <ActivityIndicator color="#0F6E56" size="small" />
      ) : (
        <View
          className="h-4 w-4 rounded-full"
          style={{ borderWidth: 1.5, borderColor: "rgba(0,0,0,0.12)" }}
        />
      )}
      <Text className={done ? "text-fg-primary" : "text-fg-secondary"} style={{ fontSize: 13 }}>
        {label}
      </Text>
    </View>
  );
}
