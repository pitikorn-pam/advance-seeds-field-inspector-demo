import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react-native";

interface Props {
  /** Most recent successful sync timestamp; null when no sync has run. */
  lastSyncIso?: string | null;
}

/**
 * Bottom-of-Home banner indicating sync status. Always green ("Up to date")
 * for now since we don't have an offline-first queue yet — the prototype
 * shows the same and treats this as confirmation rather than action.
 *
 * Once Phase X-offline-sync lands, this gets pending / failed states with
 * tap-to-retry behaviour. For v0.2 it's purely informational.
 */
export function SyncBanner({ lastSyncIso }: Props) {
  const { t } = useTranslation("home");
  const lastSyncLabel = lastSyncIso ? formatRelativeShort(lastSyncIso) : t("now");

  return (
    <View
      className="flex-row items-center gap-md rounded-2xl px-lg py-md"
      style={{ backgroundColor: "#F4F4F1" }}
    >
      <Check color="#27500A" size={18} />
      <View className="flex-1">
        <Text className="text-title font-medium text-fg-primary" style={{ fontSize: 13 }}>
          {t("allSynced")}
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
