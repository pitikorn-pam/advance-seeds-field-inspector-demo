import { useMemo } from "react";
import { ScrollView, View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react-native";
import type { NotificationKind } from "@advance-seeds/types";
import { useNotifications, useInspections } from "@/lib/queries";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { LoadingState, ErrorState } from "@/components/ui/States";

const KIND_VISUAL: Record<NotificationKind, { icon: typeof Info; color: string; bg: string }> = {
  success: { icon: CheckCircle2, color: "#27500A", bg: "#EAF3DE" },
  info: { icon: Info, color: "#0C447C", bg: "#E6F1FB" },
  warning: { icon: AlertTriangle, color: "#633806", bg: "#FAEEDA" },
  error: { icon: AlertCircle, color: "#791F1F", bg: "#FCEBEB" },
};

/**
 * Notification detail page. Stack-pushed from the notifications list, so
 * iOS gives it the standard right-to-left slide animation and the back
 * chevron is the conventional control. Replaces the previous in-page
 * Animated.View slide that used an X close icon.
 */
export default function NotificationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation(["common", "notifications"]);
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useNotifications();
  const inspections = useInspections();

  const notification = useMemo(() => data?.find((n) => n.id === id) ?? null, [data, id]);

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language === "th" ? "th-TH" : "en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    [i18n.language],
  );

  const back = {
    accessibilityLabel: t("common:actions.back"),
    renderIcon: () => <ChevronLeft color="#1A1A1A" size={20} />,
    onPress: () => router.back(),
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
        <AppTopBar title={t("notifications:detailTitle")} left={back} />
        <LoadingState />
      </SafeAreaView>
    );
  }
  if (isError || !notification) {
    return (
      <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
        <AppTopBar title={t("notifications:detailTitle")} left={back} />
        <ErrorState onRetry={() => void refetch()} />
      </SafeAreaView>
    );
  }

  const visual = KIND_VISUAL[notification.kind];
  const Icon = visual.icon;
  const routeOk = routeAvailable(notification.route, inspections.data);
  const onOpen = () => {
    if (notification.route && routeOk) {
      router.push(notification.route as never);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar title={t("notifications:detailTitle")} left={back} />
      <ScrollView contentContainerClassName="px-xl py-lg gap-md">
        <Text className="text-body text-fg-secondary px-xs">
          {t("notifications:detailSubtitle")}
        </Text>

        <View className="rounded-xl border border-line-tertiary bg-bg-primary px-xl py-lg">
          <View className="flex-row items-center gap-md">
            <View
              className="items-center justify-center"
              style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: visual.bg }}
            >
              <Icon color={visual.color} size={22} />
            </View>
            <View className="flex-1">
              <Text className="text-h2 font-medium text-fg-primary">{notification.title}</Text>
              <Text className="text-caption text-fg-tertiary mt-xs">
                {dateFmt.format(new Date(notification.created_at))}
              </Text>
            </View>
          </View>

          {notification.body ? (
            <Text className="mt-md text-body text-fg-secondary">{notification.body}</Text>
          ) : null}
        </View>

        {notification.route ? (
          <View className="rounded-xl border border-line-tertiary bg-bg-primary px-xl py-lg gap-sm">
            <Text className="text-title font-medium text-fg-primary">
              {t("notifications:relatedContent")}
            </Text>
            <Text className="text-caption text-fg-secondary">
              {routeOk
                ? t("notifications:relatedAvailable")
                : t("notifications:relatedUnavailable")}
            </Text>
            {routeOk ? (
              <Pressable
                accessibilityRole="button"
                className="mt-xs self-start rounded-full bg-brand px-md py-xs"
                onPress={onOpen}
              >
                <Text className="text-caption font-medium text-white">
                  {t("notifications:openRelated")}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function routeAvailable(route: string | null, inspections: { id: string }[] | undefined): boolean {
  if (!route) return false;
  if (!route.startsWith("/inspections/")) return true;
  const id = route.split("/").filter(Boolean)[1];
  return !!id && !!inspections?.some((row) => row.id === id);
}
