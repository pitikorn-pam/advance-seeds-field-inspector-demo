import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNotify } from "@/lib/notifications";
import { useBackgroundModelInstall } from "@/lib/models/installProgressStore";

export function ModelInstallNotifier() {
  const install = useBackgroundModelInstall();
  const notify = useNotify();
  const { t } = useTranslation("more");
  const notifiedRunRef = useRef<string | null>(null);
  const completedRunRef = useRef<string | null>(null);
  const failedRunRef = useRef<string | null>(null);

  useEffect(() => {
    if (!install.runId) return;
    if (install.status === "installing" && notifiedRunRef.current !== install.runId) {
      notifiedRunRef.current = install.runId;
      notify({
        kind: "info",
        title: t("models.backgroundInstall.notifyStartedTitle"),
        body: t("models.backgroundInstall.notifyStartedBody", {
          name: install.displayName ?? t("models.defaultPill"),
        }),
        route: "/more/models",
        metadata: {
          model_install_run_id: install.runId,
          candidate_id: install.candidateId,
          version_id: install.versionId,
          phase: install.progress?.phase ?? "preparing",
        },
      });
    }
    if (install.status === "completed" && completedRunRef.current !== install.runId) {
      completedRunRef.current = install.runId;
      notify({
        kind: "success",
        title: t("models.backgroundInstall.notifyCompletedTitle"),
        body: t("models.backgroundInstall.notifyCompletedBody", {
          name: install.displayName ?? t("models.defaultPill"),
        }),
        route: "/more/models",
        metadata: {
          model_install_run_id: install.runId,
          candidate_id: install.candidateId,
          version_id: install.versionId,
        },
      });
    }
    if (install.status === "failed" && failedRunRef.current !== install.runId) {
      failedRunRef.current = install.runId;
      notify({
        kind: "error",
        title: t("models.backgroundInstall.notifyFailedTitle"),
        body: install.error ?? t("models.backgroundInstall.notifyFailedBody"),
        route: "/more/models",
        metadata: {
          model_install_run_id: install.runId,
          candidate_id: install.candidateId,
          version_id: install.versionId,
        },
      });
    }
  }, [install, notify, t]);

  return null;
}
