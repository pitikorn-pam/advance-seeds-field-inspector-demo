import { useMemo } from "react";
import {
  clearFailedQueueEntries,
  queueCounts,
  removeQueueEntry,
  retryAllFailedQueueEntries,
  updateQueueEntry,
  useSyncQueueEntries,
} from "./store";
import { replaySyncQueue } from "./replay";

export function useSyncQueue() {
  const entries = useSyncQueueEntries();
  const counts = useMemo(() => queueCounts(entries), [entries]);

  return {
    entries,
    counts,
    retryAll: async () => {
      await retryAllFailedQueueEntries();
      await replaySyncQueue();
    },
    clearFailed: clearFailedQueueEntries,
    cancel: async (id: string) => {
      await updateQueueEntry(id, { status: "cancelled" });
      await removeQueueEntry(id);
    },
  };
}
