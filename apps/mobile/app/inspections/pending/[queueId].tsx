import { useEffect, useMemo } from "react";
import { ScrollView, View, Text, Image, Alert, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Cloud, RefreshCw, Trash2 } from "lucide-react-native";
import { useVarieties } from "@/lib/queries";
import {
  removeQueueEntry,
  retryAllFailedQueueEntries,
  useSyncQueueEntries,
} from "@/lib/sync/store";
import { replaySyncQueue } from "@/lib/sync/replay";
import { deleteLocalMediaForPayload } from "@/lib/sync/localMedia";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { ErrorState } from "@/components/ui/States";

/**
 * Pending inspection detail.
 *
 * Shown after an offline / queueable-error save: the user lands here
 * instead of the home screen so they can see the inspection they just
 * captured is queued, what's in it, and retry / cancel without hunting
 * through Settings → Sync. Once the replay worker syncs the entry, this
 * screen auto-redirects to the canonical /inspections/<remoteId> page.
 *
 * Pure read-from-queue: no Supabase calls. Lookups (variety name) reuse
 * the cached useVarieties query.
 */
export default function PendingInspectionDetail() {
  const { queueId } = useLocalSearchParams<{ queueId: string }>();
  const { t, i18n } = useTranslation(["common", "inspections"]);
  const router = useRouter();
  const entries = useSyncQueueEntries();
  const varieties = useVarieties();

  const entry = useMemo(() => entries.find((e) => e.id === queueId) ?? null, [entries, queueId]);

  // Auto-redirect to the real inspection once the replay worker writes a
  // remoteId. Replace, not push, so the back stack lands on the home tab.
  useEffect(() => {
    if (entry && entry.status === "synced" && entry.remoteId) {
      router.replace(`/inspections/${entry.remoteId}`);
    }
  }, [entry, router]);

  if (!entry) {
    return (
      <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
        <AppTopBar
          title={t("inspections:pending.title")}
          left={{
            accessibilityLabel: t("common:actions.back"),
            renderIcon: () => <ChevronLeft color="#171717" size={20} />,
            onPress: () => router.back(),
          }}
        />
        <ErrorState hint={t("inspections:pending.notFound")} onRetry={() => router.replace("/")} />
      </SafeAreaView>
    );
  }

  if (entry.payload.kind !== "inspection") {
    // Recordings get their own future surface; route the user to the home
    // screen if they somehow landed here for a non-inspection entry.
    router.replace("/");
    return null;
  }
  const data = entry.payload.data;

  const variety = varieties.data?.find((v) => v.id === data.variety_id) ?? null;
  const dateFmt = new Intl.DateTimeFormat(i18n.language === "th" ? "th-TH" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const createdAt = new Date(entry.createdAt);

  const statusPill = pillForStatus(entry.status, t);
  const previewUri =
    data.media_kind === "video" ? null : data.local_media_uri || data.remote_media_url || null;

  const onRetry = async () => {
    await retryAllFailedQueueEntries();
    void replaySyncQueue();
  };

  const onCancel = () => {
    Alert.alert(t("inspections:pending.cancelTitle"), t("inspections:pending.cancelBody"), [
      { text: t("common:actions.cancel"), style: "cancel" },
      {
        text: t("common:actions.delete"),
        style: "destructive",
        onPress: async () => {
          // User explicitly discarded — drop both the queue row and the
          // local file. The captured media is unrecoverable after this.
          await deleteLocalMediaForPayload(entry.payload);
          await removeQueueEntry(entry.id);
          if (router.canGoBack()) router.back();
          else router.replace("/");
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("inspections:pending.title")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#171717" size={20} />,
          onPress: () => {
            if (router.canGoBack()) router.back();
            else router.replace("/");
          },
        }}
      />
      <ScrollView contentContainerClassName="px-xl py-md gap-md">
        <View className="flex-row items-center gap-sm">
          <Cloud color="#6C47FF" size={18} />
          <Pill tone={statusPill.tone} dot label={statusPill.label} />
          <Text className="text-caption text-fg-secondary">
            {t("inspections:pending.queuedAt", { date: dateFmt.format(createdAt) })}
          </Text>
        </View>

        {entry.lastError ? (
          <Card>
            <Text className="text-caption uppercase tracking-wide text-fg-secondary">
              {t("inspections:pending.lastError")}
            </Text>
            <Text className="text-body text-danger-text mt-xs" numberOfLines={4}>
              {entry.lastError}
            </Text>
            <Text className="text-caption text-fg-tertiary mt-xs">
              {t("inspections:pending.attempts", { count: entry.attempts })}
            </Text>
          </Card>
        ) : null}

        {previewUri ? (
          <View
            className="overflow-hidden"
            style={{ height: 200, borderRadius: 18, backgroundColor: "#DFF6EC" }}
          >
            <Image
              source={{ uri: previewUri }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
            />
          </View>
        ) : null}

        <Card>
          <Row label={t("inspections:detail.summary.variety")} value={variety?.name ?? "—"} />
          <Divider />
          <Row
            label={t("inspections:detail.summary.totalSeeds")}
            value={String(data.total_seeds)}
          />
          <Divider />
          <Row
            label={t("inspections:detail.summary.meanLength")}
            value={`${data.mean_length_mm.toFixed(2)} mm`}
          />
          <Divider />
          <Row
            label={t("inspections:detail.summary.meanWidth")}
            value={`${data.mean_width_mm.toFixed(2)} mm`}
          />
          <Divider />
          <Row
            label={t("inspections:detail.summary.meanArea")}
            value={`${data.mean_area_mm2.toFixed(2)} mm²`}
          />
        </Card>

        {data.notes ? (
          <Card>
            <Text className="text-caption uppercase tracking-wide text-fg-secondary">
              {t("inspections:detail.summary.notes")}
            </Text>
            <Text className="text-body text-fg-primary mt-xs">{data.notes}</Text>
          </Card>
        ) : null}

        <View className="gap-sm">
          <Button
            label={t("inspections:pending.retry")}
            renderLeadingIcon={() => <RefreshCw color="#FFFFFF" size={16} />}
            onPress={() => void onRetry()}
            disabled={entry.status === "syncing"}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common:actions.delete")}
            onPress={onCancel}
            className="flex-row items-center justify-center gap-xs py-sm"
          >
            <Trash2 color="#8A1F1B" size={16} />
            <Text className="text-body font-medium" style={{ color: "#8A1F1B" }}>
              {t("inspections:pending.cancel")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function pillForStatus(
  status: string,
  t: ReturnType<typeof useTranslation>["t"],
): { tone: "warning" | "danger" | "info"; label: string } {
  if (status === "failed") return { tone: "danger", label: t("inspections:pending.statusFailed") };
  if (status === "syncing") return { tone: "info", label: t("inspections:pending.statusSyncing") };
  return { tone: "warning", label: t("inspections:pending.statusPending") };
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-md py-sm">
      <Text className="text-body text-fg-secondary">{label}</Text>
      <Text className="text-title text-fg-primary" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  return <View className="h-[0.5px] bg-line-tertiary" />;
}
