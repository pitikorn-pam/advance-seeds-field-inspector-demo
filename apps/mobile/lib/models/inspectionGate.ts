import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { useFocusEffect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useBackgroundModelInstall } from "./installProgressStore";
import {
  currentModelPlatform,
  quickVerifyArtifact,
  readActiveModel,
  readInstalledModels,
} from "./modelStore";
import { useModelUpdate } from "./updateStore";
import type { InstalledModelRecord } from "./types";

type ModelReadinessStatus = "checking" | "ready" | "inactive" | "missing";

export interface ModelInstallInspectionGate {
  blocked: boolean;
  installing: boolean;
  modelStatus: ModelReadinessStatus;
  install: ReturnType<typeof useBackgroundModelInstall>;
  /**
   * Shows the blocked-state alert. When the model is missing or
   * inactive, the alert now offers an "Install model" action that
   * deep-links to the Models screen with `?install=<version_id>` so the
   * existing auto-install flow takes over — same code path as tapping
   * Install on the home update banner.
   */
  showBlockedMessage: () => boolean;
  /**
   * Imperative form of the install action used by the alert button. Exposed
   * so screens that want a non-alert UI (an inline banner with a
   * "Resolve" CTA, for instance) can drive the same navigation.
   */
  goToInstall: () => void;
}

export function useModelInstallInspectionGate(): ModelInstallInspectionGate {
  const install = useBackgroundModelInstall();
  const { t } = useTranslation(["inspections", "more"]);
  const router = useRouter();
  const update = useModelUpdate();
  const installing = install.status === "installing";
  const [modelStatus, setModelStatus] = useState<ModelReadinessStatus>("checking");
  // Bump this to force a re-check. useFocusEffect bumps it on focus so
  // returning from the Models screen with a freshly-installed model
  // promotes status to "ready" without requiring a hard remount.
  const [recheckTick, setRecheckTick] = useState(0);

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
  }, [install.runId, install.status, installing, recheckTick]);

  // Re-check whenever the gate's host screen regains focus. Without this,
  // the gate's status caches from a prior mount when the user navigates
  // away to install a model and returns — leaving "model required"
  // showing even though the model is now active.
  useFocusEffect(
    useCallback(() => {
      setRecheckTick((n) => n + 1);
    }, []),
  );

  const goToInstall = useCallback(() => {
    if (update?.version_id) {
      router.push({
        pathname: "/more/models",
        params: { install: update.version_id },
      });
    } else {
      // No registry update is currently published (e.g., user came
      // online late, or the resolve probe hasn't completed). Drop the
      // user on the Models screen where they can pick + install
      // explicitly.
      router.push("/more/models");
    }
  }, [router, update]);

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
        [
          { text: t("inspections:capture.cancel"), style: "cancel" },
          { text: t("inspections:capture.openModels"), onPress: goToInstall },
        ],
      );
    } else {
      Alert.alert(
        t("inspections:capture.modelRequiredTitle"),
        t("inspections:capture.modelRequiredBody"),
        [
          { text: t("inspections:capture.cancel"), style: "cancel" },
          { text: t("inspections:capture.installModel"), onPress: goToInstall },
        ],
      );
    }
    return true;
  }, [blocked, install.displayName, installing, modelStatus, t, goToInstall]);

  return { blocked, installing, modelStatus, install, showBlockedMessage, goToInstall };
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
