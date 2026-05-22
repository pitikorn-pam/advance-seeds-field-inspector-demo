import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, View, Text, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Link, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import type { SeedGrade } from "@advance-seeds/types";
import { useInspectionsPaged } from "@/lib/queries";
import type { InspectionRow } from "@/lib/queries";
import { useSyncQueueEntries } from "@/lib/sync/store";
import type { SyncQueueEntry } from "@/lib/sync/types";
import { SyncPill } from "@/components/ui/SyncPill";
import { Segmented } from "@/components/ui/Segmented";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { Button } from "@/components/ui/Button";
import { GradeChip } from "@/components/ui/GradeChip";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";

type Filter = "all" | "today" | "synced" | "pending" | "failed";
type GroupKey = "today" | "yesterday" | "earlierThisWeek" | "earlier";
type HistoryItem =
  | { kind: "remote"; row: InspectionRow; syncState: "synced" }
  | { kind: "local"; entry: SyncQueueEntry; syncState: "pending" | "failed" };
type HistoryListEntry =
  | { kind: "section"; key: string; groupKey: GroupKey; count: number }
  | { kind: "item"; key: string; item: HistoryItem };

/**
 * History screen — chronological list of the user's inspections.
 * Visual fidelity port of the prototype's HistoryScreen: full-bleed white
 * rows separated by hairlines, gray section headers spanning the full
 * width, and a scrollable Segmented filter with ink/black active state.
 */
