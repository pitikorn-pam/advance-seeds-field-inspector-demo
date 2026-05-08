import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { useBackgroundModelInstall } from "./installProgressStore";
import { currentModelPlatform, quickVerifyArtifact, readActiveModel } from "./modelStore";

type ModelReadinessStatus = "checking" | "ready" | "missing";

export interface ModelInstallInspectionGate {
  blocked: boolean;
  installing: boolean;
  modelStatus: ModelReadinessStatus;
  install: ReturnType<typeof useBackgroundModelInstall>;
  showBlockedMessage: () => boolean;
}

export function useModelInstallInspectionGate(): ModelInstallInspectionGate {
  const install = useBackgroundModelInstall();
  const { t } = useTranslation(["inspections", "more"]);
  const installing = install.status === "installing";
  const [modelStatus, setModelStatus] = useState<ModelReadinessStatus>("checking");

  useEffect(() => {
    let cancelled = false;
    if (installing) {
      setModelStatus("checking");
      return () => {
        cancelled = true;
      };
    }
    readActiveModel()
      .then(async (active) => {
        if (cancelled) return;
        if (
          active?.status === "active" &&
          active.platform === currentModelPlatform() &&
          (await quickVerifyArtifact(active))
        ) {
          if (!cancelled) setModelStatus("ready");
          return;
        }
        if (!cancelled) setModelStatus("missing");
      })
      .catch(() => {
        if (!cancelled) setModelStatus("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [install.runId, install.status, installing]);

  const blocked = installing || modelStatus !== "ready";
  const showBlockedMessage = useCallback(() => {
    if (!blocked) return false;
    if (installing) {
      Alert.alert(
        t("inspections:capture.modelInstallBlockedTitle"),
        t("inspections:capture.modelInstallBlockedBody", {
          name: install.displayName ?? t("more:models.defaultPill"),
        }),
      );
    } else {
      Alert.alert(
        t("inspections:capture.modelRequiredTitle"),
        t("inspections:capture.modelRequiredBody"),
      );
    }
    return true;
  }, [blocked, install.displayName, installing, t]);

  return { blocked, installing, modelStatus, install, showBlockedMessage };
}
