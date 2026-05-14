import { useCallback, useMemo, useState } from "react";
import { FlatList, View, Text, Alert, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Calendar, ChevronLeft, Download, RefreshCw, Share2, Trash2, X } from "lucide-react-native";
import type { Recording } from "@advance-seeds/types";
import { useRecordings, useDeleteRecording } from "@/lib/queries";
import {
  removeQueueEntry,
  retryAllFailedQueueEntries,
  useSyncQueueEntries,
} from "@/lib/sync/store";
import { replaySyncQueue } from "@/lib/sync/replay";
import { deleteLocalMediaForPayload } from "@/lib/sync/localMedia";
import type { RecordingQueuePayload, SyncQueueEntry } from "@/lib/sync/types";
import { Pill } from "@/components/ui/Pill";
import { CaptureMediaPreview } from "@/components/capture/CaptureMediaPreview";
import { shareVideo, saveImageToLibrary } from "@/lib/capture/imageActions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { Segmented } from "@/components/ui/Segmented";
import {
  DateRangePicker,
  type DateRange,
  rangeLabel,
  toDateKey,
} from "@/components/ui/DateRangePicker";
type DurationFilter = "all" | "short" | "long";

/**
 * Recordings list — moved out of /profile in the prototype-fidelity-pass.
 * Reachable from /more → Recordings; the profile screen drops the
 * recordings list to stay a pure profile + sign-out surface.
 */