export default function HistoryScreen() {
  const { t } = useTranslation(["common", "history", "inspections"]);
  const router = useRouter();
  const {
    data: paged,
    isLoading,
    isError,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInspectionsPaged({ start: null, end: null });
  const data = useMemo<InspectionRow[]>(() => paged?.pages.flat() ?? [], [paged]);
  const queueEntries = useSyncQueueEntries();
  const [filter, setFilter] = useState<Filter>("all");

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

  const counts = useMemo(
    () => ({
      all: allItems.length,
      today: allItems.filter((r) => new Date(itemDate(r)) >= startOfToday()).length,
      synced: allItems.filter((r) => r.syncState === "synced").length,
      pending: allItems.filter((r) => r.syncState === "pending").length,
      failed: allItems.filter((r) => r.syncState === "failed").length,
    }),
    [allItems],
  );

  const segmentOptions: Array<{ value: Filter; label: string }> = [
    { value: "all", label: `${t("history:segments.all")}  ${counts.all}` },
    { value: "today", label: `${t("history:segments.today")}  ${counts.today}` },
    { value: "synced", label: `${t("history:segments.synced")}  ${counts.synced}` },
    { value: "pending", label: `${t("history:segments.pending")}  ${counts.pending}` },
    { value: "failed", label: `${t("history:segments.failed")}  ${counts.failed}` },
  ];

  const grouped = useMemo(() => groupByDate(applyFilter(allItems, filter)), [allItems, filter]);

  const totalShown = grouped.reduce((s, g) => s + g.items.length, 0);
  const listData = useMemo<HistoryListEntry[]>(
    () =>
      grouped.flatMap(({ groupKey, items }) => [
        { kind: "section", key: `section-${groupKey}`, groupKey, count: items.length },
        ...items.map((item) => ({
          kind: "item" as const,
          key: itemKey(item),
          item,
        })),
      ]),
    [grouped],
  );

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

      {/* Filter row — pinned, scrollable. Active = ink/black via variant="tag" */}
      <View className="px-xl pt-sm pb-md bg-bg-secondary">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={segmentOptions}
          variant="tag"
          scrollable
        />
      </View>

      <FlatList
        data={listData}
        keyExtractor={(item) => item.key}
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
        renderItem={({ item }) =>
          item.kind === "section" ? (
            <SectionHeader groupKey={item.groupKey} count={item.count} />
          ) : (
            <HistoryRow item={item.item} />
          )
        }
        ListEmptyComponent={
          isLoading ? (
            <View className="px-xl py-xl">
              <LoadingState />
            </View>
          ) : isError ? (
            <View className="px-xl py-xl">
              <ErrorState onRetry={() => void refetch()} />
            </View>
          ) : totalShown === 0 ? (
            <View className="px-xl py-xl">
              <EmptyState hint={t("inspections:list.empty")} />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function SectionHeader({ groupKey, count }: { groupKey: GroupKey; count: number }) {
  const { t } = useTranslation("history");
  return (
    <View className="flex-row items-baseline justify-between bg-bg-secondary px-xl pt-lg pb-xs">
      <Text
        className="text-[11px] font-semibold uppercase text-fg-tertiary"
        style={{ letterSpacing: 0.6 }}
      >
        {t(`history:groups.${groupKey}.label`)}
      </Text>
      <Text className="text-caption text-fg-tertiary">{count}</Text>
    </View>
  );
}

function HistoryRow({ item }: { item: HistoryItem }) {
  const { t } = useTranslation("history");
  const row = item.kind === "remote" ? item.row : null;
  const entry = item.kind === "local" ? item.entry : null;
  const syncState = item.syncState;
  const capturedAt = row?.captured_at ?? entry?.createdAt ?? new Date().toISOString();
  const title = row?.variety?.name ?? t("pendingInspection");
  const totalSeeds =
    row?.total_seeds ?? (entry?.payload.kind === "inspection" ? entry.payload.data.total_seeds : 0);
  const idLabel = row ? shortId(row.id) : entry ? shortId(entry.id) : "";
  const isFailed = syncState === "failed";
  const sub = isFailed
    ? `${idLabel} · ${formatTime(capturedAt)} · ${t("uploadFailed")}`
    : `${idLabel} · ${formatTime(capturedAt)} · ${t("row.seedsSuffix", { count: totalSeeds ?? 0 })}`;
  const grade: SeedGrade | null = row && syncState === "synced" ? deriveGrade(row.id) : null;

  const content = (
    <View className="flex-row items-center gap-md bg-bg-primary px-xl py-md border-b border-line-tertiary">
      <View
        className="items-center justify-center rounded-lg bg-bg-tertiary border border-line-tertiary"
        style={{ width: 40, height: 40 }}
      >
        <Text className="text-title font-semibold text-fg-secondary">
          {title.trim().charAt(0).toUpperCase() || "?"}
        </Text>
      </View>
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center gap-xs">
          <Text className="text-body font-medium text-fg-primary flex-shrink" numberOfLines={1}>
            {title}
          </Text>
          {syncState !== "synced" ? <SyncPill state={syncState} /> : null}
        </View>
        <Text className="text-caption text-fg-secondary mt-xs" numberOfLines={1}>
          {sub}
        </Text>
      </View>
      {isFailed ? (
        <Button variant="secondary" size="sm" label={t("retry")} />
      ) : grade ? (
        <GradeChip grade={grade} />
      ) : null}
    </View>
  );

  if (!row) return content;
  return (
    <Link href={`/inspections/${row.id}`} asChild>
      <Pressable>{content}</Pressable>
    </Link>
  );
}

function applyFilter(rows: HistoryItem[], filter: Filter): HistoryItem[] {
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
}

function groupByDate(rows: HistoryItem[]): Array<{ groupKey: GroupKey; items: HistoryItem[] }> {
  const startToday = startOfToday();
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);
  const startOfWeek = new Date(startToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

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

function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = startOfToday();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const sameDay = d >= today;
  const isYesterday = d >= yesterday && d < today;
  if (sameDay || isYesterday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function shortId(id: string): string {
  // Surface a short "INS-XXXX" style label like the prototype. Falls back to
  // the last 4 chars of the raw id when the row doesn't follow that pattern.
  const trimmed = id.replace(/-/g, "").slice(-4).toUpperCase();
  return `INS-${trimmed}`;
}

// Stable visual grade for demo rows — hashes the inspection id so the chip
// is deterministic across renders. Replace once the row carries an aggregate
// grade column from analysis.
function deriveGrade(id: string): SeedGrade {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const bucket = Math.abs(h) % 10;
  if (bucket < 7) return "A";
  if (bucket < 9) return "B";
  return "C";
}

function itemDate(item: HistoryItem): string {
  return item.kind === "remote" ? item.row.captured_at : item.entry.createdAt;
}

function itemKey(item: HistoryItem): string {
  return item.kind === "remote" ? item.row.id : item.entry.id;
}
