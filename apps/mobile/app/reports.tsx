import { useMemo, useState } from "react";
import { ScrollView, View, Text, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react-native";
// expo-file-system v19 (Expo SDK 54) introduced a new Paths/File API and
// moved the previous API behind /legacy. Using legacy here keeps the diff
// minimal — migrating to the new API is a polish task for next change.
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useInspections, useVarieties } from "@/lib/queries";
import { Card, StatTile } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";

const ALL = "__all";
type Preset = "last7" | "last30" | "last90" | "custom";

function withinRange(date: Date, preset: Preset): boolean {
  if (preset === "custom") return true;
  const days = preset === "last7" ? 7 : preset === "last30" ? 30 : 90;
  return Date.now() - date.getTime() <= days * 24 * 60 * 60 * 1000;
}

function escape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function ReportsRoute() {
  const { t } = useTranslation(["common", "reports"]);
  const { data, isLoading, isError, refetch } = useInspections();
  const varieties = useVarieties();
  const [preset, setPreset] = useState<Preset>("last30");
  const [varietyId, setVarietyId] = useState<string>(ALL);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((row) => {
      if (varietyId !== ALL && row.variety_id !== varietyId) return false;
      return withinRange(new Date(row.captured_at), preset);
    });
  }, [data, preset, varietyId]);

  const totalSeeds = filtered.reduce((a, b) => a + (b.total_seeds ?? 0), 0);
  const meanLen =
    filtered.length === 0
      ? 0
      : filtered.reduce((a, b) => a + Number(b.mean_length_mm ?? 0), 0) / filtered.length;
  const meanArea =
    filtered.length === 0
      ? 0
      : filtered.reduce((a, b) => a + Number(b.mean_area_mm2 ?? 0), 0) / filtered.length;

  const headerKey = (k: string) => t(`reports:csvHeaders.${k}`);

  const exportCsv = async () => {
    const cols = [
      ["id", "id"],
      ["captured_at", "captured_at"],
      ["inspector_email", "inspector?.email"],
      ["inspector_name", "inspector?.full_name"],
      ["variety", "variety?.name"],
      ["batch_code", "batch?.code"],
      ["batch_location", ""],
      ["calibration_source", ""],
      ["calibration_px_per_mm", ""],
      ["total_seeds", "total_seeds"],
      ["mean_length_mm", "mean_length_mm"],
      ["mean_width_mm", "mean_width_mm"],
      ["mean_area_mm2", "mean_area_mm2"],
      ["notes", "notes"],
      ["created_at", "created_at"],
    ];
    const header = cols.map(([k]) => escape(headerKey(k!))).join(",");
    const body = filtered
      .map((row) =>
        [
          row.id,
          row.captured_at,
          row.inspector?.email ?? "",
          row.inspector?.full_name ?? "",
          row.variety?.name ?? "",
          row.batch?.code ?? "",
          "",
          "",
          "",
          row.total_seeds,
          row.mean_length_mm ?? "",
          row.mean_width_mm ?? "",
          row.mean_area_mm2 ?? "",
          row.notes ?? "",
          row.created_at,
        ]
          .map(escape)
          .join(","),
      )
      .join("\n");
    const csv = "﻿" + header + "\n" + body + "\n";

    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const path = FileSystem.cacheDirectory + `inspections-${stamp}.csv`;
    await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, {
        mimeType: "text/csv",
        dialogTitle: t("common:actions.exportCsv"),
      });
    } else {
      Alert.alert(t("common:actions.exportCsv"), `Saved to ${path}`);
    }
  };

  const presets: Preset[] = ["last7", "last30", "last90", "custom"];
  const presetOptions = presets.map((p) => ({
    value: p,
    label: t(`reports:filters.preset.${p}`),
  }));
  const varietyOptions = [
    { value: ALL, label: t("reports:filters.allVarieties") },
    ...(varieties.data ?? []).map((v) => ({ value: v.id, label: v.name })),
  ];

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["bottom"]}>
      <ScrollView contentContainerClassName="px-xl py-xl gap-xl">
        <View className="flex-row items-center justify-between">
          <Text className="text-h1 font-medium text-fg-primary">{t("reports:title")}</Text>
          <Button
            size="sm"
            label={t("common:actions.exportCsv")}
            leadingIcon={<Download color="#FFFFFF" size={14} />}
            disabled={filtered.length === 0}
            onPress={exportCsv}
          />
        </View>

        <Card>
          <Text className="text-caption uppercase text-fg-secondary mb-sm">
            {t("reports:filters.dateRange")}
          </Text>
          <Segmented<Preset>
            value={preset}
            onChange={setPreset}
            options={presetOptions}
            variant="tag"
            scrollable
          />
          <Text className="text-caption uppercase text-fg-secondary mb-sm mt-md">
            {t("reports:filters.variety")}
          </Text>
          <Segmented
            value={varietyId}
            onChange={setVarietyId}
            options={varietyOptions}
            variant="tag"
            scrollable
          />
        </Card>

        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <View className="flex-row gap-sm">
              <StatTile value={filtered.length} label={t("reports:kpis.inspections")} />
              <StatTile value={totalSeeds} label={t("reports:kpis.totalSeeds")} />
            </View>
            <View className="flex-row gap-sm">
              <StatTile value={meanLen.toFixed(2)} label={t("reports:kpis.meanLength")} />
              <StatTile value={meanArea.toFixed(2)} label={t("reports:kpis.meanArea")} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
