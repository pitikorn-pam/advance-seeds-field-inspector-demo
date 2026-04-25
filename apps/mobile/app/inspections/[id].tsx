import { useState } from "react";
import { ScrollView, View, Text, Pressable, Alert, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { Seed } from "@advance-seeds/types";
import { useAuth } from "@/lib/auth";
import { policyFor } from "@/lib/access";
import { useInspection, useDeleteInspection } from "@/lib/queries";
import { Card, StatTile } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { LoadingState, ErrorState } from "@/components/ui/States";

const gradeToTone: Record<Seed["grade"], "success" | "info" | "warning" | "danger"> = {
  A: "success",
  B: "info",
  C: "warning",
  reject: "danger",
};

export default function InspectionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation(["common", "inspections"]);
  const router = useRouter();
  const { profile } = useAuth();
  const policy = policyFor(profile);
  const { data, isLoading, isError, refetch } = useInspection(id);
  const del = useDeleteInspection();
  const [seed, setSeed] = useState<Seed | null>(null);

  const dateFmt = new Intl.DateTimeFormat(i18n.language === "th" ? "th-TH" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;
  const { inspection, seeds } = data;

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["bottom"]}>
      <ScrollView contentContainerClassName="px-xl py-xl gap-xl">
        <View>
          <Text className="text-h1 font-medium text-fg-primary">
            {inspection.variety?.name ?? "—"}
          </Text>
          <Text className="text-caption text-fg-secondary mt-xs">
            {dateFmt.format(new Date(inspection.captured_at))} ·{" "}
            {inspection.inspector?.full_name ?? inspection.inspector?.email}
            {inspection.batch?.code ? ` · ${inspection.batch.code}` : ""}
          </Text>
        </View>

        {inspection.image_url ? (
          <Image
            source={{ uri: inspection.image_url }}
            className="aspect-[4/3] w-full rounded-xl"
            resizeMode="cover"
          />
        ) : null}

        <View className="flex-row gap-sm">
          <StatTile
            value={inspection.total_seeds}
            label={t("inspections:detail.summary.totalSeeds")}
          />
          <StatTile
            value={Number(inspection.mean_length_mm ?? 0).toFixed(2)}
            label={t("inspections:detail.summary.meanLength")}
          />
        </View>
        <View className="flex-row gap-sm">
          <StatTile
            value={Number(inspection.mean_width_mm ?? 0).toFixed(2)}
            label={t("inspections:detail.summary.meanWidth")}
          />
          <StatTile
            value={Number(inspection.mean_area_mm2 ?? 0).toFixed(2)}
            label={t("inspections:detail.summary.meanArea")}
          />
        </View>

        <View>
          <Text className="text-h2 font-medium text-fg-primary mb-md">
            {t("inspections:detail.perSeedTitle")}
          </Text>
          <View className="flex-row flex-wrap gap-sm">
            {seeds.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => setSeed(s)}
                className="basis-[31%] grow items-center gap-xs rounded-lg bg-bg-primary border border-line-tertiary px-md py-md"
              >
                <Text className="text-h2 font-medium text-fg-primary">{s.index}</Text>
                <Pill tone={gradeToTone[s.grade]} label={t(`inspections:seedGrade.${s.grade}`)} />
                <Text className="text-caption text-fg-secondary">
                  {Number(s.length_mm).toFixed(1)} × {Number(s.width_mm).toFixed(1)} mm
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {seed ? (
          <Card>
            <Text className="text-h2 font-medium text-fg-primary mb-md">
              {t("inspections:detail.perSeedTitle")} #{seed.index}
            </Text>
            <View className="gap-sm">
              <Row
                label={t("inspections:detail.summary.meanLength")}
                value={`${Number(seed.length_mm).toFixed(2)} mm`}
              />
              <Row
                label={t("inspections:detail.summary.meanWidth")}
                value={`${Number(seed.width_mm).toFixed(2)} mm`}
              />
              <Row
                label={t("inspections:detail.summary.meanArea")}
                value={`${Number(seed.area_mm2).toFixed(2)} mm²`}
              />
            </View>
            <Button
              className="mt-md"
              variant="outline"
              size="sm"
              label={t("common:actions.cancel")}
              onPress={() => setSeed(null)}
            />
          </Card>
        ) : null}

        {policy.canDeleteInspection(inspection) ? (
          <Button
            variant="outline"
            label={t("common:actions.delete")}
            onPress={() =>
              Alert.alert(t("common:actions.delete"), t("inspections:detail.deleteConfirm"), [
                { text: t("common:actions.cancel"), style: "cancel" },
                {
                  text: t("common:actions.delete"),
                  style: "destructive",
                  onPress: async () => {
                    await del.mutateAsync(inspection.id);
                    router.back();
                  },
                },
              ])
            }
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-body text-fg-secondary">{label}</Text>
      <Text className="text-title text-fg-primary">{value}</Text>
    </View>
  );
}
