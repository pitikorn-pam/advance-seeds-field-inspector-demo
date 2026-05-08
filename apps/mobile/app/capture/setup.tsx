import { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, View, Text, Pressable, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { ChevronLeft, MapPin } from "lucide-react-native";
import * as MediaLibrary from "expo-media-library";
import { Camera as VCCamera } from "react-native-vision-camera";
import { useVarieties } from "@/lib/queries";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { LoadingState } from "@/components/ui/States";
import { DropdownSearch } from "@/components/ui/DropdownSearch";
import type { DropdownItem } from "@/components/ui/DropdownSearch";
import { useCaptureSession } from "@/lib/capture/session";
import { readActiveModel } from "@/lib/models/modelStore";
import type { InstalledModelRecord } from "@/lib/models/types";
import { effectiveModelAliases } from "@/lib/analyzer/captureClasses";
import { useModelInstallInspectionGate } from "@/lib/models/inspectionGate";

const VARIETY_TINTS: Record<string, { bg: string; fg: string }> = {
  corn: { bg: "#FAEEDA", fg: "#854F0B" },
  rice: { bg: "#EAF3DE", fg: "#3B6D11" },
  legume: { bg: "#E1F5EE", fg: "#0F6E56" },
  mungbean: { bg: "#FAECE7", fg: "#993C1D" },
};

/**
 * /capture/setup — metadata step before opening the unified capture camera.
 *
 * Variety is mandatory and notes/location tagging are optional. Continue
 * requests camera/media permissions and routes directly to live capture;
 * the older Live/Precise mode picker and batch selection are intentionally
 * removed from the new inspection journey.
 *
 * Auto-tag location toggle records intent in capture session; actual
 * GPS capture is wired by the upcoming expo-location commit.
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

  useEffect(() => {
    if (session.calibrationId) {
      session.set({ calibrationId: null });
    }
  }, [session]);

  const varietyOptions = useMemo<DropdownItem[]>(() => {
    if (!varieties.data) return [];
    return varieties.data
      .filter((v) => v.is_active !== false)
      .map((v) => {
        const tint = VARIETY_TINTS[v.color_key ?? ""] ?? null;
        return {
          id: v.id,
          label: v.name,
          meta: v.scientific_name ?? null,
          leading: tint ? (
            <VarietyThumb letter={v.name.charAt(0)} tint={tint} />
          ) : (
            <VarietyThumb letter={v.name.charAt(0)} tint={{ bg: "#F4F4F1", fg: "#6B6B68" }} />
          ),
        };
      });
  }, [varieties.data]);

  const selectedVariety = useMemo(
    () => varieties.data?.find((v) => v.id === session.varietyId) ?? null,
    [varieties.data, session.varietyId],
  );

  if (varieties.isLoading) {
    return <LoadingState />;
  }

  const canContinue = !!session.varietyId && !modelInstallGate.blocked;
  const liveAliases = effectiveModelAliases(
    selectedVariety?.model_class_aliases,
    activeModelClassNames,
  );
  // Only enforce alias binding when the active model actually advertises a
  // class list. The bundled COCO YOLO does not, in which case detection
  // falls through to coco_class_id / name match — same as before this
  // editor change. Guarding here would otherwise lock operators out of
  // every inspection on the demo build with no editor chips to recover.
  const modelExposesClassNames = activeModelClassNames.length > 0;
  const needsBinding = !!selectedVariety && modelExposesClassNames && liveAliases.length === 0;

  const ensurePhotosPermission = async () => {
    const current = await MediaLibrary.getPermissionsAsync();
    if (current.granted || !current.canAskAgain) return;
    await MediaLibrary.requestPermissionsAsync();
  };

  const ensureCapturePermission = async () => {
    const camera = await VCCamera.getCameraPermissionStatus();
    if (camera === "not-determined") {
      await VCCamera.requestCameraPermission();
    }
    const microphone = await VCCamera.getMicrophonePermissionStatus();
    if (microphone === "not-determined") {
      await VCCamera.requestMicrophonePermission();
    }
  };

  const onContinue = async () => {
    if (modelInstallGate.showBlockedMessage()) return;
    if (!canContinue) return;
    if (needsBinding && selectedVariety) {
      const modelName = activeModel?.displayName ?? "";
      Alert.alert(
        t("inspections:capture.bindRequiredTitle"),
        t("inspections:capture.bindRequiredBody", {
          variety: selectedVariety.name,
          model: modelName,
        }),
        [
          { text: t("common:actions.cancel"), style: "cancel" },
          {
            text: t("inspections:capture.bindRequiredAction"),
            onPress: () => router.push(`/more/capture-classes/${selectedVariety.id}` as never),
          },
        ],
      );
      return;
    }
    await ensurePhotosPermission();
    await ensureCapturePermission();
    session.set({ mode: "live", batchId: null });
    router.push("/capture/scan" as never);
  };

  const onBack = () => router.replace("/");

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("common:actions.newInspection")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#1A1A1A" size={20} />,
          onPress: onBack,
        }}
      />
      <ScrollView contentContainerClassName="px-xl py-md gap-lg">
        {modelInstallGate.blocked ? (
          <Card className="gap-xs border border-warning-text/30 bg-warning-bg">
            <Text className="text-title text-fg-primary font-medium">
              {modelInstallGate.installing
                ? t("inspections:capture.modelInstallBlockedTitle")
                : t("inspections:capture.modelRequiredTitle")}
            </Text>
            <Text className="text-body text-fg-secondary">
              {modelInstallGate.installing
                ? t("inspections:capture.modelInstallBlockedBody", {
                    name: modelInstallGate.install.displayName ?? t("more:models.defaultPill"),
                  })
                : t("inspections:capture.modelRequiredBody")}
            </Text>
          </Card>
        ) : null}
        <Text className="text-body text-fg-secondary px-xs">
          {t("inspections:capture.setupSubtitle")}
        </Text>

        {/* Variety — mandatory dropdown with search. */}
        <View className="gap-xs">
          <Text className="text-caption uppercase text-fg-secondary px-xs">
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
          {needsBinding ? (
            <Text className="text-caption text-warning-text px-xs mt-xs">
              {t("inspections:capture.bindRequiredHint")}
            </Text>
          ) : null}
        </View>

        {/* Notes textarea. */}
        <View className="gap-xs">
          <Text className="text-caption uppercase text-fg-secondary px-xs">
            {t("inspections:capture.notesLabel")}{" "}
            <Text className="text-caption text-fg-tertiary">
              · {t("inspections:capture.notesOptional")}
            </Text>
          </Text>
          <TextInput
            placeholder={t("inspections:capture.notesPlaceholder")}
            placeholderTextColor="#9D9D9A"
            value={session.notes}
            onChangeText={(notes) => session.set({ notes })}
            multiline
            textAlignVertical="top"
            className="rounded-xl bg-bg-primary border border-line-tertiary px-md py-md text-body text-fg-primary"
            style={{ minHeight: 96 }}
          />
        </View>

        {/* Auto-tag location toggle — actual GPS capture wired in upcoming
            expo-location commit; today we record intent only. */}
        <Card className="flex-row items-center gap-md">
          <View
            className="items-center justify-center bg-brand-soft"
            style={{ width: 32, height: 32, borderRadius: 10 }}
          >
            <MapPin color="#0F6E56" size={16} />
          </View>
          <View className="flex-1">
            <Text className="text-title text-fg-primary font-medium">
              {t("inspections:capture.autoTagTitle")}
            </Text>
            <Text className="text-caption text-fg-secondary">
              {t("inspections:capture.autoTagSubtitle")}
            </Text>
          </View>
          <Toggle
            value={session.locationTagEnabled}
            onChange={(v) => session.set({ locationTagEnabled: v })}
          />
        </Card>
      </ScrollView>

      <View className="px-xl pb-xl pt-sm">
        <Button label={t("common:actions.continue")} disabled={!canContinue} onPress={onContinue} />
      </View>
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
      style={{
        width: 50,
        height: 30,
        borderRadius: 15,
        padding: 3,
        backgroundColor: value ? "#0F6E56" : "rgba(0,0,0,0.16)",
      }}
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
