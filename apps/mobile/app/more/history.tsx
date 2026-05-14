import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, View, Text, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Link, useRouter } from "expo-router";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react-native";
import { useInspectionsPaged } from "@/lib/queries";
import type { InspectionRow } from "@/lib/queries";
import { useSyncQueueEntries } from "@/lib/sync/store";
import type { SyncQueueEntry } from "@/lib/sync/types";
import { SyncPill } from "@/components/ui/SyncPill";
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
type HistoryListEntry =
  | { kind: "section"; key: string; groupKey: GroupKey; count: number }
  | { kind: "item"; key: string; item: HistoryItem; isFirst: boolean; isLast: boolean };

const VARIETY_TINTS: Record<string, { bg: string; fg: string }> = {
  corn: { bg: "#FFF1B8", fg: "#704B00" },
  rice: { bg: "#DFF6EC", fg: "#6E40E0" },
  legume: { bg: "#EEE9FF", fg: "#4B22A8" },
  mungbean: { bg: "#FFE8D6", fg: "#8C3C12" },
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
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const {
    data: paged,
    isLoading,
    isError,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInspectionsPaged({ start: dateRange.start, end: dateRange.end });
  const data = useMemo<InspectionRow[]>(() => paged?.pages.flat() ?? [], [paged]);
  const queueEntries = useSyncQueueEntries();
  const [filter, setFilter] = useState<Filter>("all");
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Combine remote rows + still-pending local queue entries into a single
  // pool *before* the segment filter, so the segment chips can show accurate
  // per-filter counts (e.g. "Pending · 4") like the prototype.
  const allItems = useMemo<HistoryItem[]>(() => {
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
    return [...local, ...remote];
  }, [data, queueEntries]);

  // Counts per filter, evaluated against the date-range slice so chips reflect
  // what the user will actually see when they switch tabs.
  const counts = useMemo(() => {
    const dateScoped = applyDateRange(allItems, dateRange);
    return {
      all: dateScoped.length,
      today: dateScoped.filter((r) => new Date(itemDate(r)) >= startOfToday()).length,
      synced: dateScoped.filter((r) => r.syncState === "synced").length,
      pending: dateScoped.filter((r) => r.syncState === "pending").length,
      failed: dateScoped.filter((r) => r.syncState === "failed").length,
    };
  }, [allItems, dateRange]);

  const segmentOptions: Array<{ value: Filter; label: string }> = [
    { value: "all", label: `${t("history:segments.all")} · ${counts.all}` },
    { value: "today", label: `${t("history:segments.today")} · ${counts.today}` },
    { value: "synced", label: `${t("history:segments.synced")} · ${counts.synced}` },
    { value: "pending", label: `${t("history:segments.pending")} · ${counts.pending}` },
    { value: "failed", label: `${t("history:segments.failed")} · ${counts.failed}` },
  ];

  const grouped = useMemo(() => {
    // Local queue entries are not constrained by the server-side date range,
    // so honour it client-side here too. Sync-state filter stays client-side.
    const filtered = applyFilter(allItems, filter, dateRange);
    return groupByDate(filtered);
  }, [allItems, filter, dateRange]);

  const totalShown = grouped.reduce((s, g) => s + g.items.length, 0);
  const listData = useMemo<HistoryListEntry[]>(
    () =>
      grouped.flatMap(({ groupKey, items }) => [
        { kind: "section", key: `section-${groupKey}`, groupKey, count: items.length },
        ...items.map((item, idx) => ({
          kind: "item" as const,
          key: itemKey(item),
          item,
          isFirst: idx === 0,
          isLast: idx === items.length - 1,
        })),
      ]),
    [grouped],
  );
  const dateLabel = rangeLabel(dateRange, i18n.language, t);
  const hasDateRange = !!dateRange.start || !!dateRange.end;

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("history:title")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#171717" size={20} />,
          onPress: () => router.back(),
        }}
      />
      <FlatList
        data={listData}
        keyExtractor={(item) => item.key}
        contentContainerClassName="px-xl py-md"
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
        }
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={9}
        removeClippedSubviews
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
        }}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="py-md items-center">
              <ActivityIndicator color="#6E40E0" />
            </View>
          ) : null
        }
        ListHeaderComponent={
          <View className="gap-md mb-md">
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
                <Calendar color="#6E40E0" size={16} />
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
                  <X color="#171717" size={16} />
                </Pressable>
              ) : null}
            </View>
          </View>
        }
        renderItem={({ item }) =>
          item.kind === "section" ? (
            <View className="flex-row items-baseline justify-between px-xs mt-lg mb-xs">
              <Text
                className="text-label uppercase text-fg-secondary"
                style={{ letterSpacing: 0.4 }}
              >
                {t(`history:groups.${item.groupKey}`, { count: item.count })}
              </Text>
              <Text className="text-caption text-fg-tertiary">{item.count}</Text>
            </View>
          ) : (
            <HistoryRow item={item.item} isFirst={item.isFirst} isLast={item.isLast} />
          )
        }
        ListEmptyComponent={
          isLoading ? (
            <LoadingState />
          ) : isError ? (
            <ErrorState onRetry={() => void refetch()} />
          ) : totalShown === 0 ? (
            <EmptyState hint={t("inspections:list.empty")} />
          ) : null
        }
      />
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