export default function RecordingsScreen() {
  const { t, i18n } = useTranslation(["common", "profile", "history"]);
  const router = useRouter();
  const recordings = useRecordings();
  const deleteRecording = useDeleteRecording();
  const queueEntries = useSyncQueueEntries();
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [durationFilter, setDurationFilter] = useState<DurationFilter>("all");

  // Surface offline-saved recordings: any sync-queue row whose payload is a
  // recording, still in pending/syncing/failed state. They're not in the
  // server response yet, so without this the user wouldn't see what they
  // just captured offline.
  const pendingRecordings = useMemo<PendingRecording[]>(() => {
    return queueEntries
      .filter(
        (
          e,
        ): e is SyncQueueEntry & { payload: { kind: "recording"; data: RecordingQueuePayload } } =>
          e.payload.kind === "recording" &&
          (e.status === "pending" || e.status === "syncing" || e.status === "failed"),
      )
      .filter((e) => {
        if (durationFilter === "short" && e.payload.data.duration_ms >= 10_000) return false;
        if (durationFilter === "long" && e.payload.data.duration_ms < 10_000) return false;
        if (dateRange.start) {
          const key = toDateKey(new Date(e.createdAt));
          const end = dateRange.end ?? dateRange.start;
          if (key < dateRange.start || key > end) return false;
        }
        return true;
      })
      .map((entry) => ({ entry, data: entry.payload.data }));
  }, [queueEntries, durationFilter, dateRange]);

  const filtered = useMemo(() => {
    const rows = recordings.data ?? [];
    return rows.filter((rec) => {
      if (dateRange.start) {
        const key = toDateKey(new Date(rec.captured_at));
        const end = dateRange.end ?? dateRange.start;
        if (key < dateRange.start || key > end) return false;
      }
      if (durationFilter === "short" && rec.duration_ms >= 10_000) return false;
      if (durationFilter === "long" && rec.duration_ms < 10_000) return false;
      return true;
    });
  }, [recordings.data, dateRange, durationFilter]);

  const hasDateRange = !!dateRange.start || !!dateRange.end;

  // Stable row renderer — keeps FlatList's recycler from re-rendering rows
  // when unrelated parent state (filters, date picker) changes.
  const renderRecordingRow = useCallback(
    ({ item: rec }: { item: Recording }) => (
      <RecordingRow
        recording={rec}
        onShare={async () => {
          try {
            await shareVideo(rec.video_url, t("profile:recordings.share"));
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            Alert.alert(t("common:states.error"), reason);
          }
        }}
        onSave={async () => {
          try {
            await saveImageToLibrary(rec.video_url, {
              title: t("profile:recordings.savedToPhotos"),
              permissionDeniedTitle: t("profile:recordings.permissionDeniedTitle"),
              permissionDeniedBody: t("profile:recordings.permissionDeniedBody"),
            });
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            Alert.alert(t("common:states.error"), reason);
          }
        }}
        onDelete={() =>
          Alert.alert(t("common:actions.delete"), t("profile:recordings.deleteConfirm"), [
            { text: t("common:actions.cancel"), style: "cancel" },
            {
              text: t("common:actions.delete"),
              style: "destructive",
              onPress: () => {
                deleteRecording.mutate(rec);
              },
            },
          ])
        }
        labels={{
          share: t("profile:recordings.share"),
          save: t("profile:recordings.save"),
          delete: t("common:actions.delete"),
        }}
      />
    ),
    [t, deleteRecording],
  );
  const durationOptions: Array<{ value: DurationFilter; label: string }> = [
    { value: "all", label: t("profile:recordings.filters.duration.all") },
    { value: "short", label: t("profile:recordings.filters.duration.short") },
    { value: "long", label: t("profile:recordings.filters.duration.long") },
  ];

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("profile:recordings.title")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#171717" size={20} />,
          onPress: () => router.back(),
        }}
      />
      {/*
        Use FlatList instead of ScrollView so the recordings list is
        virtualized. Each row mounts a video preview (`CaptureMediaPreview`),
        which is expensive — without virtualization, a long history would
        instantiate every player up-front. Filters, the date-range picker
        trigger, the loading / empty states, and the pending-sync section
        all live in `ListHeaderComponent` so they participate in the same
        scroll surface as the list itself.
      */}
      <FlatList
        data={filtered}
        keyExtractor={(rec) => rec.id}
        contentContainerClassName="px-xl py-md gap-md pb-2xl"
        keyboardShouldPersistTaps="handled"
        // Virtualization tuning: each row is tall (4:3 video preview) so a
        // small initial batch + modest window keeps offscreen memory bounded
        // and mounts more rows as the user scrolls.
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={7}
        removeClippedSubviews
        renderItem={renderRecordingRow}
        ListHeaderComponent={
          <View className="gap-lg pb-md">
            <Segmented
              value={durationFilter}
              onChange={setDurationFilter}
              options={durationOptions}
              variant="tag"
              scrollable
            />

            <View className="flex-row items-center gap-xs">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("profile:recordings.filters.selectDate")}
                className="flex-1 flex-row items-center gap-sm rounded-full border border-line-secondary bg-bg-primary px-md py-sm"
                onPress={() => setDatePickerOpen(true)}
              >
                <Calendar color="#6E40E0" size={16} />
                <View className="flex-1">
                  <Text className="text-caption text-fg-secondary">
                    {t("profile:recordings.filters.dateRange")}
                  </Text>
                  <Text className="text-title font-medium text-fg-primary" numberOfLines={1}>
                    {rangeLabel(dateRange, i18n.language, t)}
                  </Text>
                </View>
              </Pressable>
              {hasDateRange ? (
                <Button
                  size="icon"
                  variant="tinted"
                  accessibilityLabel={t("common:actions.clear")}
                  onPress={() => setDateRange({ start: null, end: null })}
                >
                  <X color="#171717" size={16} />
                </Button>
              ) : null}
            </View>

            {pendingRecordings.length > 0 ? (
              <View className="gap-xs">
                <Text className="text-caption uppercase tracking-wide text-fg-secondary px-xs">
                  {t("profile:recordings.pendingSection")}
                </Text>
                <Card className="p-0">
                  {pendingRecordings.map((row, i) => (
                    <PendingRecordingRow
                      key={row.entry.id}
                      row={row}
                      isLast={i === pendingRecordings.length - 1}
                      onRetry={async () => {
                        await retryAllFailedQueueEntries();
                        void replaySyncQueue();
                      }}
                      onDiscard={async () => {
                        Alert.alert(
                          t("profile:recordings.pendingDiscardTitle"),
                          t("profile:recordings.pendingDiscardBody"),
                          [
                            { text: t("common:actions.cancel"), style: "cancel" },
                            {
                              text: t("common:actions.delete"),
                              style: "destructive",
                              onPress: () => {
                                void deleteLocalMediaForPayload(row.entry.payload);
                                void removeQueueEntry(row.entry.id);
                              },
                            },
                          ],
                        );
                      }}
                      labels={{
                        pending: t("profile:recordings.statusPending"),
                        syncing: t("profile:recordings.statusSyncing"),
                        failed: t("profile:recordings.statusFailed"),
                        retry: t("profile:recordings.retry"),
                        discard: t("common:actions.delete"),
                      }}
                    />
                  ))}
                </Card>
              </View>
            ) : null}

            {recordings.isLoading ? (
              <Card>
                <Text className="text-body text-fg-secondary">{t("common:states.loading")}</Text>
              </Card>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          recordings.isLoading ? null : (!recordings.data || recordings.data.length === 0) &&
            pendingRecordings.length === 0 ? (
            <Card>
              <Text className="text-body text-fg-secondary">{t("profile:recordings.empty")}</Text>
            </Card>
          ) : pendingRecordings.length === 0 ? (
            <Card>
              <Text className="text-body text-fg-secondary">
                {t("profile:recordings.noResults")}
              </Text>
            </Card>
          ) : null
        }
      />
      <DateRangePicker
        visible={datePickerOpen}
        value={dateRange}
        locale={i18n.language}
        onClose={() => setDatePickerOpen(false)}
        onClear={() => setDateRange({ start: null, end: null })}
        onChange={setDateRange}
      />
    </SafeAreaView>
  );
}

