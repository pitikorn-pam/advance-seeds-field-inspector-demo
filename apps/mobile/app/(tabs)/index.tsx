import { useCallback, useMemo, useState } from "react";
import { ScrollView, View, Text, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";
import { Calendar, X } from "lucide-react-native";
import { useAuth } from "@/lib/auth";
import { useInspections } from "@/lib/queries";
import { useCaptureSession } from "@/lib/capture/session";
import { useTheme } from "@/lib/theme";
import { RolePill, type Role } from "@/components/ui/RolePill";
import { SyncPill, type SyncState } from "@/components/ui/SyncPill";
import { Button } from "@/components/ui/Button";
import { useSyncQueue } from "@/lib/sync/useSyncQueue";
import { Segmented } from "@/components/ui/Segmented";
import { ErrorState } from "@/components/ui/States";
import { Skeleton, SkeletonList } from "@/components/ui/Skeleton";
import {
  DateRangePicker,
  type DateRange,
  rangeLabel,
  toDateKey,
} from "@/components/ui/DateRangePicker";
import { HeroCard } from "@/components/home/HeroCard";
import { RecentInspections } from "@/components/home/RecentInspections";
import { ModelUpdateBanner } from "@/components/home/ModelUpdateBanner";
import { ModelUpdateNotifier } from "@/components/home/ModelUpdateNotifier";
import { NotificationBell } from "@/components/home/NotificationBell";
import { useModelInstallInspectionGate } from "@/lib/models/inspectionGate";

type HomeRangePreset = "today" | "last7" | "last30" | "custom";

/**
 * Home dashboard. Summarizes current field operations while the Inspect tab
 * and edge swipe own capture entry.
 *
 * Dashboard and recent rows are derived client-side from the same
 * `useInspections` query the History screen uses — RLS guarantees only
 * the user's own rows.
 * Recent shows up to 3 most recent regardless of date so the section never
 * empties immediately after onboarding.
 *
 */
export default function HomeScreen() {
  const { t, i18n } = useTranslation(["common", "home", "history", "inspections"]);
  const { profile } = useAuth();
  const { resolved } = useTheme();
  const router = useRouter();
  const session = useCaptureSession();
  const modelInstallGate = useModelInstallInspectionGate();
  const syncQueue = useSyncQueue();
  const { data, isLoading, isError, refetch, isRefetching } = useInspections();

  // Derive a single sync state from queue counts. Failed beats pending —
  // a failed entry needs the user's attention more than a still-uploading one.
  const syncState: SyncState =
    syncQueue.counts.failed > 0 ? "failed" : syncQueue.counts.pending > 0 ? "pending" : "synced";
  const syncCount =
    syncState === "failed"
      ? syncQueue.counts.failed
      : syncState === "pending"
        ? syncQueue.counts.pending
        : 0;
  const [rangePreset, setRangePreset] = useState<HomeRangePreset>("today");
  const [dateRange, setDateRange] = useState<DateRange>(() => presetToRange("today"));
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const firstName = (profile?.full_name ?? profile?.email ?? "").split(/\s+|@/)[0];

  // Recent = top-3 overall (most recent), so the list still renders something
  // sensible even when today's dashboard is empty.
  const recent = useMemo(() => {
    const top3 = (data ?? []).slice(0, 3);
    return top3;
  }, [data]);
  const dashboardInspections = useMemo(
    () => filterByDateRange(data ?? [], dateRange),
    [data, dateRange],
  );
  // Prior-period slice for KPI deltas. We shift the active range backward by
  // its own length so "Today" compares to yesterday, "7D" to the prior week,
  // and so on. Custom ranges with no start fall back to comparing the full
  // history to its own halves — coarse but stable.
  const priorInspections = useMemo(
    () => filterByDateRange(data ?? [], shiftRangeBackward(dateRange)),
    [data, dateRange],
  );
  const dashboardDateLabel = rangeLabel(dateRange, i18n.language, t);
  const hasCustomDateRange = rangePreset === "custom" && (!!dateRange.start || !!dateRange.end);
  const iconColor = resolved === "dark" ? "#F7F7F5" : "#171717";
  const rangeOptions = useMemo(
    () =>
      (["today", "last7", "last30", "custom"] as HomeRangePreset[]).map((value) => ({
        value,
        label: t(`home:datePresets.${value}`),
      })),
    [t],
  );

  const setPreset = (next: HomeRangePreset) => {
    setRangePreset(next);
    if (next === "custom") {
      setDatePickerOpen(true);
      return;
    }
    setDateRange(presetToRange(next));
  };

  // Edge-drag shortcut: pull the home screen rightward from the left
  // edge to reveal "New inspection". The gesture is mounted on a narrow
  // edge strip instead of the whole screen so Android does not route every
  // Home tap/scroll through this pan recognizer.
  const EDGE_TRIGGER_PX = 36;
  const COMMIT_DX = 100;

  const startCapture = useCallback(() => {
    if (modelInstallGate.showBlockedMessage()) return;
    session.reset();
    router.push("/capture/setup");
  }, [modelInstallGate, router, session]);

  // Tracks the home content's horizontal offset during the drag. Reset
  // to 0 on snap-back; reset to 0 (after a brief fade) on commit so the
  // user returns to a clean Home next time they swipe back.
  const dragX = useSharedValue(0);

  const triggerHaptic = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  // Defensive reset whenever Home regains focus — e.g., after popping
  // the capture stack with a non-zero dragX still mid-`withTiming`. Without
  // this, an interrupted commit animation can leave Home rendered with a
  // residual translateX so it looks "stuck open" until you swipe again.
  useFocusEffect(
    useCallback(() => {
      dragX.value = 0;
    }, [dragX]),
  );

  const edgeSwipe = useMemo(
    () =>
      Gesture.Pan()
        // Dormant until the finger has moved 15px rightward; bails if
        // the user moved 15px vertically first — keeps the ScrollView's
        // vertical pan as the default winner.
        .activeOffsetX([15, 9999])
        .failOffsetY([-15, 15])
        .onBegin(() => {
          "worklet";
          // Hard-reset at the start of every gesture so a partially-completed
          // prior animation can never bias the new drag's starting offset.
          dragX.value = 0;
        })
        .onUpdate((e) => {
          "worklet";
          const startedAtEdge = e.absoluteX - e.translationX < EDGE_TRIGGER_PX;
          if (!startedAtEdge) return;
          // Soft rubber-band past the commit point so the drag still
          // moves but visibly resists — communicates "you're past the
          // commit threshold" without snapping.
          const raw = Math.max(0, e.translationX);
          const past = Math.max(0, raw - COMMIT_DX);
          dragX.value = raw - past * 0.5;
        })
        .onEnd((e) => {
          "worklet";
          const startedAtEdge = e.absoluteX - e.translationX < EDGE_TRIGGER_PX;
          const committed = startedAtEdge && e.translationX > COMMIT_DX;
          if (committed) {
            runOnJS(triggerHaptic)();
            runOnJS(startCapture)();
            // Quick reset so the home screen is back at rest by the
            // time the user navigates back.
            dragX.value = withTiming(0, { duration: 220 });
          } else {
            dragX.value = withSpring(0, { damping: 18, stiffness: 220 });
          }
        }),
    [dragX, startCapture, triggerHaptic],
  );

  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.value }],
  }));

  // Backdrop fade — the dark layer SITS BEHIND Home and is revealed as
  // Home slides rightward. Opacity ramps with drag progress so the
  // exposed gap deepens from neutral to near-black, communicating
  // "you're pulling Home aside to reveal the next surface." Capped
  // before full black so the eye still reads it as backdrop, not as a
  // void.
  const backdropStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, dragX.value / COMMIT_DX);
    return { opacity: 0.55 + progress * 0.4 };
  });

  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Animated.View
        pointerEvents="none"
        style={[{ position: "absolute", inset: 0, backgroundColor: "#000" }, backdropStyle]}
      />
      <Animated.View style={[{ flex: 1 }, dragStyle]} className="bg-bg-secondary">
        <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top"]}>
          <ScrollView
            contentContainerClassName="px-xl py-md gap-lg"
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
            }
          >
            {/* Greeting row — prototype: 36x36 lavender avatar with initials,
                "Good morning" caption above the name, RolePill inline next to
                the name, notification bell on the right. The date is NOT in
                this row — it's implicit via the filter pills below. */}
            <View className="flex-row items-center gap-md">
              <Avatar name={profile?.full_name ?? profile?.email ?? "?"} />
              <View className="flex-1">
                <Text className="text-caption text-fg-tertiary">{t("home:goodMorning")}</Text>
                <View className="flex-row items-center gap-xs mt-[1px]">
                  <Text
                    className="text-fg-primary font-semibold"
                    style={{ fontSize: 19, letterSpacing: -0.3 }}
                    numberOfLines={1}
                  >
                    {firstName || t("common:appName")}
                  </Text>
                  {profile?.role ? (
                    <RolePill role={(profile.role === "admin" ? "Admin" : "Inspector") as Role} />
                  ) : null}
                </View>
              </View>
              <NotificationBell />
            </View>

            {isLoading ? (
              <Skeleton style={{ height: 168 }} />
            ) : (
              <>
                <View className="gap-sm">
                  {/* Segmented + sync state on the right — single row per prototype */}
                  <View className="flex-row items-center gap-sm">
                    <View className="flex-1">
                      <Segmented<HomeRangePreset>
                        value={rangePreset}
                        onChange={setPreset}
                        options={rangeOptions}
                        variant="tag"
                        scrollable
                      />
                    </View>
                    <SyncPill state={syncState} count={syncCount} />
                  </View>
                  {rangePreset === "custom" ? (
                    <View className="flex-row items-center gap-xs">
                      <Button
                        className="flex-1"
                        size="sm"
                        variant="outline"
                        label={dashboardDateLabel}
                        renderLeadingIcon={() => <Calendar color="#6E40E0" size={14} />}
                        onPress={() => setDatePickerOpen(true)}
                      />
                      {hasCustomDateRange ? (
                        <Button
                          size="icon"
                          variant="tinted"
                          accessibilityLabel={t("common:actions.clear")}
                          onPress={() => setDateRange({ start: null, end: null })}
                        >
                          <X color={iconColor} size={16} />
                        </Button>
                      ) : null}
                    </View>
                  ) : null}
                </View>
                <HeroCard
                  inspections={dashboardInspections}
                  priorInspections={priorInspections}
                  dateLabel={dashboardDateLabel}
                />
              </>
            )}

            {isLoading ? (
              <SkeletonList rows={3} rowHeight={64} />
            ) : recent.length > 0 ? (
              <RecentInspections rows={recent} />
            ) : (
              <View className="items-center rounded-lg border border-line-tertiary bg-card-cream px-lg py-2xl">
                <Text className="text-body text-fg-secondary text-center">
                  {t("home:recentEmpty")}
                </Text>
              </View>
            )}

            <ModelUpdateBanner />
            <ModelUpdateNotifier />
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
      <GestureDetector gesture={edgeSwipe}>
        <View
          accessibilityElementsHidden
          collapsable={false}
          importantForAccessibility="no-hide-descendants"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: EDGE_TRIGGER_PX,
            zIndex: 20,
          }}
        />
      </GestureDetector>
      <DateRangePicker
        visible={datePickerOpen}
        value={dateRange}
        locale={i18n.language}
        onClose={() => setDatePickerOpen(false)}
        onClear={() => setDateRange({ start: null, end: null })}
        onChange={setDateRange}
      />
    </View>
  );
}

