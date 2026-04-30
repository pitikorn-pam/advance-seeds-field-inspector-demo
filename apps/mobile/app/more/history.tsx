import { useMemo, useState } from "react";
import { ScrollView, View, Text, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Link, useRouter } from "expo-router";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react-native";
import { useInspections } from "@/lib/queries";
import type { InspectionRow } from "@/lib/queries";
import { useSyncQueueEntries } from "@/lib/sync/store";
import type { SyncQueueEntry } from "@/lib/sync/types";
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

type Filter = "all" | "today" | "synced" | "pending" | "failed";
type GroupKey = "today" | "yesterday" | "earlierThisWeek" | "earlier";
type HistoryItem =
  | { kind: "remote"; row: InspectionRow; syncState: "synced" }
  | { kind: "local"; entry: SyncQueueEntry; syncState: "pending" | "failed" };

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
 * Sync filters combine server rows with local queue entries so captures
 * saved offline stay visible until replay replaces them with Supabase rows.
 */
export default function HistoryScreen() {
  const { t, i18n } = useTranslation(["common", "history", "inspections"]);
  const router = useRouter();
  const { data, isLoading, isError, refetch, isRefetching } = useInspections();
  const queueEntries = useSyncQueueEntries();
  const [filter, setFilter] = useState<Filter>("all");
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const segmentOptions: Array<{ value: Filter; label: string }> = [
    { value: "all", label: t("history:segments.all") },
    { value: "today", label: t("history:segments.today") },
    { value: "synced", label: t("history:segments.synced") },
    { value: "pending", label: t("history:segments.pending") },
    { value: "failed", label: t("history:segments.failed") },
  ];

  const grouped = useMemo(() => {
    if (!data) return [];
    const local = queueEntries
      .filter((entry) => entry.payload.kind === "inspection")
      .filter(
        (entry) =>
          entry.status === "pending" || entry.status === "syncing" || entry.status === "failed",
      )
      .map<HistoryItem>((entry) => ({
        kind: "local",
        entry,
        syncState: entry.status === "failed" ? "failed" : "pending",
      }));
    const remote = data.map<HistoryItem>((row) => ({ kind: "remote", row, syncState: "synced" }));
    const filtered = applyFilter([...local, ...remote], filter, dateRange);
    return groupByDate(filtered);
  }, [data, queueEntries, filter, dateRange]);

  const totalShown = grouped.reduce((s, g) => s + g.items.length, 0);
  const dateLabel = rangeLabel(dateRange, i18n.language, t);
  const hasDateRange = !!dateRange.start || !!dateRange.end;

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("history:title")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#1A1A1A" size={20} />,
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
                  <HistoryRow key={itemKey(row)} item={row} isLast={idx === items.length - 1} />
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

function HistoryRow({ item, isLast }: { item: HistoryItem; isLast: boolean }) {
  const { t } = useTranslation("history");
  const row = item.kind === "remote" ? item.row : null;
  const entry = item.kind === "local" ? item.entry : null;
  const tint = VARIETY_TINTS[row?.variety?.color_key ?? ""] ?? VARIETY_TINTS.rice;
  const syncState = item.syncState;
  const capturedAt = row?.captured_at ?? entry?.createdAt ?? new Date().toISOString();
  const title = row?.variety?.name ?? t("pendingInspection");
  const totalSeeds =
    row?.total_seeds ?? (entry?.payload.kind === "inspection" ? entry.payload.data.total_seeds : 0);
  const body = `${formatRelative(capturedAt)}${row?.batch?.code ? ` · ${row.batch.code}` : ""}`;
  const content = (
    <View
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
          {totalSeeds ?? 0}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-title text-fg-primary font-medium" numberOfLines={1}>
          {title}
        </Text>
        <Text className="text-caption text-fg-secondary mt-xs" numberOfLines={1}>
          {body}
        </Text>
        {entry?.lastError ? (
          <Text className="text-caption text-danger-text mt-xs" numberOfLines={1}>
            {entry.lastError}
          </Text>
        ) : null}
      </View>
      <Pill
        tone={syncState === "synced" ? "success" : syncState === "failed" ? "danger" : "warning"}
        dot
        label={t(`syncStatus.${syncState}`)}
      />
      {row ? <ChevronRight color="#9D9D9A" size={16} /> : null}
    </View>
  );
  if (!row) return content;
  return (
    <Link href={`/inspections/${row.id}`} asChild>
      <Pressable>{content}</Pressable>
    </Link>
  );
}

function applyFilter(rows: HistoryItem[], filter: Filter, dateRange: DateRange): HistoryItem[] {
  const filtered = (() => {
    switch (filter) {
      case "all":
        return rows;
      case "today": {
        const start = startOfToday();
        return rows.filter((r) => new Date(itemDate(r)) >= start);
      }
      case "synced":
      case "pending":
      case "failed":
        return rows.filter((r) => r.syncState === filter);
    }
  })();
  if (!dateRange.start) return filtered;
  const end = dateRange.end ?? dateRange.start;
  return filtered.filter((r) => {
    const key = toDateKey(new Date(itemDate(r)));
    return key >= dateRange.start! && key <= end;
  });
}

function groupByDate(rows: HistoryItem[]): Array<{ groupKey: GroupKey; items: HistoryItem[] }> {
  const startToday = startOfToday();
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);
  const startOfWeek = new Date(startToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Sunday

  const buckets: Record<GroupKey, HistoryItem[]> = {
    today: [],
    yesterday: [],
    earlierThisWeek: [],
    earlier: [],
  };

  for (const row of rows) {
    const at = new Date(itemDate(row));
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

function itemDate(item: HistoryItem): string {
  return item.kind === "remote" ? item.row.captured_at : item.entry.createdAt;
}

function itemKey(item: HistoryItem): string {
  return item.kind === "remote" ? item.row.id : item.entry.id;
}
