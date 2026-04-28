import { useMemo } from "react";
import { ScrollView, View, Text, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { useAuth } from "@/lib/auth";
import { useInspections } from "@/lib/queries";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { HeroCard } from "@/components/home/HeroCard";
import { RecentInspections } from "@/components/home/RecentInspections";
import { SyncBanner } from "@/components/home/SyncBanner";

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

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  return (
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
        </View>

        <HeroCard todayInspections={todayInspections} />

        <Button
          label={t("common:actions.newInspection")}
          leadingIcon={<Plus color="#FFFFFF" size={18} />}
          onPress={() => router.push("/capture/setup")}
        />

        {recent.length > 0 ? (
          <RecentInspections rows={recent} />
        ) : (
          <Pressable
            onPress={() => router.push("/capture/setup")}
            className="rounded-2xl border border-line-tertiary bg-bg-primary px-lg py-2xl items-center"
          >
            <Text className="text-body text-fg-secondary text-center">
              {t("inspections:list.empty")}
            </Text>
          </Pressable>
        )}

        <SyncBanner lastSyncIso={recent[0]?.created_at ?? null} />
      </ScrollView>
    </SafeAreaView>
  );
}
