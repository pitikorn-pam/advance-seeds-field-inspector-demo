import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useModelUpdate } from "@/lib/models/updateStore";
import { useNotify } from "@/lib/notifications";

const LAST_NOTIFIED_KEY = "as.mobile.models.lastNotifiedVersionId";

/**
 * Fires an in-app notification (bell badge + entry in notifications list)
 * the first time we see a new model version available. Uses AsyncStorage
 * so the same `version_id` doesn't notify again across app launches —
 * only the *change* matters, not the presence.
 *
 * Mounted near the home banner so it lives inside the auth-guarded tree
 * (the notify hook needs the current user's profile).
 */
export function ModelUpdateNotifier() {
  const update = useModelUpdate();
  const notify = useNotify();
  const { t } = useTranslation("more");
  const lastNotifiedRef = useRef<string | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    void AsyncStorage.getItem(LAST_NOTIFIED_KEY).then((value) => {
      lastNotifiedRef.current = value;
      hydratedRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (!update || !hydratedRef.current) return;
    if (lastNotifiedRef.current === update.version_id) return;
    lastNotifiedRef.current = update.version_id;
    void AsyncStorage.setItem(LAST_NOTIFIED_KEY, update.version_id);
    const sizeMb =
      typeof update.size_bytes === "number" && update.size_bytes > 0
        ? (update.size_bytes / 1_000_000).toFixed(1)
        : null;
    notify({
      kind: "info",
      title: t("models.update.notifyTitle", { semver: update.semver }),
      body: sizeMb
        ? t("models.update.notifyBodyWithSize", { size: sizeMb })
        : t("models.update.notifyBody"),
      route: "/more/models",
      metadata: { version_id: update.version_id, semver: update.semver, size_mb: sizeMb },
    });
  }, [update, notify, t]);

  return null;
}
