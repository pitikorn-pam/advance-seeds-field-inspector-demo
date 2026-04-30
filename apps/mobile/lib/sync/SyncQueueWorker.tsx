import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";
import { replaySyncQueue } from "./replay";
import { ensureQueueLoaded, useSyncQueueEntries } from "./store";

export function SyncQueueWorker() {
  const queryClient = useQueryClient();
  const entries = useSyncQueueEntries();
  // Track previous online state so we only fire on the OFFLINE → ONLINE
  // transition, not on every NetInfo emission while online.
  const wasReachableRef = useRef<boolean | null>(null);

  useEffect(() => {
    void ensureQueueLoaded().then(() => replaySyncQueue());
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") void replaySyncQueue();
    });
    const netInfoSub = NetInfo.addEventListener((state) => {
      const reachable = state.isConnected === true && state.isInternetReachable !== false;
      if (wasReachableRef.current === false && reachable) {
        // Network just came back — kick the queue immediately instead of
        // waiting for the next AppState change.
        void replaySyncQueue();
      }
      wasReachableRef.current = reachable;
    });
    return () => {
      appStateSub.remove();
      netInfoSub();
    };
  }, []);

  useEffect(() => {
    if (entries.some((entry) => entry.status === "synced")) {
      void queryClient.invalidateQueries({ queryKey: ["inspections"] });
      void queryClient.invalidateQueries({ queryKey: ["recordings"] });
    }
  }, [entries, queryClient]);

  return null;
}
