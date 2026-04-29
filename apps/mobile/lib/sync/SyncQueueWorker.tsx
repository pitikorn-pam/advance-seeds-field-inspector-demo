import { useEffect } from "react";
import { AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { replaySyncQueue } from "./replay";
import { ensureQueueLoaded, useSyncQueueEntries } from "./store";

export function SyncQueueWorker() {
  const queryClient = useQueryClient();
  const entries = useSyncQueueEntries();

  useEffect(() => {
    void ensureQueueLoaded().then(() => replaySyncQueue());
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void replaySyncQueue();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (entries.some((entry) => entry.status === "synced")) {
      void queryClient.invalidateQueries({ queryKey: ["inspections"] });
      void queryClient.invalidateQueries({ queryKey: ["recordings"] });
    }
  }, [entries, queryClient]);

  return null;
}