/**
 * 40x40 lavender circle with the user's initials. Matches the prototype's
 * "JK" avatar — a lightweight identity anchor for the greeting row.
 * Local to this file because no other screen renders the same shape yet;
 * promote to components/ui if a second consumer shows up.
 */
function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <View className="h-[36px] w-[36px] items-center justify-center rounded-full bg-card-lavender">
      <Text className="text-[13px] font-semibold text-primary-deep">{initials || "·"}</Text>
    </View>
  );
}

function presetToRange(preset: HomeRangePreset): DateRange {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (preset === "today") {
    return { start: toDateKey(today), end: toDateKey(today) };
  }
  if (preset === "last7" || preset === "last30") {
    const start = new Date(today);
    start.setDate(today.getDate() - (preset === "last7" ? 6 : 29));
    return { start: toDateKey(start), end: toDateKey(today) };
  }
  return { start: null, end: null };
}

function filterByDateRange<T extends { captured_at: string }>(rows: T[], range: DateRange): T[] {
  if (!range.start) return rows;
  const end = range.end ?? range.start;
  return rows.filter((row) => {
    const key = toDateKey(new Date(row.captured_at));
    return key >= range.start! && key <= end;
  });
}

/**
 * Shift a range backward by its own length so KPI deltas have a stable
 * prior-period reference. Today → yesterday, 7D → prior 7D, etc. Returns
 * a null range when the input has no start (open-ended history), since
 * there is no meaningful prior period to compare to.
 */
function shiftRangeBackward(range: DateRange): DateRange {
  if (!range.start) return { start: null, end: null };
  const startD = new Date(range.start);
  const endD = new Date(range.end ?? range.start);
  const lengthDays = Math.max(1, Math.round((+endD - +startD) / 86_400_000) + 1);
  const priorEnd = new Date(startD);
  priorEnd.setDate(startD.getDate() - 1);
  const priorStart = new Date(priorEnd);
  priorStart.setDate(priorEnd.getDate() - (lengthDays - 1));
  return { start: toDateKey(priorStart), end: toDateKey(priorEnd) };
}