function HistoryRow({
  item,
  isFirst,
  isLast,
}: {
  item: HistoryItem;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { t } = useTranslation("history");
  const row = item.kind === "remote" ? item.row : null;
  const entry = item.kind === "local" ? item.entry : null;
  const tint = VARIETY_TINTS[row?.variety?.color_key ?? ""] ?? VARIETY_TINTS.rice;
  const syncState = item.syncState;
  const capturedAt = row?.captured_at ?? entry?.createdAt ?? new Date().toISOString();
  const title = row?.variety?.name ?? t("pendingInspection");
  const totalSeeds =
    row?.total_seeds ?? (entry?.payload.kind === "inspection" ? entry.payload.data.total_seeds : 0);
  const subtitle = `${formatRelative(capturedAt)} · ${t("row.seedsSuffix", { count: totalSeeds ?? 0 })}`;
  const content = (
    <View
      className={`flex-row items-center gap-md bg-bg-primary px-lg py-md ${
        isFirst ? "rounded-t-2xl" : ""
      } ${isLast ? "rounded-b-2xl" : "border-b border-line-tertiary"}`}
    >
      <View
        className="items-center justify-center"
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: tint.bg,
        }}
      >
        <Text className="font-semibold" style={{ color: tint.fg, fontSize: 13 }}>
          {totalSeeds ?? 0}
        </Text>
      </View>
      <View className="flex-1">
        <View className="flex-row items-center gap-xs">
          <Text className="text-title text-fg-primary font-medium flex-shrink" numberOfLines={1}>
            {title}
          </Text>
          {syncState !== "synced" ? <SyncPill state={syncState} /> : null}
        </View>
        <Text className="text-caption text-fg-secondary mt-xs" numberOfLines={1}>
          {subtitle}
        </Text>
        {entry?.lastError ? (
          <Text className="text-caption text-danger-text mt-xs" numberOfLines={1}>
            {entry.lastError}
          </Text>
        ) : null}
      </View>
      {row ? <ChevronRight color="#8C8C87" size={16} /> : null}
    </View>
  );
  if (!row) return content;
  return (
    <Link href={`/inspections/${row.id}`} asChild>
      <Pressable>{content}</Pressable>
    </Link>
  );
}

function applyDateRange(rows: HistoryItem[], dateRange: DateRange): HistoryItem[] {
  if (!dateRange.start) return rows;
  const end = dateRange.end ?? dateRange.start;
  return rows.filter((r) => {
    const key = toDateKey(new Date(itemDate(r)));
    return key >= dateRange.start! && key <= end;
  });
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
  return applyDateRange(filtered, dateRange);
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
