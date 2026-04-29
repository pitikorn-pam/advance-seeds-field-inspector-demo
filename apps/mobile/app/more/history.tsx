import { useEffect, useMemo, useState } from "react";
import { Modal, ScrollView, View, Text, Pressable, RefreshControl } from "react-native";
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
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";

type Filter = "all" | "today" | "synced" | "pending";
type GroupKey = "today" | "yesterday" | "earlierThisWeek" | "earlier";
type DateRange = { start: string | null; end: string | null };

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
    { value: "synced", label: t("history:segments.synced") },
    { value: "pending", label: t("history:segments.pending") },
  ];

  const grouped = useMemo(() => {
    if (!data) return [];
    const filtered = applyFilter(data, filter, dateRange);
    return groupByDate(filtered);
  }, [data, filter, dateRange]);

  const totalShown = grouped.reduce((s, g) => s + g.items.length, 0);
  const dateLabel = historyRangeLabel(dateRange, i18n.language, t);
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
      <HistoryDatePicker
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
      case "synced":
        // Every row is synced today; no-op vs all but kept for future
        // when offline queue ships.
        return rows;
      case "pending":
        // Placeholder: no pending rows until offline queue lands.
        return [];
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

function HistoryDatePicker({
  visible,
  value,
  locale,
  onClose,
  onClear,
  onChange,
}: {
  visible: boolean;
  value: DateRange;
  locale: string;
  onClose: () => void;
  onClear: () => void;
  onChange: (range: DateRange) => void;
}) {
  const { t } = useTranslation(["common", "history"]);
  const initialMonth = value.start ? parseDateKey(value.start) : new Date();
  const [month, setMonth] = useState(() => startOfMonth(initialMonth));

  useEffect(() => {
    if (visible) setMonth(startOfMonth(value.start ? parseDateKey(value.start) : new Date()));
  }, [value, visible]);

  const days = useMemo(() => calendarDays(month), [month]);
  const monthLabel = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-US", {
    month: "long",
    year: "numeric",
  }).format(month);
  const weekdays = useMemo(() => weekdayLabels(locale), [locale]);

  const shiftMonth = (delta: number) => {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  const selectDay = (key: string) => {
    if (!value.start || value.end) {
      onChange({ start: key, end: null });
      return;
    }
    if (key < value.start) {
      onChange({ start: key, end: null });
      return;
    }
    onChange({ start: value.start, end: key });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-center bg-black/30 px-lg">
        <View className="rounded-xl bg-bg-primary px-lg py-lg">
          <View className="mb-md">
            <Text className="text-title font-medium text-fg-primary">
              {t("history:filters.dateRange")}
            </Text>
            <Text className="mt-xs text-caption text-fg-secondary">
              {t("history:filters.rangeHint")}
            </Text>
            <View className="mt-md flex-row gap-sm">
              <RangeChip
                label={t("history:filters.start")}
                value={
                  value.start ? formatDateLabel(value.start, locale) : t("history:filters.notSet")
                }
                active={!!value.start}
              />
              <RangeChip
                label={t("history:filters.end")}
                value={
                  value.end ? formatDateLabel(value.end, locale) : t("history:filters.selectEnd")
                }
                active={!!value.end}
              />
            </View>
          </View>

          <View className="mb-md flex-row items-center justify-between">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("history:filters.previousMonth")}
              className="h-10 w-10 items-center justify-center rounded-full bg-bg-tertiary"
              onPress={() => shiftMonth(-1)}
            >
              <ChevronLeft color="#1A1A1A" size={18} />
            </Pressable>
            <Text className="text-title font-medium text-fg-primary">{monthLabel}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("history:filters.nextMonth")}
              className="h-10 w-10 items-center justify-center rounded-full bg-bg-tertiary"
              onPress={() => shiftMonth(1)}
            >
              <ChevronRight color="#1A1A1A" size={18} />
            </Pressable>
          </View>

          <View className="mb-xs flex-row">
            {weekdays.map((day) => (
              <Text
                key={day}
                className="flex-1 text-center text-caption font-medium text-fg-secondary"
              >
                {day}
              </Text>
            ))}
          </View>

          <View className="flex-row flex-wrap">
            {days.map((day, index) => {
              const key = day ? toDateKey(day) : `blank-${index}`;
              const startSelected = !!day && key === value.start;
              const endSelected = !!day && key === value.end;
              const selected = startSelected || endSelected;
              const hasFullRange = !!value.start && !!value.end;
              const inRange = !!day && hasFullRange && key > value.start! && key < value.end!;
              const hasTrack = hasFullRange && !!day && key >= value.start! && key <= value.end!;
              const trackStyle = rangeTrackStyle({
                start: startSelected,
                end: endSelected,
                inRange,
                singleDay: startSelected && endSelected,
              });
              return (
                <View key={key} className="w-[14.2857%] py-[3px]">
                  {day ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      className="h-10 items-center justify-center"
                      onPress={() => selectDay(key)}
                    >
                      {hasTrack ? (
                        <View
                          pointerEvents="none"
                          className="absolute h-8 bg-brand-soft"
                          style={trackStyle}
                        />
                      ) : null}
                      {startSelected && !value.end ? (
                        <View
                          pointerEvents="none"
                          className="absolute h-8 w-8 rounded-full border border-brand bg-brand-soft"
                        />
                      ) : null}
                      {selected ? (
                        <View
                          pointerEvents="none"
                          className="absolute h-10 w-10 rounded-full bg-brand"
                        />
                      ) : null}
                      <Text
                        className={`text-title font-medium ${
                          selected
                            ? "text-brand-on"
                            : inRange || (startSelected && !value.end)
                              ? "text-brand-deep"
                              : "text-fg-primary"
                        }`}
                      >
                        {day.getDate()}
                      </Text>
                    </Pressable>
                  ) : (
                    <View className="h-10" />
                  )}
                </View>
              );
            })}
          </View>

          <View className="mt-lg flex-row gap-md">
            <Pressable
              accessibilityRole="button"
              className="h-11 flex-1 items-center justify-center rounded-lg border border-line-secondary"
              onPress={() => {
                onClear();
                onClose();
              }}
            >
              <Text className="text-title font-medium text-fg-primary">
                {t("common:actions.clear")}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              className="h-11 flex-1 items-center justify-center rounded-lg bg-brand"
              onPress={onClose}
            >
              <Text className="text-title font-medium text-brand-on">
                {t("common:actions.close")}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function RangeChip({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <View
      className={`min-h-12 flex-1 justify-center rounded-lg border px-md py-xs ${
        active ? "border-brand bg-brand-soft" : "border-line-tertiary bg-bg-secondary"
      }`}
    >
      <Text className="text-caption font-medium text-fg-secondary">{label}</Text>
      <Text
        className={`mt-[2px] text-caption font-medium ${active ? "text-brand-deep" : "text-fg-tertiary"}`}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function rangeTrackStyle({
  start,
  end,
  inRange,
  singleDay,
}: {
  start: boolean;
  end: boolean;
  inRange: boolean;
  singleDay: boolean;
}) {
  if (singleDay) return { left: 6, right: 6, borderRadius: 16 };
  if (start) return { left: 20, right: 0, borderTopRightRadius: 16, borderBottomRightRadius: 16 };
  if (end) return { left: 0, right: 20, borderTopLeftRadius: 16, borderBottomLeftRadius: 16 };
  if (inRange) return { left: 0, right: 0 };
  return { left: 0, right: 0 };
}

function calendarDays(month: Date): Array<Date | null> {
  const first = startOfMonth(month);
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const blanks = first.getDay();
  const days: Array<Date | null> = Array.from({ length: blanks }, () => null);
  for (let day = 1; day <= count; day += 1) {
    days.push(new Date(first.getFullYear(), first.getMonth(), day));
  }
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function formatDateLabel(key: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-US", {
    dateStyle: "medium",
  }).format(parseDateKey(key));
}

function historyRangeLabel(
  range: DateRange,
  locale: string,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (!range.start) return t("history:filters.allDates");
  const start = formatDateLabel(range.start, locale);
  if (!range.end || range.end === range.start) {
    return t("history:filters.fromDate", { date: start });
  }
  return t("history:filters.rangeLabel", {
    start,
    end: formatDateLabel(range.end, locale),
  });
}

function weekdayLabels(locale: string): string[] {
  const base = new Date(2026, 0, 4);
  const fmt = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-US", {
    weekday: "short",
  });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2026, 0, base.getDate() + i)));
}
