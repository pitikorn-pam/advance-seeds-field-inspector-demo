import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, View, Text, Alert, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import {
  Calendar,
  Check,
  ChevronLeft,
  Play,
  RefreshCw,
  Share2,
  Trash2,
  X,
} from "lucide-react-native";
import type { Recording } from "@advance-seeds/types";
import { useRecordings, useDeleteRecording, useDeleteRecordings } from "@/lib/queries";
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
import { shareVideo } from "@/lib/capture/imageActions";
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
  const deleteRecordings = useDeleteRecordings();
  const queueEntries = useSyncQueueEntries();
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [durationFilter, setDurationFilter] = useState<DurationFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectionMode, setSelectionMode] = useState(false);

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
  const selectedCount = selectedIds.size;
  const selectedRecordings = useMemo(() => {
    const byId = new Map((recordings.data ?? []).map((rec) => [rec.id, rec]));
    return [...selectedIds].flatMap((id) => {
      const rec = byId.get(id);
      return rec ? [rec] : [];
    });
  }, [recordings.data, selectedIds]);
  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, []);
  const selectAll = useCallback(
    () => setSelectedIds(new Set(filtered.map((rec) => rec.id))),
    [filtered],
  );
  const onDeleteSelected = useCallback(() => {
    const rows = selectedRecordings;
    if (rows.length === 0) return;
    Alert.alert(
      t("common:actions.delete"),
      `Delete ${rows.length} selected recording${rows.length === 1 ? "" : "s"}?`,
      [
        { text: t("common:actions.cancel"), style: "cancel" },
        {
          text: t("common:actions.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              const result = await deleteRecordings.mutateAsync(rows);
              clearSelection();
              if (result.deleted < result.requested) {
                Alert.alert(
                  t("common:states.error"),
                  `Deleted ${result.deleted} of ${result.requested}. Some records could not be deleted.`,
                );
              }
            } catch (err) {
              const reason = err instanceof Error ? err.message : String(err);
              Alert.alert(t("common:states.error"), reason);
            }
          },
        },
      ],
    );
  }, [clearSelection, deleteRecordings, selectedRecordings, t]);

  // Stable row renderer — keeps FlatList's recycler from re-rendering rows
  // when unrelated parent state (filters, date picker) changes.
  const renderRecordingRow = useCallback(
    ({ item: rec }: { item: Recording }) => (
      <RecordingRow
        recording={rec}
        selectionMode={selectionMode}
        selected={selectedIds.has(rec.id)}
        onToggleSelected={() => toggleSelected(rec.id)}
        onEnterSelection={() => {
          setSelectionMode(true);
          toggleSelected(rec.id);
        }}
        onShare={async () => {
          try {
            await shareVideo(rec.video_url, t("profile:recordings.share"));
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
          delete: t("common:actions.delete"),
        }}
      />
    ),
    [selectionMode, selectedIds, t, deleteRecording, toggleSelected],
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
        contentContainerClassName="px-xl py-md gap-md pb-[132px]"
        keyboardShouldPersistTaps="handled"
        // Virtualization tuning: each row is tall (4:3 video preview) so a
        // small initial batch + modest window keeps offscreen memory bounded
        // and mounts more rows as the user scrolls.
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={7}
        removeClippedSubviews
        extraData={`${selectionMode}:${[...selectedIds].sort().join("|")}`}
        renderItem={renderRecordingRow}
        ListHeaderComponent={
          <View className="gap-lg pb-md">
            <View className="flex-row items-center gap-sm">
              <View className="flex-1">
                <Segmented
                  value={durationFilter}
                  onChange={setDurationFilter}
                  options={durationOptions}
                  variant="tag"
                  scrollable
                />
              </View>
              {!selectionMode ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Select to delete"
                  onPress={() => setSelectionMode(true)}
                  disabled={filtered.length === 0}
                  className={`h-8 justify-center rounded-md border px-sm ${
                    filtered.length === 0
                      ? "border-line-tertiary bg-bg-tertiary opacity-60"
                      : "border-danger-text bg-danger-bg active:opacity-80"
                  }`}
                >
                  <Text className="text-caption font-medium text-danger-text">
                    Select to delete
                  </Text>
                </Pressable>
              ) : null}
            </View>

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
              <View className="gap-sm">
                <Text className="text-[11px] font-semibold uppercase tracking-[0.6px] text-fg-tertiary px-xs">
                  {t("profile:recordings.pendingSection")}
                </Text>
                <View className="gap-sm">
                  {pendingRecordings.map((row) => (
                    <PendingRecordingRow
                      key={row.entry.id}
                      row={row}
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
                </View>
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
      {selectionMode ? (
        <View
          pointerEvents="box-none"
          className="absolute left-0 right-0 bottom-xl items-center px-xl"
        >
          <View className="flex-row items-center gap-sm rounded-full border border-line-tertiary bg-bg-primary px-sm py-sm shadow-sm">
            <Button variant="tinted" size="sm" label="Clear" onPress={clearSelection} />
            <Button
              variant="tinted"
              size="sm"
              label={selectedIds.size === filtered.length ? "All selected" : "Select all"}
              onPress={selectAll}
              disabled={filtered.length === 0}
            />
            <Button
              variant="danger"
              size="sm"
              label={`Delete ${selectedCount}`}
              renderLeadingIcon={() => <Trash2 color="#8A1F1B" size={14} />}
              onPress={onDeleteSelected}
              disabled={deleteRecordings.isPending || selectedCount === 0}
            />
          </View>
        </View>
      ) : null}
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
  onRetry,
  onDiscard,
  labels,
}: {
  row: PendingRecording;
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
    <Card className="p-md flex-row gap-md overflow-hidden">
      <Thumbnail uri={previewUri} duration={formatDuration(data.duration_ms)} />
      <View className="flex-1 gap-xs">
        <View className="flex-row items-center gap-sm flex-wrap">
          <Text className="text-title font-semibold text-fg-primary" numberOfLines={1}>
            {formatDuration(data.duration_ms)}
          </Text>
          <Pill tone={tone} label={label} />
        </View>
        <Text className="text-caption text-fg-secondary">{captionDate}</Text>
        {entry.lastError ? (
          <Text className="text-caption text-danger-text" numberOfLines={2}>
            {entry.lastError}
          </Text>
        ) : null}
        <View className="flex-row gap-md mt-auto pt-xs items-center">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={labels.retry}
            onPress={() => void onRetry()}
            disabled={entry.status === "syncing"}
            className="flex-row items-center gap-xs"
          >
            <RefreshCw color="#6E40E0" size={14} />
            <Text className="text-caption font-medium text-brand-deep">{labels.retry}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={labels.discard}
            onPress={() => void onDiscard()}
            className="ml-auto p-xs"
          >
            <Trash2 color="#8A1F1B" size={16} />
          </Pressable>
        </View>
      </View>
    </Card>
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
  selectionMode,
  selected,
  onToggleSelected,
  onEnterSelection,
  onShare,
  onDelete,
  labels,
}: {
  recording: Recording;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  onEnterSelection: () => void;
  onShare: () => void;
  onDelete: () => void;
  labels: { share: string; delete: string };
}) {
  const captured = new Date(recording.captured_at);
  const captionDate = captured.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={selectionMode ? onToggleSelected : undefined}
      onLongPress={onEnterSelection}
    >
      <Card
        className={`p-md flex-row gap-md overflow-hidden border ${
          selected ? "border-primary bg-primary-soft" : "border-line-tertiary bg-bg-primary"
        }`}
      >
        {selectionMode ? (
          <View className="h-[88px] justify-center">
            <SelectionMark selected={selected} />
          </View>
        ) : null}
        <Thumbnail
          uri={recording.video_url}
          duration={formatDuration(recording.duration_ms)}
          disabled={selectionMode}
        />
        <View className="flex-1 gap-xs">
          <Text className="text-title font-semibold text-fg-primary" numberOfLines={1}>
            {formatDuration(recording.duration_ms)}
          </Text>
          <Text className="text-caption text-fg-secondary">{captionDate}</Text>
          <View className="flex-row gap-md mt-auto pt-xs items-center justify-end">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={labels.share}
              onPress={onShare}
              disabled={selectionMode}
              className="flex-row items-center gap-xs p-xs"
            >
              <Share2 color="#171717" size={14} />
              <Text className="text-caption font-medium text-fg-primary">{labels.share}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={labels.delete}
              onPress={onDelete}
              disabled={selectionMode}
              className="flex-row items-center gap-xs rounded-md bg-danger-bg px-sm py-xs"
            >
              <Trash2 color="#8A1F1B" size={14} />
              <Text className="text-caption font-medium" style={{ color: "#8A1F1B" }}>
                {labels.delete}
              </Text>
            </Pressable>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

function SelectionMark({ selected }: { selected: boolean }) {
  return (
    <View
      className={`h-7 w-7 items-center justify-center rounded-md border ${
        selected ? "border-primary bg-primary" : "border-line-secondary bg-bg-secondary"
      }`}
    >
      {selected ? <Check color="#FFFFFF" size={17} strokeWidth={2.5} /> : null}
    </View>
  );
}

function Thumbnail({
  uri,
  duration,
  disabled = false,
}: {
  uri: string;
  duration: string;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  return (
    <View className="h-[88px] w-[88px] overflow-hidden rounded-md bg-black">
      {uri ? (
        <CaptureMediaPreview
          uri={uri}
          kind="video"
          openOnPress={!disabled}
          deferVideoPreview
          onVideoLoadingChange={setLoading}
        />
      ) : null}
      <View className="absolute inset-0 items-center justify-center">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-black/60 border border-white/25">
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Play color="#FFFFFF" size={14} fill="#FFFFFF" />
          )}
        </View>
        {!disabled ? (
          <Text className="mt-xs text-[10px] font-medium text-white/85">
            {loading ? "Loading" : "Tap to load"}
          </Text>
        ) : null}
      </View>
      <View className="absolute bottom-xs right-xs rounded-sm bg-black/70 px-xs">
        <Text className="text-[10px] font-semibold text-white">{duration}</Text>
      </View>
    </View>
  );
}
