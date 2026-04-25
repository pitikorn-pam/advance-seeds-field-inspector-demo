import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pill } from "../ui/pill";

/**
 * Tracks online/offline state via the Network Information API. The "pending"
 * count is reserved for future offline-write queues; for the demo we only
 * flip between "All synced" (online) and "Offline".
 */
export function SyncPill() {
  const { t } = useTranslation();
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  if (!online) {
    return (
      <Pill tone="danger" dot>
        {t("sync.offline")}
      </Pill>
    );
  }
  return (
    <Pill tone="success" dot>
      {t("sync.allSynced")}
    </Pill>
  );
}
