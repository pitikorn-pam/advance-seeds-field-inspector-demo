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
import { Card } from "@/components/ui/Card";
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

const VARIETY_TINTS: Record<string, { bg: string; fg: string }> = {
  corn: { bg: "#FFF1B8", fg: "#704B00" },
  rice: { bg: "#DFF6EC", fg: "#0F6E56" },
  legume: { bg: "#EEE9FF", fg: "#4B22A8" },
  mungbean: { bg: "#FFE8D6", fg: "#8C3C12" },
};

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

  // By-variety breakdown: aggregate run counts to power the horizontal
  // bar chart in the prototype. Bars are normalized against the top
  // variety in-range so the leader fills 100%.
  const byVariety = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; colorKey: string | null; runs: number }
    >();
    for (const row of filtered) {
      const id = row.variety?.id ?? row.variety_id ?? "—";
      const name = row.variety?.name ?? "—";
      const colorKey = row.variety?.color_key ?? null;
      const entry = map.get(id) ?? { id, name, colorKey, runs: 0 };
      entry.runs += 1;
      map.set(id, entry);
    }
    const list = [...map.values()].sort((a, b) => b.runs - a.runs);
    const top = list[0]?.runs ?? 0;
    return list.slice(0, 5).map((v) => ({
      ...v,
      pct: top === 0 ? 0 : Math.round((v.runs / top) * 100),
    }));
  }, [filtered]);

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
      <ScrollView contentContainerClassName="px-xl py-md gap-lg pb-2xl">
        {/* Date range chip row — mirrors the prototype's pill-tab row at
            the very top of Reports. Keeps the existing Segmented + custom
            preset wiring so the date picker behavior is unchanged. */}
        <View className="gap-sm">
          <Text className="text-caption uppercase text-fg-secondary">
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
            <View className="flex-row items-center gap-xs">
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
          <Text className="text-caption uppercase text-fg-secondary mt-xs">
            {t("reports:filters.variety")}
          </Text>
          <Segmented
            value={varietyId}
            onChange={setVarietyId}
            options={varietyOptions}
            variant="tag"
            scrollable
          />
        </View>

        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState title={t("reports:empty.title")} hint={t("reports:empty.hint")} />
        ) : (
          <>
            {/* KPI grid (2x2) — tinted Cards echo the prototype's KPI
                hierarchy. Tones map to the data role: sky=count,
                mint=volume/total, lavender=length, peach=area. */}
            <View className="flex-row gap-sm">
              <KpiTile
                tone="sky"
                value={String(filtered.length)}
                label={t("reports:kpis.inspections")}
              />
              <KpiTile
                tone="mint"
                value={totalSeeds.toLocaleString()}
                label={t("reports:kpis.totalSeeds")}
              />
            </View>
            <View className="flex-row gap-sm">
              <KpiTile
                tone="lavender"
                value={meanLen.toFixed(2)}
                unit="mm"
                label={t("reports:kpis.meanLength")}
              />
              <KpiTile
                tone="peach"
                value={meanArea.toFixed(2)}
                unit="mm²"
                label={t("reports:kpis.meanArea")}
              />
            </View>

            {byVariety.length > 0 ? (
              <View className="gap-sm">
                <Text className="text-title font-medium text-fg-primary">
                  {t("reports:byVariety.title")}
                </Text>
                <Card className="p-0">
                  {byVariety.map((v, i) => {
                    const tint = VARIETY_TINTS[v.colorKey ?? ""] ?? VARIETY_TINTS.rice;
                    return (
                      <View
                        key={v.id}
                        className={`flex-row items-center gap-md px-lg py-md ${
                          i > 0 ? "border-t border-line-tertiary" : ""
                        }`}
                      >
                        <View
                          className="items-center justify-center"
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            backgroundColor: tint.bg,
                          }}
                        >
                          <Text className="font-medium" style={{ color: tint.fg, fontSize: 12 }}>
                            {v.runs}
                          </Text>
                        </View>
                        <View className="flex-1">
                          <Text className="text-body text-fg-primary font-medium" numberOfLines={1}>
                            {v.name}
                          </Text>
                          <Text className="text-caption text-fg-secondary mt-[1px]">
                            {t("reports:byVariety.runs", { count: v.runs })}
                          </Text>
                        </View>
                        <View
                          className="overflow-hidden rounded-full bg-line-tertiary"
                          style={{ width: 80, height: 6 }}
                        >
                          <View className="h-full bg-success-text" style={{ width: `${v.pct}%` }} />
                        </View>
                      </View>
                    );
                  })}
                </Card>
              </View>
            ) : null}
          </>
        )}

        <View className="gap-xs">
          <Button
            className="w-full"
            label={t("common:actions.exportCsv")}
            renderLeadingIcon={() => <Download color="#FFFFFF" size={16} />}
            disabled={filtered.length === 0}
            onPress={exportCsv}
          />
          {filtered.length > 0 ? (
            <Text className="text-caption text-fg-secondary text-center">
              {t("reports:exportMeta", { count: filtered.length })}
            </Text>
          ) : null}
        </View>
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

/**
 * Tinted KPI tile — bigger numeric than the legacy StatTile, with an
 * optional unit suffix and a card tone. Reads from the same Card tones
 * used elsewhere in the redesign (welcome, capture/setup) so visual
 * language stays consistent.
 */
function KpiTile({
  tone,
  value,
  unit,
  label,
}: {
  tone: "sky" | "mint" | "lavender" | "peach";
  value: string;
  unit?: string;
  label: string;
}) {
  return (
    <Card tone={tone} className="flex-1">
      <Text className="text-caption uppercase text-fg-secondary">{label}</Text>
      <View className="flex-row items-baseline gap-xs mt-xs">
        <Text className="text-fg-primary font-medium" style={{ fontSize: 22, letterSpacing: -0.4 }}>
          {value}
        </Text>
        {unit ? <Text className="text-caption text-fg-secondary">{unit}</Text> : null}
      </View>
    </Card>
  );
}
