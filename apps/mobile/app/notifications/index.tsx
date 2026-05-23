import { useCallback, useState, useMemo } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { CheckCheck, X, AlertTriangle, Check, Info, ChevronLeft } from "lucide-react-native";
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

type KindVisual = {
  icon: typeof Info;
  tintClass: string;
  inkClass: string;
  iconColor: string;
};

// Tailwind colour tokens only. Icon stroke colours below match the ink token
// values from @advance-seeds/tokens (success/warning/danger/info text vars).
const KIND_VISUAL: Record<NotificationKind, KindVisual> = {
  success: {
    icon: Check,
    tintClass: "bg-grade-a",
    inkClass: "text-grade-a-ink",
    iconColor: "#2D6E3F",
  },
  info: {
    icon: Info,
    tintClass: "bg-card-sky",
    inkClass: "text-info-text",
    iconColor: "#1957A4",
  },
  warning: {
    icon: AlertTriangle,
    tintClass: "bg-grade-b",
    inkClass: "text-grade-b-ink",
    iconColor: "#7A5A12",
  },
  error: {
    icon: X,
    tintClass: "bg-grade-reject",
    inkClass: "text-grade-reject-ink",
    iconColor: "#A02828",
  },
};

/**
 * Notifications list. Opened from More as a normal stack page. Row tap stack-pushes
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

  const timeFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language === "th" ? "th-TH" : "en-US", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    [i18n.language],
  );

  const formatRelative = useCallback(
    (iso: string) => {
      const d = new Date(iso);
      const now = new Date();
      const sameDay =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();
      if (sameDay) return timeFmt.format(d);
      return dateFmt.format(d);
    },
    [dateFmt, timeFmt],
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
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#171717" size={20} />,
          onPress: () => router.back(),
        }}
        right={
          unreadCount > 0 && profile
            ? {
                accessibilityLabel: t("notifications:markAllRead"),
                renderIcon: () => <CheckCheck size={18} />,
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
          renderItem={({ item }) => (
            <NotificationRow
              notification={item}
              formatTime={formatRelative}
              t={t}
              onPress={() => onPressItem(item)}
            />
          )}
          onEndReachedThreshold={0.4}
          onEndReached={onEndReached}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListFooterComponent={
            hasMore ? (
              <View className="py-md items-center">
                <ActivityIndicator size="small" />
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
  formatTime,
  t,
  onPress,
}: {
  notification: Notification;
  formatTime: (iso: string) => string;
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
      className={`flex-row items-start gap-md border-b border-line-tertiary px-xl py-lg ${
        unread ? "bg-bg-secondary" : "bg-bg-primary"
      }`}
    >
      <View className={`h-10 w-10 items-center justify-center rounded-md ${visual.tintClass}`}>
        <Icon color={visual.iconColor} size={18} />
      </View>
      <View className="flex-1">
        <View className="flex-row items-start gap-sm">
          <Text className="flex-1 text-body font-semibold text-fg-primary" numberOfLines={1}>
            {copy.title}
          </Text>
          {unread ? <View className="mt-[6px] h-2 w-2 rounded-full bg-primary" /> : null}
          <Text className="text-caption text-fg-tertiary" numberOfLines={1}>
            {formatTime(notification.created_at)}
          </Text>
        </View>
        {copy.body ? (
          <Text className="mt-xs text-caption text-fg-secondary" numberOfLines={2}>
            {copy.body}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
