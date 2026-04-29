import { useMemo, useState } from "react";
import { ScrollView, View, Text, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Link, useRouter } from "expo-router";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react-native";
import { useInspections } from "@/lib/queries";
import type { InspectionRow } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Segmented } from "@/components/ui/Segmented";
import { AppTopBar } from "@/components/ui/AppTopBar";
import {
  DateRangePicker,
  type DateRange,
  rangeLabel,
  toDateKey,
} from "@/components/ui/DateRangePicker";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";

type Filter = "all" | "today";
type GroupKey = "today" | "yesterday" | "earlierThisWeek" | "earlier";

const VARIETY_TINTS: Record<string, { bg: string; fg: string }> = {
  corn: { bg: "#FAEEDA", fg: "#854F0B" },
  rice: { bg: "#EAF3DE", fg: "#3B6D11" },
  legume: { bg: "#E1F5EE", fg: "#0F6E56" },
  mungbean: { bg: "#FAECE7", fg: "#993C1D" },
};

/**
 * History screen — chronological list of the user's inspections.
 * Reachable from /more → History.
 *
 * Three views matching the prototype's history pattern:
 *   1. Segmented filter at top (All / Today / Synced / Pending)
 *   2. Date-grouped sections with relative-day labels
 *   3. Per-row sync status pill
 *
 * Synced/Pending branches are placeholders — every row shows "Synced"
 * for now because we don't have an offline queue yet. The visual lands
 * so the future offline-sync feature plugs in without restructuring.
 */
export default function HistoryScreen() {
  const { t, i18n } = useTranslation(["common", "history", "inspections"]);
  const router = useRouter();
  const { data, isLoading, isError, refetch, isRefetching } = useInspections();
  const [filter, setFilter] = useState<Filter>("all");
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const segmentOptions: Array<{ value: Filter; label: string }> = [
    { value: "all", label: t("history:segments.all") },
    { value: "today", label: t("history:segments.today") },
  ];

  const grouped = useMemo(() => {
    if (!data) return [];
    const filtered = applyFilter(data, filter, dateRange);
    return groupByDate(filtered);
  }, [data, filter, dateRange]);

  const totalShown = grouped.reduce((s, g) => s + g.items.length, 0);
  const dateLabel = rangeLabel(dateRange, i18n.language, t);
  const hasDateRange = !!dateRange.start || !!dateRange.end;

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("history:title")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          icon: <ChevronLeft color="#1A1A1A" size={20} />,
          onPress: () => router.back(),
        }}
      />
      <ScrollView
        contentContainerClassName="px-xl py-md gap-md"
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
        }
      >
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={segmentOptions}
          variant="tag"
          scrollable
        />

        <View className="flex-row items-center gap-xs">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("history:filters.selectDate")}
            className="flex-1 flex-row items-center gap-sm rounded-full border border-line-secondary bg-bg-primary px-md py-sm"
            onPress={() => setDatePickerOpen(true)}
          >
            <Calendar color="#0F6E56" size={16} />
            <View className="flex-1">
              <Text className="text-caption text-fg-secondary">
                {t("history:filters.dateRange")}
              </Text>
              <Text className="text-title font-medium text-fg-primary" numberOfLines={1}>
                {dateLabel}
              </Text>
            </View>
          </Pressable>
          {hasDateRange ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common:actions.clear")}
              className="h-10 w-10 items-center justify-center rounded-full bg-bg-tertiary"
              onPress={() => setDateRange({ start: null, end: null })}
            >
              <X color="#1A1A1A" size={16} />
            </Pressable>
          ) : null}
        </View>

        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : totalShown === 0 ? (
          <EmptyState hint={t("inspections:list.empty")} />
        ) : (
          grouped.map(({ groupKey, items }) => (
            <View key={groupKey} className="gap-xs">
              <Text className="text-caption text-fg-secondary px-xs">
                {t(`history:groups.${groupKey}`, { count: items.length })}
              </Text>
              <Card className="p-0">
                {items.map((row, idx) => (
                  <HistoryRow key={row.id} row={row} isLast={idx === items.length - 1} />
                ))}
              </Card>
            </View>
          ))
        )}
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

function HistoryRow({ row, isLast }: { row: InspectionRow; isLast: boolean }) {
  const { t } = useTranslation("history");
  const tint = VARIETY_TINTS[row.variety?.color_key ?? ""] ?? VARIETY_TINTS.rice;
  // Today: every row is "synced" since there's no offline queue. The
  // pending branch would set syncState='pending' on local-cached rows.
  const syncState: "synced" | "pending" = "synced";
  return (
    <Link href={`/inspections/${row.id}`} asChild>
      <Pressable
        className={`flex-row items-center gap-md px-lg py-md ${
          isLast ? "" : "border-b border-line-tertiary"
        }`}
      >
        <View
          className="items-center justify-center"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            backgroundColor: tint.bg,
          }}
        >
          <Text className="font-medium" style={{ color: tint.fg, fontSize: 14 }}>
            {row.total_seeds ?? 0}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-title text-fg-primary font-medium" numberOfLines={1}>
            {row.variety?.name ?? "—"}
          </Text>
          <Text className="text-caption text-fg-secondary mt-xs" numberOfLines={1}>
            {formatRelative(row.captured_at)}
            {row.batch?.code ? ` · ${row.batch.code}` : ""}
          </Text>
        </View>
        <Pill
          tone={syncState === "synced" ? "success" : "warning"}
          dot
          label={t(`syncStatus.${syncState}`)}
        />
        <ChevronRight color="#9D9D9A" size={16} />
      </Pressable>
    </Link>
  );
}

function applyFilter(rows: InspectionRow[], filter: Filter, dateRange: DateRange): InspectionRow[] {
  const filtered = (() => {
    switch (filter) {
      case "all":
        return rows;
      case "today": {
        const start = startOfToday();
        return rows.filter((r) => new Date(r.captured_at) >= start);
      }
    }
  })();
  if (!dateRange.start) return filtered;
  const end = dateRange.end ?? dateRange.start;
  return filtered.filter((r) => {
    const key = toDateKey(new Date(r.captured_at));
    return key >= dateRange.start! && key <= end;
  });
}

function groupByDate(rows: InspectionRow[]): Array<{ groupKey: GroupKey; items: InspectionRow[] }> {
  const startToday = startOfToday();
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);
  const startOfWeek = new Date(startToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Sunday

  const buckets: Record<GroupKey, InspectionRow[]> = {
    today: [],
    yesterday: [],
    earlierThisWeek: [],
    earlier: [],
  };

  for (const row of rows) {
    const at = new Date(row.captured_at);
    if (at >= startToday) buckets.today.push(row);
    else if (at >= startYesterday) buckets.yesterday.push(row);
    else if (at >= startOfWeek) buckets.earlierThisWeek.push(row);
    else buckets.earlier.push(row);
  }

  const order: GroupKey[] = ["today", "yesterday", "earlierThisWeek", "earlier"];
  return order
    .filter((k) => buckets[k].length > 0)
    .map((k) => ({ groupKey: k, items: buckets[k] }));
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatRelative(iso: string): string {
  const diffMin = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(diffMin) < 60) return `${Math.abs(diffMin)} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return `${Math.abs(diffHr)}h ago`;
  return new Date(iso).toLocaleDateString();
}
