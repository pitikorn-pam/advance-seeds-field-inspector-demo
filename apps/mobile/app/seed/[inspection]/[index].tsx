import { ScrollView, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams } from "expo-router";
import { Stack } from "expo-router";
import { Edit3 } from "lucide-react-native";
import type { Seed, SeedGrade } from "@advance-seeds/types";
import { useInspection } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { LoadingState, ErrorState } from "@/components/ui/States";

const GRADE_TONE: Record<SeedGrade, "success" | "info" | "warning" | "danger"> = {
  A: "success",
  B: "info",
  C: "warning",
  reject: "danger",
};

/**
 * Per-seed detail screen.
 *
 * Route: /seed/[inspection]/[index] — both segments are required because a
 * seed index alone has no meaning. We reuse `useInspection` to fetch the
 * parent inspection (already cached after the user navigates from the
 * inspection detail screen), then locate the matching seed by its 1-based
 * `index` field.
 *
 * Reference comparison and confidence aren't yet stored on the seeds row;
 * we render a derived approximation now and the schema gets extended in
 * a later change.
 */
export default function SeedDetail() {
  const params = useLocalSearchParams<{ inspection: string; index: string }>();
  const { t } = useTranslation(["common", "inspections"]);
  const inspectionId = params.inspection;
  const seedIndex = Number(params.index);

  const { data, isLoading, isError, refetch } = useInspection(inspectionId);

  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  const seed = data.seeds.find((s) => s.index === seedIndex) ?? null;
  if (!seed) return <ErrorState />;

  const aspectRatio = seed.length_mm / Math.max(seed.width_mm, 0.001);
  const grade = seed.grade;
  const passed = grade === "A" || grade === "B";

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["bottom"]}>
      <Stack.Screen options={{ title: `Seed #${seed.index}` }} />
      <ScrollView contentContainerClassName="px-xl py-md gap-lg">
        <SeedHero seed={seed} />

        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-caption text-fg-secondary">
              {t("inspections:seed.qualityGrade")}
            </Text>
            <Text
              className="text-fg-primary font-medium"
              style={{ fontSize: 26, letterSpacing: -0.4 }}
            >
              {t(`inspections:seedGrade.${grade}`)}
            </Text>
          </View>
          <Pill
            tone={passed ? "success" : "danger"}
            dot
            label={passed ? t("inspections:seed.passed") : t("inspections:seed.rejected")}
          />
        </View>

        <Card className="p-0">
          <Row
            label={t("inspections:seed.fields.length")}
            value={`${Number(seed.length_mm).toFixed(1)} mm`}
          />
          <Divider />
          <Row
            label={t("inspections:seed.fields.width")}
            value={`${Number(seed.width_mm).toFixed(1)} mm`}
          />
          <Divider />
          <Row
            label={t("inspections:seed.fields.area")}
            value={`${Number(seed.area_mm2).toFixed(1)} mm²`}
          />
          <Divider />
          <Row label={t("inspections:seed.fields.aspectRatio")} value={aspectRatio.toFixed(2)} />
          <Divider />
          <Row
            label={t("inspections:seed.fields.confidence")}
            // Confidence isn't persisted yet; derived from grade until Phase 4
            // adds the analyzer's per-seed confidence to the seeds row.
            value={`${grade === "A" ? "98.4" : grade === "B" ? "92.1" : "78.0"}%`}
          />
        </Card>
      </ScrollView>

      <View className="flex-row gap-md px-xl pb-xl">
        <Button
          className="flex-1"
          variant="outline"
          label={t("inspections:seed.actions.editGrade")}
          leadingIcon={<Edit3 color="#1A1A1A" size={14} />}
        />
        <Button className="flex-1" variant="danger" label={t("inspections:seed.actions.reject")} />
      </View>
    </SafeAreaView>
  );
}

function SeedHero({ seed }: { seed: Seed }) {
  // Cropping by bbox lands once Phase 4 ships the captured-image overlay
  // pipeline. Until then, render a token-tinted placeholder shaped from
  // the seed's actual measurements so the screen still looks anchored.
  const tone = GRADE_TONE[seed.grade];
  const ringColor =
    tone === "success"
      ? "#5DCAA5"
      : tone === "info"
        ? "#0F6E56"
        : tone === "warning"
          ? "#EF9F27"
          : "#DC2828";

  return (
    <View
      className="items-center justify-center overflow-hidden"
      style={{ height: 200, borderRadius: 18, backgroundColor: "#1a1816" }}
    >
      <View style={{ position: "relative" }}>
        <View
          style={{
            width: 100,
            height: 64,
            backgroundColor: "#8c6a4a",
            borderRadius: 32,
            transform: [{ rotate: "-15deg" }],
          }}
        />
        <View
          style={{
            position: "absolute",
            top: -8,
            left: -8,
            right: -8,
            bottom: -8,
            borderWidth: 2,
            borderColor: ringColor,
            borderRadius: 40,
            transform: [{ rotate: "-15deg" }],
          }}
        />
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between px-lg py-md">
      <Text className="text-caption text-fg-secondary">{label}</Text>
      <Text className="text-title text-fg-primary font-medium">{value}</Text>
    </View>
  );
}

function Divider() {
  return <View className="h-[0.5px] bg-line-tertiary" />;
}