interface PendingRecording {
  entry: SyncQueueEntry;
  data: RecordingQueuePayload;
}

function PendingRecordingRow({
  row,
  isLast,
  onRetry,
  onDiscard,
  labels,
}: {
  row: PendingRecording;
  isLast: boolean;
  onRetry: () => void | Promise<void>;
  onDiscard: () => void | Promise<void>;
  labels: {
    pending: string;
    syncing: string;
    failed: string;
    retry: string;
    discard: string;
  };
}) {
  const { entry, data } = row;
  const captionDate = new Date(entry.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  // Prefer the local file URI for preview — `remote_video_url` may exist if
  // upload-then-DB-insert failed mid-flight, but local plays back instantly.
  const previewUri = data.local_video_uri || data.remote_video_url || "";
  const tone =
    entry.status === "failed" ? "danger" : entry.status === "syncing" ? "info" : "warning";
  const label =
    entry.status === "failed"
      ? labels.failed
      : entry.status === "syncing"
        ? labels.syncing
        : labels.pending;
  return (
    <View className={`gap-md px-lg py-md ${isLast ? "" : "border-b border-line-tertiary"}`}>
      <View className="aspect-[4/3] overflow-hidden rounded-lg bg-black">
        {previewUri ? <CaptureMediaPreview uri={previewUri} kind="video" /> : null}
      </View>
      <View className="flex-row items-center gap-md">
        <View className="flex-1 gap-xs">
          <View className="flex-row items-center gap-sm">
            <Text className="text-title text-fg-primary font-medium">
              {formatDuration(data.duration_ms)}
            </Text>
            <Pill tone={tone} dot label={label} />
          </View>
          <Text className="text-caption text-fg-secondary">{captionDate}</Text>
          {entry.lastError ? (
            <Text className="text-caption text-danger-text" numberOfLines={2}>
              {entry.lastError}
            </Text>
          ) : null}
        </View>
        <Button
          size="icon"
          variant="tinted"
          accessibilityLabel={labels.retry}
          onPress={() => void onRetry()}
          disabled={entry.status === "syncing"}
        >
          <RefreshCw color="#171717" size={16} />
        </Button>
        <Button
          size="icon"
          variant="danger"
          accessibilityLabel={labels.discard}
          onPress={() => void onDiscard()}
        >
          <Trash2 color="#8A1F1B" size={16} />
        </Button>
      </View>
    </View>
  );
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function RecordingRow({
  recording,
  onShare,
  onSave,
  onDelete,
  labels,
}: {
  recording: Recording;
  onShare: () => void;
  onSave: () => void;
  onDelete: () => void;
  labels: { share: string; save: string; delete: string };
}) {
  const captured = new Date(recording.captured_at);
  const captionDate = captured.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <View className="gap-md p-md mb-md rounded-lg bg-bg-primary">
      <View className="aspect-[4/3] overflow-hidden rounded-lg bg-black">
        <CaptureMediaPreview uri={recording.video_url} kind="video" />
      </View>
      <View className="flex-row items-center gap-md">
        <View className="flex-1">
          <Text className="text-title text-fg-primary font-medium">
            {formatDuration(recording.duration_ms)}
          </Text>
          <Text className="text-caption text-fg-secondary">{captionDate}</Text>
        </View>
        <Button size="icon" variant="tinted" accessibilityLabel={labels.share} onPress={onShare}>
          <Share2 color="#171717" size={16} />
        </Button>
        <Button size="icon" variant="tinted" accessibilityLabel={labels.save} onPress={onSave}>
          <Download color="#171717" size={16} />
        </Button>
        <Button size="icon" variant="danger" accessibilityLabel={labels.delete} onPress={onDelete}>
          <Trash2 color="#8A1F1B" size={16} />
        </Button>
      </View>
    </View>
  );
}
