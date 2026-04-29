import { useCallback, useState, useMemo } from "react";
import {
  Animated,
  Dimensions,
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { CheckCheck, X, AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react-native";
import type { Notification, NotificationKind } from "@advance-seeds/types";
import { useAuth } from "@/lib/auth";
import {
  useNotifications,
  useInspections,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/lib/queries";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";

const PAGE_SIZE = 10;

const KIND_VISUAL: Record<NotificationKind, { icon: typeof Info; color: string; bg: string }> = {
  success: { icon: CheckCircle2, color: "#27500A", bg: "#EAF3DE" },
  info: { icon: Info, color: "#0C447C", bg: "#E6F1FB" },
  warning: { icon: AlertTriangle, color: "#633806", bg: "#FAEEDA" },
  error: { icon: AlertCircle, color: "#791F1F", bg: "#FCEBEB" },
};

/**
 * Notifications modal. Lazy-loads in pages of 10 — the underlying
 * useNotifications query fetches the most recent 50 in one trip; pagination
 * here is purely client-side rendering for smooth scroll. We start by
 * showing 10 and grow by 10 on each `onEndReached`.
 *
 * Mark-as-read happens on item tap (along with optional deep-link
 * navigation via `route`). A "Mark all read" affordance appears in the
 * top bar when unread > 0.
 *
 * Why not server-side pagination with a real cursor? The volume here
 * is small (notifications are user-scoped, prune-able). React Query's
 * single fetch + client slice keeps the implementation simple and the
 * UX (no spinner per page) snappy.
 */
export default function NotificationsModal() {
  const { t, i18n } = useTranslation(["common", "notifications"]);
  const router = useRouter();
  const { profile } = useAuth();
  const { data, isLoading, isError, refetch } = useNotifications();
  const inspections = useInspections();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const [pages, setPages] = useState(1);
  const [selected, setSelected] = useState<Notification | null>(null);
  const [detailX] = useState(() => new Animated.Value(Dimensions.get("window").width));

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
        // Don't await — optimistic update; user gets immediate dismiss feel.
        markRead.mutate(item.id);
      }
      setSelected(item);
      detailX.setValue(Dimensions.get("window").width);
      Animated.timing(detailX, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
    },
    [detailX, markRead],
  );

  const closeDetail = useCallback(() => {
    Animated.timing(detailX, {
      toValue: Dimensions.get("window").width,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setSelected(null);
    });
  }, [detailX]);

  const onEndReached = useCallback(() => {
    if (hasMore) setPages((p) => p + 1);
  }, [hasMore]);

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <View className="flex-row items-center gap-md px-xl py-md">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common:actions.cancel")}
          className="h-9 w-9 items-center justify-center rounded-full bg-bg-tertiary"
          onPress={() => router.back()}
        >
          <X color="#1A1A1A" size={18} />
        </Pressable>
        <Text className="flex-1 text-h1 font-medium text-fg-primary">
          {t("notifications:title")}
        </Text>
        {unreadCount > 0 && profile ? (
          <Pressable
            accessibilityRole="button"
            className="flex-row items-center gap-xs rounded-full bg-bg-tertiary px-md py-xs"
            onPress={() => markAllRead.mutate(profile.id)}
          >
            <CheckCheck color="#0F6E56" size={14} />
            <Text className="text-caption text-brand-deep font-medium">
              {t("notifications:markAllRead")}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {visible.length === 0 ? (
        <View className="flex-1 px-xl">
          <EmptyState hint={t("notifications:empty")} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <NotificationRow
              notification={item}
              isLast={index === visible.length - 1}
              dateFmt={dateFmt}
              onPress={() => onPressItem(item)}
            />
          )}
          onEndReachedThreshold={0.4}
          onEndReached={onEndReached}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
          ListFooterComponent={
            hasMore ? (
              <View className="py-md items-center">
                <ActivityIndicator size="small" color="#0F6E56" />
              </View>
            ) : null
          }
        />
      )}
      {selected ? (
        <Animated.View
          className="absolute inset-0 bg-bg-secondary"
          style={{ transform: [{ translateX: detailX }] }}
        >
          <NotificationDetail
            notification={selected}
            dateFmt={dateFmt}
            routeAvailable={routeAvailable(selected.route, inspections.data)}
            onClose={closeDetail}
            onOpen={() => {
              if (selected.route && routeAvailable(selected.route, inspections.data)) {
                router.push(selected.route as never);
              }
            }}
          />
        </Animated.View>
      ) : null}
    </SafeAreaView>
  );
}

function routeAvailable(route: string | null, inspections: { id: string }[] | undefined) {
  if (!route) return false;
  if (!route.startsWith("/inspections/")) return true;
  const id = route.split("/").filter(Boolean)[1];
  return !!id && !!inspections?.some((row) => row.id === id);
}

function NotificationDetail({
  notification,
  dateFmt,
  routeAvailable,
  onClose,
  onOpen,
}: {
  notification: Notification;
  dateFmt: Intl.DateTimeFormat;
  routeAvailable: boolean;
  onClose: () => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation(["common", "notifications"]);
  const visual = KIND_VISUAL[notification.kind];
  const Icon = visual.icon;
  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("notifications:detailTitle")}
        left={{
          accessibilityLabel: t("common:actions.close"),
          icon: <X color="#1A1A1A" size={18} />,
          onPress: onClose,
        }}
      />

      <ScrollView contentContainerClassName="px-xl py-lg gap-lg">
        <View className="flex-row items-center gap-md">
          <View
            className="items-center justify-center"
            style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: visual.bg }}
          >
            <Icon color={visual.color} size={20} />
          </View>
          <View className="flex-1">
            <Text className="text-h2 font-medium text-fg-primary">{notification.title}</Text>
            <Text className="text-caption text-fg-tertiary mt-xs">
              {dateFmt.format(new Date(notification.created_at))}
            </Text>
          </View>
        </View>

        {notification.body ? (
          <Text className="text-body text-fg-secondary">{notification.body}</Text>
        ) : null}

        {notification.route ? (
          <View className="rounded-xl border border-line-tertiary bg-bg-primary px-lg py-md gap-sm">
            <Text className="text-title font-medium text-fg-primary">
              {t("notifications:relatedContent")}
            </Text>
            <Text className="text-caption text-fg-secondary">
              {routeAvailable
                ? t("notifications:relatedAvailable")
                : t("notifications:relatedUnavailable")}
            </Text>
            {routeAvailable ? (
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

function NotificationRow({
  notification,
  isLast,
  dateFmt,
  onPress,
}: {
  notification: Notification;
  isLast: boolean;
  dateFmt: Intl.DateTimeFormat;
  onPress: () => void;
}) {
  const visual = KIND_VISUAL[notification.kind];
  const Icon = visual.icon;
  const unread = notification.read_at === null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`flex-row items-start gap-md py-md ${isLast ? "" : "border-b border-line-tertiary"}`}
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
            {notification.title}
          </Text>
          {unread ? (
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#0F6E56" }} />
          ) : null}
        </View>
        {notification.body ? (
          <Text className="text-caption text-fg-secondary mt-xs" numberOfLines={2}>
            {notification.body}
          </Text>
        ) : null}
        <Text className="text-caption text-fg-tertiary mt-xs">
          {dateFmt.format(new Date(notification.created_at))}
        </Text>
      </View>
    </Pressable>
  );
}
