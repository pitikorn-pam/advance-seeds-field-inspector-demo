import { useTranslation } from "react-i18next";
import { Pill, type PillTone } from "./Pill";

export type SyncState = "synced" | "pending" | "syncing" | "failed" | "offline";

// Sync state → existing Pill tone. Prototype's design uses dedicated dot
// colors per state; we lean on Pill's dot rendering and pick the tone that
// matches the badge's surface color so the dot reads against the same tint.
const STATE_TO_TONE: Record<SyncState, PillTone> = {
  synced: "success",
  pending: "warning",
  syncing: "info",
  failed: "danger",
  offline: "neutral",
};

const LABEL_KEYS: Record<SyncState, string> = {
  synced: "common:sync.synced",
  pending: "common:sync.pending",
  syncing: "common:sync.syncing",
  failed: "common:sync.failed",
  offline: "common:sync.offline",
};

export function SyncPill({
  state,
  count,
  className = "",
}: {
  state: SyncState;
  /** Shown after the state label for pending / failed (e.g. "Pending · 3"). */
  count?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const base = t(LABEL_KEYS[state]);
  const showCount =
    (state === "pending" || state === "failed") && typeof count === "number" && count > 0;
  return (
    <Pill
      tone={STATE_TO_TONE[state]}
      dot
      label={showCount ? `${base} · ${count}` : base}
      className={className}
    />
  );
}
