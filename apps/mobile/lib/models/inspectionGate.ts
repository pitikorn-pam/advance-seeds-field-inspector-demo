import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { useTranslation } from "react-i18next";
import { useBackgroundModelInstall } from "./installProgressStore";
import {
  currentModelPlatform,
  quickVerifyArtifact,
  readActiveModel,
  readInstalledModels,
} from "./modelStore";
import type { InstalledModelRecord } from "./types";

type ModelReadinessStatus = "checking" | "ready" | "inactive" | "missing";

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
        if (active?.status === "active" && (await isUsableOnThisPlatform(active))) {
          if (!cancelled) setModelStatus("ready");
          return;
        }
        const installed = await readInstalledModels();
        const hasInactiveUsableModel = (
          await Promise.all(installed.map((record) => isUsableOnThisPlatform(record)))
        ).some(Boolean);
        if (hasInactiveUsableModel) {
          if (!cancelled) setModelStatus("inactive");
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
    } else if (modelStatus === "inactive") {
      Alert.alert(
        t("inspections:capture.modelInactiveTitle"),
        t("inspections:capture.modelInactiveBody"),
      );
    } else {
      Alert.alert(
        t("inspections:capture.modelRequiredTitle"),
        t("inspections:capture.modelRequiredBody"),
      );
    }
    return true;
  }, [blocked, install.displayName, installing, modelStatus, t]);

  return { blocked, installing, modelStatus, install, showBlockedMessage };
}

async function isUsableOnThisPlatform(record: InstalledModelRecord): Promise<boolean> {
  if (record.platform !== currentModelPlatform()) return false;
  if (!(await quickVerifyArtifact(record))) return false;
  if (record.platform !== "ios") return true;
  if (!record.compiledArtifactUri) return false;
  try {
    return (await FileSystem.getInfoAsync(record.compiledArtifactUri)).exists;
  } catch {
    return false;
  }
}
