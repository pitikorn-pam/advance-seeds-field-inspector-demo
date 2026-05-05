import { useCallback, useMemo } from "react";
import { ScrollView, View, Text, Pressable, RefreshControl } from "react-native";
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
import { useAuth } from "@/lib/auth";
import { useInspections } from "@/lib/queries";
import { useCaptureSession } from "@/lib/capture/session";
import { Pill } from "@/components/ui/Pill";
import { ErrorState } from "@/components/ui/States";
import { Skeleton, SkeletonList } from "@/components/ui/Skeleton";
import { HeroCard } from "@/components/home/HeroCard";
import { RecentInspections } from "@/components/home/RecentInspections";
import { SyncBanner } from "@/components/home/SyncBanner";
import { ModelUpdateBanner } from "@/components/home/ModelUpdateBanner";
import { ModelUpdateNotifier } from "@/components/home/ModelUpdateNotifier";
import { NotificationBell } from "@/components/home/NotificationBell";

/**
 * Home dashboard. Mirrors the prototype's home layout (prototype-fidelity-pass
 * D4): greeting + brand-deep hero card with today's KPIs + sparkline + big
 * primary CTA + recent inspections list + sync banner.
 *
 * Today's inspections are filtered client-side from the same `useInspections`
 * query the History screen uses — RLS guarantees only the user's own rows.
 * Recent shows up to 3 most recent regardless of date so the section never
 * empties immediately after onboarding.
 *
 * The "+ New inspection" CTA routes to /capture/setup, matching the Inspect
 * tab destination — two access paths to the same flow as documented in the
 * mobile-navigation spec.
 */
export default function HomeScreen() {
  const { t, i18n } = useTranslation(["common", "home", "inspections"]);
  const { profile } = useAuth();
  const router = useRouter();
  const session = useCaptureSession();
  const { data, isLoading, isError, refetch, isRefetching } = useInspections();

  const firstName = (profile?.full_name ?? profile?.email ?? "").split(/\s+|@/)[0];

  const dateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language === "th" ? "th-TH" : "en-US", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(new Date()),
    [i18n.language],
  );

  // Filter to today's inspections for the hero card. recent = top-3
  // overall (most recent), so the recent list still renders something
  // sensible immediately after a new install when "today" is empty.
  const { todayInspections, recent } = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const today = (data ?? []).filter((row) => new Date(row.captured_at) >= startOfToday);
    const top3 = (data ?? []).slice(0, 3);
    return { todayInspections: today, recent: top3 };
  }, [data]);

  // Edge-drag shortcut: pull the home screen rightward from the left
  // edge to reveal "New inspection". The gesture is mounted on a narrow
  // edge strip instead of the whole screen so Android does not route every
  // Home tap/scroll through this pan recognizer.
  const EDGE_TRIGGER_PX = 36;
  const COMMIT_DX = 100;

  const startCapture = useCallback(() => {
    session.reset();
    router.push("/capture/setup");
  }, [router, session]);

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
            {/* Greeting + initials chip */}
            <View className="flex-row items-center gap-md">
              <View className="flex-1">
                <Text className="text-caption text-fg-secondary">{dateLabel}</Text>
                <Text
                  className="text-fg-primary font-medium mt-xs"
                  style={{ fontSize: 22, letterSpacing: -0.4 }}
                >
                  {firstName ? t("home:greeting", { name: firstName }) : t("common:appName")}
                </Text>
              </View>
              {profile?.role ? (
                <Pill
                  tone={profile.role === "admin" ? "brand" : "info"}
                  label={t(`common:roles.${profile.role}`)}
                />
              ) : null}
              <NotificationBell />
            </View>

            {isLoading ? (
              <Skeleton style={{ height: 168 }} />
            ) : (
              <HeroCard todayInspections={todayInspections} />
            )}

            {isLoading ? (
              <SkeletonList rows={3} rowHeight={64} />
            ) : recent.length > 0 ? (
              <RecentInspections rows={recent} />
            ) : (
              <Pressable
                onPress={() => {
                  session.reset();
                  router.push("/capture/setup");
                }}
                className="rounded-2xl border border-line-tertiary bg-bg-primary px-lg py-2xl items-center"
              >
                <Text className="text-body text-fg-secondary text-center">
                  {t("inspections:list.empty")}
                </Text>
              </Pressable>
            )}

            <ModelUpdateBanner />
            <ModelUpdateNotifier />
            <SyncBanner />
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
    </View>
  );
}
