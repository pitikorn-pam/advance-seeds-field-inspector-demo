import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useAnalyzer } from "@/lib/analyzer/AnalyzerProvider";
import { useCaptureSession } from "@/lib/capture/session";
import { Button } from "@/components/ui/Button";

/**
 * Post-shutter screen. Two phases:
 *   1. Upload the captured frame to Supabase Storage (public URL stored on
 *      the session for the review screen).
 *   2. Run the analyzer (mock today, TFLite in Phase 4) on the URI to get
 *      detections. Result is stashed on the session and the user is routed
 *      to /capture/review.
 *
 * The user sees the captured image with a progress overlay throughout. If
 * either step fails, the screen surfaces an error with retry / discard
 * actions. This is the screen where the prototype's "processing" overlay
 * spec lands.
 */
export default function CaptureProcessing() {
  const { t } = useTranslation(["common", "inspections"]);
  const router = useRouter();
  const { profile } = useAuth();
  const analyzer = useAnalyzer();
  const session = useCaptureSession();
  const [stage, setStage] = useState<"uploading" | "analyzing" | "error">("uploading");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session.capturedImageUri || !profile) {
      router.replace("/capture/setup");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        // Stage 1: upload via FormData. This is the canonical RN pattern for
        // Supabase Storage — supabase-js detects the FormData body and forwards
        // it as multipart/form-data, no base64 round-trip needed.
        setStage("uploading");
        const path = `${profile.id}/${Date.now()}.jpg`;
        const fd = new FormData();
        fd.append("file", {
          uri: session.capturedImageUri!,
          type: "image/jpeg",
          name: "capture.jpg",
          // RN's FormData type doesn't model { uri, type, name } — cast through
          // unknown so TS doesn't complain about the platform-specific shape.
        } as unknown as Blob);
        const { error: uploadErr } = await supabase.storage
          .from("inspection-images")
          .upload(path, fd, {
            contentType: "image/jpeg",
            upsert: false,
          });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("inspection-images").getPublicUrl(path);
        if (cancelled) return;
        session.set({ uploadedImageUrl: urlData.publicUrl });

        // Stage 2: analyze (mock for now; real model swaps in via Phase 4)
        setStage("analyzing");
        const result = await analyzer.analyze(
          { kind: "uri", uri: session.capturedImageUri! },
          {
            pxPerMm: 38.4,
            onProgress: (p) => !cancelled && setProgress(p),
          },
        );
        if (cancelled) return;

        // Stash on session for the review screen — review will persist on Save
        (session as unknown as { lastResult?: unknown }).lastResult = result;
        router.replace("/capture/review");
      } catch (err) {
        if (cancelled) return;
        console.error("[processing] failed", err);
        setError(err instanceof Error ? err.message : String(err));
        setStage("error");
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally run-once on mount: the session URI captured at first render
    // is what we want to upload. Re-running on session/profile/analyzer changes
    // would trigger duplicate uploads.
  }, []);

  return (
    <View className="flex-1 bg-black">
      {session.capturedImageUri ? (
        <Image
          source={{ uri: session.capturedImageUri }}
          className="absolute inset-0 w-full h-full"
          resizeMode="cover"
        />
      ) : null}
      <View className="absolute inset-0 bg-black/55" />

      <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
        <View className="flex-1 items-center justify-center gap-md px-xl">
          {stage === "error" ? (
            <>
              <Text className="text-white text-h2 font-medium">{t("common:states.error")}</Text>
              <Text className="text-white/70 text-body text-center">
                {error ?? t("common:states.error")}
              </Text>
              <View className="flex-row gap-md mt-md">
                <Button
                  variant="outline"
                  label={t("common:actions.cancel")}
                  onPress={() => {
                    session.reset();
                    router.replace("/capture/setup");
                  }}
                />
                <Button
                  label={t("common:actions.retry")}
                  onPress={() => router.replace("/capture/processing")}
                />
              </View>
            </>
          ) : (
            <>
              <ActivityIndicator color="#FFFFFF" size="large" />
              <Text className="text-white text-h2 font-medium">
                {stage === "uploading"
                  ? t("inspections:capture.saving")
                  : t("inspections:capture.analyzing")}
              </Text>
              {stage === "analyzing" ? (
                <View className="h-2 w-3/4 overflow-hidden rounded-full bg-white/20">
                  <View
                    className="h-2 rounded-full bg-brand"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </View>
              ) : null}
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
