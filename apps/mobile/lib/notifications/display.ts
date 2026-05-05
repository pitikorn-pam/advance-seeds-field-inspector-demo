import type { Notification } from "@advance-seeds/types";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface NotificationCopy {
  title: string;
  body: string | null;
}

const MODEL_UPDATE_TITLE_KEYS = new Set(["update.notifyTitle", "models.update.notifyTitle"]);
const MODEL_UPDATE_BODY_KEYS = new Set(["update.notifyBody", "models.update.notifyBody"]);
const MODEL_UPDATE_BODY_WITH_SIZE_KEYS = new Set([
  "update.notifyBodyWithSize",
  "models.update.notifyBodyWithSize",
]);

export function displayNotificationCopy(
  notification: Notification,
  t: Translate,
): NotificationCopy {
  const metadata = notification.metadata ?? {};
  const semver = typeof metadata.semver === "string" ? metadata.semver : undefined;
  const size = typeof metadata.size_mb === "string" ? metadata.size_mb : undefined;

  return {
    title: MODEL_UPDATE_TITLE_KEYS.has(notification.title)
      ? t("more:models.update.notifyTitle", { semver })
      : notification.title,
    body: displayNotificationBody(notification.body, t, size),
  };
}

function displayNotificationBody(body: string | null, t: Translate, size: string | undefined) {
  if (!body) return null;
  if (MODEL_UPDATE_BODY_KEYS.has(body)) {
    return t("more:models.update.notifyBody");
  }
  if (MODEL_UPDATE_BODY_WITH_SIZE_KEYS.has(body)) {
    return size
      ? t("more:models.update.notifyBodyWithSize", { size })
      : t("more:models.update.notifyBody");
  }
  return body;
}
