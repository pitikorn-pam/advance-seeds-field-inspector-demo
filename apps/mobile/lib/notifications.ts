import type { NotificationKind } from "@advance-seeds/types";

/**
 * Notification dispatch — wraps the createNotification mutation in a
 * fire-and-forget API screens can call from any flow without awaiting.
 *
 * Usage at a call site:
 *
 *   const notify = useNotify();
 *   notify({
 *     kind: "success",
 *     title: t("notifications.captureSaved.title"),
 *     body: t("notifications.captureSaved.body", { count: 47 }),
 *     route: `/inspections/${id}`,
 *   });
 *
 * Failures fall to the React Query cache rollback (see useCreateNotification's
 * onError); the user sees the notification appear locally even if the
 * server insert fails — the next round of background sync will retry.
 *
 * Why a hook + closure instead of a plain function? We need the current
 * profile.id (which lives on AuthContext) and the mutation handle (from
 * React Query). The closure pattern keeps callers from passing those
 * around at every call site.
 */

import { useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { useCreateNotification } from "@/lib/queries";

interface NotifyInput {
  kind: NotificationKind;
  title: string;
  body?: string | null;
  route?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function useNotify() {
  const { profile } = useAuth();
  const create = useCreateNotification();

  return useCallback(
    (input: NotifyInput) => {
      if (!profile) return;
      create.mutate({
        user_id: profile.id,
        ...input,
      });
    },
    [profile, create],
  );
}
