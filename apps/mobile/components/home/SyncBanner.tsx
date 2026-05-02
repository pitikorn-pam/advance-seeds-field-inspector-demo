import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, RefreshCw } from "lucide-react-native";
import { queueCounts, useSyncQueueEntries } from "@/lib/sync/store";
import { useLastSyncedAt } from "@/lib/sync/lastSync";
import { useTheme } from "@/lib/theme";

/**
 * Bottom-of-Home banner indicating sync status. Queue counts are local-first
 * so the banner still reflects pending captures before Supabase is reachable.
 *
 * The "last sync" label reads the persisted `recordLastSyncedAt` timestamp
 * the replay worker writes whenever a queued inspection / recording lands
 * server-side — not the most-recent inspection's `created_at`, which would
 * lie after a successful retry of a long-pending capture.
 */
export function SyncBanner() {
  const { t } = useTranslation("home");
  const { resolved } = useTheme();
  const counts = queueCounts(useSyncQueueEntries());
  const lastSyncIso = useLastSyncedAt();
  const lastSyncLabel = formatLastSync(lastSyncIso, t);
  const state = counts.failed > 0 ? "failed" : counts.pending > 0 ? "pending" : "synced";
  const Icon = state === "failed" ? AlertTriangle : state === "pending" ? RefreshCw : Check;
  const colors =
    resolved === "dark"
      ? {
          bg: state === "failed" ? "#501313" : state === "pending" ? "#412402" : "#173404",
          icon: state === "failed" ? "#F7C1C1" : state === "pending" ? "#FAC775" : "#C0DD97",
          title: "#F5F5F4",
          caption: "#A1A1A0",
        }
      : {
          bg: state === "failed" ? "#FBEAE8" : "#F4F4F1",
          icon: state === "failed" ? "#B42318" : state === "pending" ? "#854F0B" : "#27500A",
          title: "#1A1A1A",
          caption: "#6B6B68",
        };

  return (
    <View
      className="flex-row items-center gap-md rounded-2xl px-lg py-md"
      style={{ backgroundColor: colors.bg }}
    >
      <Icon color={colors.icon} size={18} />
      <View className="flex-1">
        <Text className="text-title font-medium" style={{ color: colors.title, fontSize: 13 }}>
          {state === "failed"
            ? t("syncFailed", { count: counts.failed })
            : state === "pending"
              ? t("syncPending", { count: counts.pending })
              : t("allSynced")}
        </Text>
        <Text className="text-caption" style={{ color: colors.caption }}>
          {lastSyncIso === null ? t("neverSynced") : t("lastSync", { when: lastSyncLabel })}
        </Text>
      </View>
    </View>
  );
}

function formatLastSync(iso: string | null, t: ReturnType<typeof useTranslation>["t"]): string {
  if (!iso) return "";
  const elapsedMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(elapsedMs / 60_000);
  if (minutes < 1) return t("now");
  if (minutes < 60) return t("minutesAgo", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("hoursAgo", { count: hours });
  return new Date(iso).toLocaleDateString();
}
