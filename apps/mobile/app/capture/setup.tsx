import { useEffect, useMemo, useState } from "react";
import { Linking, ScrollView, View, Text, Pressable, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { X, MapPin, ArrowRight } from "lucide-react-native";
import * as MediaLibrary from "expo-media-library";
import { Camera as VCCamera } from "react-native-vision-camera";
import { useVarieties } from "@/lib/queries";
import { Button } from "@/components/ui/Button";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { LoadingState } from "@/components/ui/States";
import { DropdownSearch } from "@/components/ui/DropdownSearch";
import type { DropdownItem } from "@/components/ui/DropdownSearch";
import { PreflightGateSheet, type PreflightCheck } from "@/components/capture/PreflightGateSheet";
import { useCaptureSession } from "@/lib/capture/session";
import { readActiveModel } from "@/lib/models/modelStore";
import type { InstalledModelRecord } from "@/lib/models/types";
import { effectiveModelAliases } from "@/lib/analyzer/captureClasses";
import { useModelInstallInspectionGate } from "@/lib/models/inspectionGate";

const NEUTRAL_VARIETY_THUMB = { bg: "#EFEEEA", fg: "#5F5F5B" };

type CameraPermissionState = "unknown" | "granted" | "blocked";

/**
 * /capture/setup — metadata step before opening the unified capture camera.
 *
 * Variety is mandatory; notes/location tagging are optional. Continue runs
 * a pre-flight pass over the four checks the redesign cares about (active
 * model, class-alias binding, camera/microphone permission, model install
 * progress) and surfaces blockers in a bottom-sheet gate rather than as
 * inline banners or Alert dialogs. When everything's green, Continue
 * proceeds straight into live capture.
 */
export default function CaptureSetup() {
  const { t } = useTranslation(["common", "inspections", "more"]);
  const router = useRouter();
  const session = useCaptureSession();
  const modelInstallGate = useModelInstallInspectionGate();

  const varieties = useVarieties();

  const [activeModel, setActiveModel] = useState<InstalledModelRecord | null>(null);
  useEffect(() => {
    let cancelled = false;
    void readActiveModel().then((rec) => {
      if (!cancelled) setActiveModel(rec);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const activeModelClassNames = useMemo<readonly string[]>(() => {
    const names = activeModel?.metadata?.class_names;
    return Array.isArray(names) ? names : [];
  }, [activeModel]);

  // Track camera permission so the gate can surface "denied" without a
  // second tap. `unknown` keeps it out of the checks (user hasn't been
  // prompted yet — we still ask on Continue).
  const [cameraPerm, setCameraPerm] = useState<CameraPermissionState>(() => {
    const s = VCCamera.getCameraPermissionStatus();
    if (s === "granted") return "granted";
    if (s === "denied" || s === "restricted") return "blocked";
    return "unknown";
  });

  useEffect(() => {
    if (session.calibrationId) {
      session.set({ calibrationId: null });
    }
  }, [session]);

  const varietyOptions = useMemo<DropdownItem[]>(() => {
    if (!varieties.data) return [];
    return varieties.data
      .filter((v) => v.is_active !== false)
      .map((v) => ({
        id: v.id,
        label: v.name,
        meta: v.scientific_name ?? null,
        leading: <VarietyThumb letter={v.name.charAt(0)} tint={NEUTRAL_VARIETY_THUMB} />,
      }));
  }, [varieties.data]);

  const selectedVariety = useMemo(
    () => varieties.data?.find((v) => v.id === session.varietyId) ?? null,
    [varieties.data, session.varietyId],
  );

  const liveAliases = useMemo(
    () => effectiveModelAliases(selectedVariety?.model_class_aliases, activeModelClassNames),
    [selectedVariety, activeModelClassNames],
  );
  const modelExposesClassNames = activeModelClassNames.length > 0;
  const needsBinding = !!selectedVariety && modelExposesClassNames && liveAliases.length === 0;

  // Build the gate inputs from real device state. A check is "blocking"
  // when it would prevent capture from starting; the gate sheet renders
  // those rows prominently and collapses the passed labels underneath.
  const { checks, passedLabels } = useMemo(() => {
    const blocking: PreflightCheck[] = [];
    const passed: string[] = [];
    const modelName = activeModel?.displayName ?? t("more:models.defaultPill", "model");

    // Model readiness
    if (modelInstallGate.installing) {
      const prog = modelInstallGate.install.progress;
      const downloaded = prog?.downloadedBytes ?? 0;
      const total = prog?.totalBytes ?? 0;
      const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
      blocking.push({
        id: "model-installing",
        state: "busy",
        label: t("inspections:capture.preflight.checks.modelLabel"),
        description: t("inspections:capture.preflight.checks.modelInstallingDesc", {
          name: modelInstallGate.install.displayName ?? modelName,
          percent,
        }),
        progress: percent,
      });
    } else if (modelInstallGate.modelStatus === "missing") {
      blocking.push({
        id: "model-missing",
        state: "fail",
        label: t("inspections:capture.preflight.checks.modelLabel"),
        description: t("inspections:capture.preflight.checks.modelMissingDesc"),
        fixLabel: t("inspections:capture.preflight.actions.openModels"),
        onFix: () => {
          setGateOpen(false);
          router.push("/more/models" as never);
        },
      });
    } else if (modelInstallGate.modelStatus === "inactive") {
      blocking.push({
        id: "model-inactive",
        state: "warn",
        label: t("inspections:capture.preflight.checks.modelLabel"),
        description: t("inspections:capture.preflight.checks.modelInactiveDesc"),
        fixLabel: t("inspections:capture.preflight.actions.openModels"),
        onFix: () => {
          setGateOpen(false);
          router.push("/more/models" as never);
        },
      });
    } else if (modelInstallGate.modelStatus === "ready") {
      passed.push(t("inspections:capture.preflight.checks.passedModel", { name: modelName }));
    }

    // Class-alias binding (only checkable once a variety is picked AND the
    // model advertises a class list)
    if (needsBinding && selectedVariety) {
      blocking.push({
        id: "binding-missing",
        state: "fail",
        label: t("inspections:capture.preflight.checks.bindingLabel"),
        description: t("inspections:capture.preflight.checks.bindingMissingDesc", {
          variety: selectedVariety.name,
        }),
        fixLabel: t("inspections:capture.preflight.actions.openVarietyEditor"),
        onFix: () => {
          setGateOpen(false);
          router.push(`/more/capture-classes/${selectedVariety.id}` as never);
        },
      });
    } else if (selectedVariety && modelExposesClassNames) {
      passed.push(t("inspections:capture.preflight.checks.passedBinding"));
    }

    // Camera permission
    if (cameraPerm === "blocked") {
      blocking.push({
        id: "camera-denied",
        state: "fail",
        label: t("inspections:capture.preflight.checks.cameraLabel"),
        description: t("inspections:capture.preflight.checks.cameraDeniedDesc"),
        fixLabel: t("inspections:capture.preflight.actions.openSettings"),
        onFix: () => {
          setGateOpen(false);
          void Linking.openSettings();
        },
      });
    } else if (cameraPerm === "granted") {
      passed.push(t("inspections:capture.preflight.checks.passedCamera"));
    }

    return { checks: blocking, passedLabels: passed };
  }, [
    activeModel,
    modelInstallGate.installing,
    modelInstallGate.modelStatus,
    modelInstallGate.install,
    needsBinding,
    selectedVariety,
    modelExposesClassNames,
    cameraPerm,
    router,
    t,
  ]);

  const [gateOpen, setGateOpen] = useState(false);

  const gateTitle = useMemo(() => {
    if (checks.some((c) => c.state === "busy")) {
      return t("inspections:capture.preflight.installingTitle");
    }
    if (checks.length > 1) {
      return t("inspections:capture.preflight.multiTitle", { count: checks.length });
    }
    return t("inspections:capture.preflight.singleTitle");
  }, [checks, t]);

  const gateSubtitle = useMemo(
    () =>
      checks.some((c) => c.state === "busy")
        ? t("inspections:capture.preflight.installingSubtitle")
        : t("inspections:capture.preflight.subtitle"),
    [checks, t],
  );

  const gateBusy = checks.length > 0 && checks.every((c) => c.state === "busy");

  if (varieties.isLoading) {
    return <LoadingState />;
  }

  const canTapContinue = !!session.varietyId;

  const ensurePhotosPermission = async () => {
    const current = await MediaLibrary.getPermissionsAsync();
    if (current.granted || !current.canAskAgain) return;
    await MediaLibrary.requestPermissionsAsync();
  };

  const ensureCapturePermission = async () => {
    const camera = VCCamera.getCameraPermissionStatus();
    if (camera === "not-determined") {
      const next = await VCCamera.requestCameraPermission();
      setCameraPerm(next === "granted" ? "granted" : "blocked");
      if (next !== "granted") return false;
    } else if (camera !== "granted") {
      setCameraPerm("blocked");
      return false;
    }
    const microphone = VCCamera.getMicrophonePermissionStatus();
    if (microphone === "not-determined") {
      await VCCamera.requestMicrophonePermission();
    }
    return true;
  };

  const onContinue = async () => {
    if (!canTapContinue) return;
    // Permission may still be "unknown" if the user has never been prompted;
    // ask now so the camera check reflects reality before we open the gate.
    const cameraOk = await ensureCapturePermission();
    if (!cameraOk || checks.length > 0) {
      setGateOpen(true);
      return;
    }
    await ensurePhotosPermission();
    session.set({ mode: "live", batchId: null });
    router.push("/capture/scan" as never);
  };

  const onBack = () => router.replace("/");

  const onReset = () => {
    session.reset();
  };

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      {/* Prototype: top nav is X close + iOS notch + "Reset" text — no centered
          title. Match by passing an empty title slot. */}
      <AppTopBar
        title=""
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <X color="#171717" size={22} />,
          onPress: onBack,
        }}
        right={{
          accessibilityLabel: t("common:actions.reset", "Reset"),
          renderIcon: () => (
            <Text className="text-caption font-medium text-fg-secondary">
              {t("common:actions.reset", "Reset")}
            </Text>
          ),
          onPress: onReset,
        }}
      />
      <ScrollView
        contentContainerClassName="px-lg pt-sm pb-2xl gap-md"
        showsVerticalScrollIndicator={false}
      >
        {/* Variety — mandatory dropdown with search. */}
        <View className="gap-xs">
          <Text
            className="text-[11px] font-semibold uppercase text-fg-tertiary px-xs"
            style={{ letterSpacing: 0.6 }}
          >
            {t("inspections:capture.selectVariety")}
            <Text className="text-danger-text"> *</Text>
          </Text>
          <DropdownSearch
            value={session.varietyId}
            onChange={(id) => session.set({ varietyId: id })}
            options={varietyOptions}
            placeholder={t("inspections:capture.varietyPlaceholder")}
            invalid={!session.varietyId}
          />
        </View>

        {/* Notes textarea. */}
        <View className="gap-xs pt-xs">
          <Text
            className="text-[11px] font-semibold uppercase text-fg-tertiary px-xs"
            style={{ letterSpacing: 0.6 }}
          >
            {t("inspections:capture.notesLabel")}{" "}
            <Text className="text-caption font-normal normal-case text-fg-tertiary tracking-normal">
              · {t("inspections:capture.notesOptional")}
            </Text>
          </Text>
          <TextInput
            placeholder={t("inspections:capture.notesPlaceholder")}
            placeholderTextColor="#A7A69E"
            value={session.notes}
            onChangeText={(notes) => session.set({ notes })}
            multiline
            textAlignVertical="top"
            className="rounded-lg bg-bg-primary border border-line-secondary px-md py-md text-body text-fg-primary"
            style={{ minHeight: 72 }}
          />
        </View>

        {/* Auto-tag location toggle — actual GPS capture wired in upcoming
            expo-location commit; today we record intent only. */}
        <View className="mt-xs flex-row items-center gap-md rounded-lg bg-bg-primary border border-line-tertiary p-md">
          <View
            className="items-center justify-center rounded-md bg-card-sky"
            style={{ width: 32, height: 32 }}
          >
            <MapPin color="#1C5A8E" size={18} />
          </View>
          <View className="flex-1">
            <Text className="text-body font-medium text-fg-primary">
              {t("inspections:capture.autoTagTitle")}
            </Text>
            <Text className="text-caption text-fg-secondary mt-[1px]">
              {t("inspections:capture.autoTagSubtitle")}
            </Text>
          </View>
          <Toggle
            value={session.locationTagEnabled}
            onChange={(v) => session.set({ locationTagEnabled: v })}
          />
        </View>
      </ScrollView>

      {/* Sticky CTA — pre-flight runs on tap */}
      <View className="px-lg pt-sm pb-xl bg-bg-primary border-t border-line-tertiary">
        <Button disabled={!canTapContinue} onPress={onContinue}>
          <Text className="text-title font-medium text-primary-on">
            {t("common:actions.continue")}
          </Text>
          <ArrowRight color="#FFFFFF" size={16} />
        </Button>
      </View>

      <PreflightGateSheet
        visible={gateOpen}
        title={gateTitle}
        description={gateSubtitle}
        checks={checks}
        passedLabels={passedLabels}
        primaryLabel={
          gateBusy
            ? t("inspections:capture.preflight.actions.waitAndContinue")
            : (checks[0]?.fixLabel ?? t("inspections:capture.preflight.actions.cancel"))
        }
        onPrimary={() => {
          if (gateBusy) {
            // Busy means a model install is in-flight; close the sheet and
            // let the user wait. Continue will re-evaluate next tap.
            setGateOpen(false);
            return;
          }
          checks[0]?.onFix?.();
        }}
        secondaryLabel={t("inspections:capture.preflight.actions.cancel")}
        onSecondary={() => setGateOpen(false)}
        busy={gateBusy}
        onRequestClose={() => setGateOpen(false)}
      />
    </SafeAreaView>
  );
}

function VarietyThumb({ letter, tint }: { letter: string; tint: { bg: string; fg: string } }) {
  return (
    <View
      className="items-center justify-center"
      style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: tint.bg }}
    >
      <Text className="font-medium" style={{ color: tint.fg, fontSize: 13 }}>
        {letter}
      </Text>
    </View>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      className={`h-[30px] w-[50px] rounded-full p-[3px] ${value ? "bg-primary" : "bg-line-secondary"}`}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: "white",
          transform: [{ translateX: value ? 20 : 0 }],
        }}
      />
    </Pressable>
  );
}
