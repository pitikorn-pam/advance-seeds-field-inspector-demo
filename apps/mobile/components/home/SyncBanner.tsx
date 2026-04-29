import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, RefreshCw } from "lucide-react-native";
import { queueCounts, useSyncQueueEntries } from "@/lib/sync/store";

interface Props {
  /** Most recent successful sync timestamp; null when no sync has run. */
  lastSyncIso?: string | null;
}

/**
 * Bottom-of-Home banner indicating sync status. Queue counts are local-first
 * so the banner still reflects pending captures before Supabase is reachable.
 */
export function SyncBanner({ lastSyncIso }: Props) {
  const { t } = useTranslation("home");
  const counts = queueCounts(useSyncQueueEntries());
  const lastSyncLabel = lastSyncIso ? formatRelativeShort(lastSyncIso) : t("now");
  const state = counts.failed > 0 ? "failed" : counts.pending > 0 ? "pending" : "synced";
  const Icon = state === "failed" ? AlertTriangle : state === "pending" ? RefreshCw : Check;

  return (
    <View
      className="flex-row items-center gap-md rounded-2xl px-lg py-md"
      style={{ backgroundColor: state === "failed" ? "#FBEAE8" : "#F4F4F1" }}
    >
      <Icon
        color={state === "failed" ? "#B42318" : state === "pending" ? "#854F0B" : "#27500A"}
        size={18}
      />
      <View className="flex-1">
        <Text className="text-title font-medium text-fg-primary" style={{ fontSize: 13 }}>
          {state === "failed"
            ? t("syncFailed", { count: counts.failed })
            : state === "pending"
              ? t("syncPending", { count: counts.pending })
              : t("allSynced")}
        </Text>
        <Text className="text-caption text-fg-secondary">
          {t("lastSync", { when: lastSyncLabel })}
        </Text>
      </View>
    </View>
  );
}

function formatRelativeShort(iso: string): string {
  const diffMin = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(diffMin) < 60) return `${Math.abs(diffMin)} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return `${Math.abs(diffHr)}h ago`;
  return new Date(iso).toLocaleDateString();
}
