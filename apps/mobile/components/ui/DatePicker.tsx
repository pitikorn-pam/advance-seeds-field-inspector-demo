import { useEffect, useMemo, useState } from "react";
import { Modal, View, Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { toDateKey } from "./DateRangePicker";

interface Props {
  visible: boolean;
  /** ISO date "YYYY-MM-DD" or null. */
  value: string | null;
  locale: string;
  title?: string;
  onClose: () => void;
  onClear?: () => void;
  onChange: (key: string) => void;
}

/**
 * Single-date picker modal. Visual DNA matches DateRangePicker so both
 * pickers feel like the same component family — month nav with chevron
 * buttons, weekday header, brand-tinted selected day, Clear + Close
 * controls at the bottom.
 *
 * The shared `toDateKey` helper from DateRangePicker is reused so anything
 * that already speaks ISO YYYY-MM-DD (recordings filter, batches sown
 * date) keeps the same key format.
 */
export function DatePicker({ visible, value, locale, title, onClose, onClear, onChange }: Props) {
  const { t } = useTranslation(["common"]);
  const initial = value ? parseDateKey(value) : new Date();
  const [month, setMonth] = useState(() => startOfMonth(initial));

  useEffect(() => {
    if (visible) setMonth(startOfMonth(value ? parseDateKey(value) : new Date()));
  }, [visible, value]);

  const days = useMemo(() => calendarDays(month), [month]);
  const monthLabel = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-US", {
    month: "long",
    year: "numeric",
  }).format(month);
  const weekdays = useMemo(() => weekdayLabels(locale), [locale]);

  const shiftMonth = (delta: number) => {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-center bg-black/30 px-lg">
        <View className="rounded-lg bg-bg-primary px-lg py-lg">
          {title ? (
            <Text className="text-title font-medium text-fg-primary mb-md">{title}</Text>
          ) : null}

          <View className="mb-md flex-row items-center justify-between">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common:actions.back")}
              className="h-10 w-10 items-center justify-center rounded-full bg-bg-tertiary"
              onPress={() => shiftMonth(-1)}
            >
              <ChevronLeft color="#171717" size={18} />
            </Pressable>
            <Text className="text-title font-medium text-fg-primary">{monthLabel}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common:actions.more")}
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
              const selected = !!day && key === value;
              return (
                <View key={key} className="w-[14.2857%] py-[3px]">
                  {day ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      className="h-10 items-center justify-center"
                      onPress={() => {
                        onChange(key);
                        onClose();
                      }}
                    >
                      {selected ? (
                        <View
                          pointerEvents="none"
                          className="absolute h-10 w-10 rounded-full bg-brand"
                        />
                      ) : null}
                      <Text
                        className={`text-title font-medium ${selected ? "text-brand-on" : "text-fg-primary"}`}
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
            {onClear ? (
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
            ) : null}
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
