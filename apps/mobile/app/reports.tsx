import { useMemo, useState } from "react";
import { ScrollView, View, Text, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Calendar, ChevronLeft, Download, X } from "lucide-react-native";
// expo-file-system v19 (Expo SDK 54) introduced a new Paths/File API and
// moved the previous API behind /legacy. Using legacy here keeps the diff
// minimal — migrating to the new API is a polish task for next change.
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useInspections, useVarieties } from "@/lib/queries";
import { Card, StatTile } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { AppTopBar } from "@/components/ui/AppTopBar";
import {
  DateRangePicker,
  type DateRange,
  rangeLabel,
  toDateKey,
} from "@/components/ui/DateRangePicker";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";

const ALL = "__all";
type Preset = "last7" | "last30" | "last90" | "custom";

function withinRange(date: Date, preset: Preset, range: DateRange): boolean {
  if (preset === "custom") {
    if (!range.start) return true;
    const key = toDateKey(date);
    const end = range.end ?? range.start;
    return key >= range.start && key <= end;
  }
  const days = preset === "last7" ? 7 : preset === "last30" ? 30 : 90;
  return Date.now() - date.getTime() <= days * 24 * 60 * 60 * 1000;
}

function escape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function ReportsRoute() {
  const { t, i18n } = useTranslation(["common", "reports", "history"]);
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useInspections();
  const varieties = useVarieties();
  const [preset, setPreset] = useState<Preset>("last30");
  const [varietyId, setVarietyId] = useState<string>(ALL);
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((row) => {
      if (varietyId !== ALL && row.variety_id !== varietyId) return false;
      return withinRange(new Date(row.captured_at), preset, dateRange);
    });
  }, [data, preset, dateRange, varietyId]);

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
  const hasDateRange = !!dateRange.start || !!dateRange.end;

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("reports:title")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#171717" size={20} />,
          onPress: () => router.back(),
        }}
      />
      <ScrollView contentContainerClassName="px-xl py-md gap-xl">
        <Text className="text-h1 font-medium text-fg-primary">{t("reports:summaryTitle")}</Text>

        <Card>
          <Text className="text-caption uppercase text-fg-secondary mb-sm">
            {t("reports:filters.dateRange")}
          </Text>
          <Segmented<Preset>
            value={preset}
            onChange={(next) => {
              setPreset(next);
              if (next === "custom") setDatePickerOpen(true);
            }}
            options={presetOptions}
            variant="tag"
            scrollable
          />
          {preset === "custom" ? (
            <View className="mt-md flex-row items-center gap-xs">
              <Button
                className="flex-1"
                size="sm"
                variant="outline"
                label={rangeLabel(dateRange, i18n.language, t)}
                renderLeadingIcon={() => <Calendar color="#6E40E0" size={14} />}
                onPress={() => setDatePickerOpen(true)}
              />
              {hasDateRange ? (
                <Button
                  size="icon"
                  variant="tinted"
                  accessibilityLabel={t("common:actions.clear")}
                  onPress={() => setDateRange({ start: null, end: null })}
                >
                  <X color="#171717" size={16} />
                </Button>
              ) : null}
            </View>
          ) : null}
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

        <Button
          className="w-full"
          label={t("common:actions.exportCsv")}
          renderLeadingIcon={() => <Download color="#FFFFFF" size={16} />}
          disabled={filtered.length === 0}
          onPress={exportCsv}
        />
      </ScrollView>
      <DateRangePicker
        visible={datePickerOpen}
        value={dateRange}
        locale={i18n.language}
        onClose={() => setDatePickerOpen(false)}
        onClear={() => setDateRange({ start: null, end: null })}
        onChange={setDateRange}
      />
    </SafeAreaView>
  );
}
