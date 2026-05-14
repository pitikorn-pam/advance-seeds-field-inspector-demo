import { useEffect, useMemo, useState } from "react";
import { Modal, View, Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

export type DateRange = { start: string | null; end: string | null };

interface Props {
  visible: boolean;
  value: DateRange;
  locale: string;
  onClose: () => void;
  onClear: () => void;
  onChange: (range: DateRange) => void;
}

export function DateRangePicker({ visible, value, locale, onClose, onClear, onChange }: Props) {
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
        <View className="rounded-lg bg-bg-primary px-lg py-lg">
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
              <ChevronLeft color="#171717" size={18} />
            </Pressable>
            <Text className="text-title font-medium text-fg-primary">{monthLabel}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("history:filters.nextMonth")}
              className="h-10 w-10 items-center justify-center rounded-full bg-bg-tertiary"
              onPress={() => shiftMonth(1)}
            >
              <ChevronRight color="#171717" size={18} />
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

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDateLabel(key: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-US", {
    dateStyle: "medium",
  }).format(parseDateKey(key));
}

export function rangeLabel(
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

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function weekdayLabels(locale: string): string[] {
  const base = new Date(2026, 0, 4);
  const fmt = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-US", {
    weekday: "short",
  });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2026, 0, base.getDate() + i)));
}
