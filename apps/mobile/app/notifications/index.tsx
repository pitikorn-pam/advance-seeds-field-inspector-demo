import { useCallback, useState, useMemo } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { CheckCheck, X, AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react-native";
import type { Notification, NotificationKind } from "@advance-seeds/types";
import { useAuth } from "@/lib/auth";
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/lib/queries";
import { displayNotificationCopy } from "@/lib/notifications/display";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";

const PAGE_SIZE = 10;

const KIND_VISUAL: Record<NotificationKind, { icon: typeof Info; color: string; bg: string }> = {
  success: { icon: CheckCircle2, color: "#285B12", bg: "#DFF6EC" },
  info: { icon: Info, color: "#1957A4", bg: "#E2F0FF" },
  warning: { icon: AlertTriangle, color: "#704B00", bg: "#FFF1B8" },
  error: { icon: AlertCircle, color: "#8A1F1B", bg: "#FFE2E0" },
};

/**
 * Notifications list. Modal-presented from the bell, so the top-bar X
 * dismisses the whole panel. Row tap stack-pushes
 * `/notifications/<id>` for the detail view (back chevron + native iOS
 * push animation), replacing the previous in-page Animated slide.
 *
 * Pagination is purely client-side over the cached useNotifications
 * fetch.
 */
export default function NotificationsModal() {
  const { t, i18n } = useTranslation(["common", "notifications", "more"]);
  const router = useRouter();
  const { profile } = useAuth();
  const { data, isLoading, isError, refetch } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const [pages, setPages] = useState(1);

  const visible = useMemo(() => (data ?? []).slice(0, pages * PAGE_SIZE), [data, pages]);
  const hasMore = (data?.length ?? 0) > visible.length;
  const unreadCount = useMemo(() => (data ?? []).filter((n) => n.read_at === null).length, [data]);

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

  const onPressItem = useCallback(
    (item: Notification) => {
      if (item.read_at === null) {
        markRead.mutate(item.id);
      }
      router.push(`/notifications/${item.id}` as never);
    },
    [router, markRead],
  );

  const onEndReached = useCallback(() => {
    if (hasMore) setPages((p) => p + 1);
  }, [hasMore]);

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("notifications:title")}
        left={{
          accessibilityLabel: t("common:actions.close"),
          renderIcon: () => <X color="#171717" size={18} />,
          onPress: () => router.back(),
        }}
        right={
          unreadCount > 0 && profile
            ? {
                accessibilityLabel: t("notifications:markAllRead"),
                renderIcon: () => <CheckCheck color="#6C47FF" size={18} />,
                onPress: () => markAllRead.mutate(profile.id),
              }
            : undefined
        }
      />

      {visible.length === 0 ? (
        <View className="flex-1 px-xl">
          <EmptyState hint={t("notifications:empty")} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <Text className="mb-md text-body text-fg-secondary">{t("notifications:subtitle")}</Text>
          }
          renderItem={({ item, index }) => (
            <NotificationRow
              notification={item}
              isLast={index === visible.length - 1}
              dateFmt={dateFmt}
              t={t}
              onPress={() => onPressItem(item)}
            />
          )}
          onEndReachedThreshold={0.4}
          onEndReached={onEndReached}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, paddingTop: 16 }}
          ListFooterComponent={
            hasMore ? (
              <View className="py-md items-center">
                <ActivityIndicator size="small" color="#6C47FF" />
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

function NotificationRow({
  notification,
  isLast,
  dateFmt,
  t,
  onPress,
}: {
  notification: Notification;
  isLast: boolean;
  dateFmt: Intl.DateTimeFormat;
  t: (key: string, options?: Record<string, unknown>) => string;
  onPress: () => void;
}) {
  const visual = KIND_VISUAL[notification.kind];
  const Icon = visual.icon;
  const unread = notification.read_at === null;
  const copy = displayNotificationCopy(notification, t);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`flex-row items-start gap-md rounded-lg border border-line-tertiary bg-bg-primary px-xl py-lg ${isLast ? "" : "mb-md"}`}
    >
      <View
        className="items-center justify-center"
        style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: visual.bg }}
      >
        <Icon color={visual.color} size={18} />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center gap-sm">
          <Text
            className={`flex-1 text-title font-medium ${unread ? "text-fg-primary" : "text-fg-secondary"}`}
            numberOfLines={1}
          >
            {copy.title}
          </Text>
          {unread ? (
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#6C47FF" }} />
          ) : null}
        </View>
        {copy.body ? (
          <Text className="text-caption text-fg-secondary mt-xs" numberOfLines={2}>
            {copy.body}
          </Text>
        ) : null}
        <Text className="text-caption text-fg-tertiary mt-xs">
          {dateFmt.format(new Date(notification.created_at))}
        </Text>
      </View>
    </Pressable>
  );
}
