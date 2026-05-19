import { AppTopBar } from "@/components/ui/AppTopBar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { KV } from "@/components/ui/KV";
import { Pill } from "@/components/ui/Pill";
import { resetSharedTfliteModel } from "@/lib/analyzer/TfliteSeedAnalyzer";
import {
  activateInstalledModel,
  deleteInstalledModel,
  readActiveModel,
  readInstalledModels,
} from "@/lib/models/modelStore";
import { installCandidate } from "@/lib/models/modelRegistry";
import { listDeployedModelCandidates } from "@/lib/models/registryService";
import type {
  InstalledModelRecord,
  ModelCandidate,
  ModelMetadata,
  ModelPlatform,
  ModelQuantization,
} from "@/lib/models/types";
import { cleanDisplayName } from "../models";
import { formatPrimitive, truncateMiddle } from "@/lib/strings";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Cpu, Download, Inbox } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Unified view-model so the body renders identically whether the source
// is an InstalledModelRecord (installed/active/rollback) or a registry
// ModelCandidate (available, not yet installed). Origin governs the
// bottom action: Delete (installed) vs Install (candidate).
type DetailSource =
  | { kind: "installed"; record: InstalledModelRecord }
  | { kind: "candidate"; candidate: ModelCandidate };

interface DetailView {
  id: string;
  displayName: string;
  platform: ModelPlatform;
  quantization: ModelQuantization;
  installedAt: string | null;
  artifactSha256: string | null;
  artifactSizeBytes: number;
  metadata: ModelMetadata;
  channel?: "staging" | "production";
  isDefault: boolean;
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

export default function ModelDetailScreen() {
  const { t } = useTranslation(["common", "more"]);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [source, setSource] = useState<DetailSource | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [installedCount, setInstalledCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [rows, activeRow] = await Promise.all([readInstalledModels(), readActiveModel()]);
    setInstalledCount(rows.length);
    const installedMatch = rows.find((r) => r.id === id) ?? null;
    if (installedMatch) {
      setSource({ kind: "installed", record: installedMatch });
      setIsActive(activeRow?.id === installedMatch.id);
      setLoading(false);
      return;
    }
    // Not installed — try registry candidates from both channels. The
    // record id encodes the channel (`production-…` / `staging-…`),
    // so we can shortcut the lookup when the prefix matches; otherwise
    // we fan out to both lists.
    const channelHint = recoverChannel(id ?? "");
    const channels = channelHint ? [channelHint] : (["production", "staging"] as const);
    let candidate: ModelCandidate | null = null;
    for (const ch of channels) {
      try {
        const list = await listDeployedModelCandidates({ channel: ch });
        const hit = list.find((c) => c.id === id);
        if (hit) {
          candidate = hit;
          break;
        }
      } catch {
        // Fall through to next channel; if both fail we show NotFound.
      }
    }
    if (candidate) {
      setSource({ kind: "candidate", candidate });
      setIsActive(false);
    } else {
      setSource(null);
      setIsActive(false);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onDelete = useCallback(() => {
    if (source?.kind !== "installed") return;
    const record = source.record;
    Alert.alert(
      t("more:models.deleteConfirmTitle", { name: record.displayName }),
      t("more:models.deleteConfirmBody"),
      [
        { text: t("common:actions.cancel"), style: "cancel" },
        {
          text: t("common:actions.delete"),
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await deleteInstalledModel(record.id);
              resetSharedTfliteModel();
              router.back();
            } catch (err) {
              Alert.alert(
                t("more:models.installFailedTitle"),
                err instanceof Error ? err.message : String(err),
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
      { cancelable: true },
    );
  }, [source, router, t]);

  const onInstall = useCallback(async () => {
    if (source?.kind !== "candidate") return;
    setBusy(true);
    try {
      const record = await installCandidate(source.candidate);
      await activateInstalledModel(record);
      resetSharedTfliteModel();
      await load();
    } catch (err) {
      Alert.alert(
        t("more:models.installFailedTitle"),
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setBusy(false);
    }
  }, [source, load, t]);

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/more/models");
  };

  const view = source ? toDetailView(source) : null;

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("more:models.title")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#171717" size={20} />,
          onPress: back,
        }}
      />
      <Text className="px-xl text-caption text-fg-secondary -mt-xs">
        {t("more:models.subtitleInstalled", { count: installedCount })}
      </Text>

      {loading ? null : view && source ? (
        <Body
          view={view}
          sourceKind={source.kind}
          isActive={isActive}
          onDelete={onDelete}
          onInstall={onInstall}
          busy={busy}
        />
      ) : (
        <NotFound onBack={back} />
      )}
    </SafeAreaView>
  );
}

function toDetailView(source: DetailSource): DetailView {
  if (source.kind === "installed") {
    const r = source.record;
    const reg = (r.metadata.registry as { is_default?: boolean } | undefined) ?? undefined;
    return {
      id: r.id,
      displayName: r.displayName,
      platform: r.platform,
      quantization: r.quantization,
      installedAt: r.installedAt,
      artifactSha256: r.artifactSha256,
      artifactSizeBytes: r.artifactSizeBytes,
      metadata: r.metadata,
      channel: recoverChannel(r.id),
      isDefault: !!reg?.is_default,
    };
  }
  const c = source.candidate;
  const artifact = c.platform === "ios" ? c.manifest.artifacts.coreml : c.manifest.artifacts.tflite;
  return {
    id: c.id,
    displayName: c.displayName,
    platform: c.platform,
    quantization: c.quantization,
    installedAt: null,
    artifactSha256: artifact?.sha256 ?? null,
    artifactSizeBytes: artifact?.size_bytes ?? 0,
    metadata: c.metadata as ModelMetadata,
    channel: c.channel,
    isDefault: !!c.isDefault,
  };
}

function NotFound({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation(["common", "more"]);
  return (
    <View className="flex-1 items-center justify-center px-xl gap-md">
      <Inbox color="rgba(0,0,0,0.35)" size={32} />
      <Text className="text-body text-fg-secondary text-center">
        {t("more:models.detailNotFound")}
      </Text>
      <Button variant="secondary" size="sm" label={t("common:actions.back")} onPress={onBack} />
    </View>
  );
}

function Body({
  view,
  sourceKind,
  isActive,
  onDelete,
  onInstall,
  busy,
}: {
  view: DetailView;
  sourceKind: "installed" | "candidate";
  isActive: boolean;
  onDelete: () => void;
  onInstall: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation(["common", "more"]);
  const metadata = view.metadata;
  const frameworkLabel = view.platform === "android" ? "TFLite" : "Core ML";
  const subtitleDate = (() => {
    if (!view.installedAt) return null;
    try {
      return DATE_FORMAT.format(new Date(view.installedAt));
    } catch {
      return view.installedAt;
    }
  })();

  const channel = view.channel;
  const reg = (metadata.registry as { version_id?: string } | undefined) ?? undefined;
  const isDefault = view.isDefault;

  // KPI strip values — match the list-screen StatStrip semantics so the
  // numbers stay consistent between the row and the detail hero.
  const accValue = pickAccuracy(metadata);
  const mapValue = pickHeadlineMap(metadata.metrics);
  const sizeMb =
    view.artifactSizeBytes > 0 ? (view.artifactSizeBytes / 1_000_000).toFixed(1) : null;

  const precision = pickNumber(metadata.metrics, [
    "metrics/precision(M)",
    "metrics/precision(B)",
    "precision",
  ]);
  const recall = pickNumber(metadata.metrics, ["metrics/recall(M)", "metrics/recall(B)", "recall"]);

  const classNames = Array.isArray(metadata.class_names) ? metadata.class_names : [];
  const classCount = classNames.length;
  const classesValue =
    classCount === 0
      ? "—"
      : classCount > 4
        ? `${classCount} (${classNames.slice(0, 4).join(", ")}…)`
        : `${classCount} (${classNames.join(", ")})`;

  const outputShape = Array.isArray(metadata.output_shape) ? metadata.output_shape.join("×") : "—";

  const calibrationValue = metadata.calibration?.required
    ? `${metadata.calibration.default_marker_mm ?? "?"} mm · ${
        metadata.calibration.supported_sources?.join(", ") ?? ""
      }`
    : t("more:models.field.calibrationNotRequired");

  const hyperparams = (metadata.hyperparameters as Record<string, unknown> | undefined) ?? {};
  const hp = (key: string) => formatPrimitive(hyperparams[key]);

  const versionIdRaw = reg?.version_id ?? null;
  const versionIdValue = versionIdRaw ? truncateMiddle(versionIdRaw, 8, 4) : "—";
  const sha = view.artifactSha256;
  const shaValue = sha ? truncateMiddle(sha, 8, 6) : "—";
  const channelValue = channel ?? "—";

  const heroRail = isActive
    ? { borderLeftWidth: 2, borderLeftColor: "#1F6E3A" as const }
    : undefined;

  return (
    <ScrollView contentContainerClassName="px-xl py-md gap-lg">
      {/* Hero */}
      <Card className="gap-md" style={heroRail}>
        <View className="flex-row items-center gap-md">
          <View className="h-10 w-10 items-center justify-center rounded-lg bg-card-lavender">
            <Cpu color="#6E40E0" size={20} />
          </View>
          <View className="flex-1">
            <Text className="text-title font-medium text-fg-primary" numberOfLines={1}>
              {cleanDisplayName(view.displayName)}
            </Text>
            <Text className="text-caption text-fg-secondary mt-xs">
              {frameworkLabel} · {view.quantization}
              {subtitleDate ? ` · Installed ${subtitleDate}` : ""}
            </Text>
          </View>
          {isActive ? <Pill tone="success" dot label={t("more:models.activePill")} /> : null}
        </View>
        {channel || isDefault ? (
          <View className="flex-row items-center gap-xs flex-wrap">
            {channel ? (
              <Pill
                tone={channel === "production" ? "success" : "warning"}
                label={t(`more:models.${channel}`)}
              />
            ) : null}
            {isDefault ? <Pill tone="brand" label={t("more:models.defaultPill")} /> : null}
          </View>
        ) : null}
      </Card>

      {/* KPI strip */}
      <View className="flex-row gap-sm">
        <KpiTile
          label={t("more:models.kpi.acc")}
          value={accValue !== null ? `${accValue.toFixed(1)}%` : "—"}
        />
        <KpiTile
          label={t("more:models.kpi.map")}
          value={mapValue !== null ? mapValue.toFixed(2) : "—"}
        />
        <KpiTile label={t("more:models.kpi.size")} value={sizeMb ? `${sizeMb} MB` : "—"} />
      </View>

      {/* Performance */}
      <View className="gap-sm">
        <SectionLabel label={t("more:models.section.performance")} />
        <Card>
          <View className="flex-row gap-sm">
            <StatBox
              label={t("more:models.kpi.precision")}
              value={precision !== null ? precision.toFixed(3) : "—"}
            />
            <StatBox
              label={t("more:models.kpi.recall")}
              value={recall !== null ? recall.toFixed(3) : "—"}
            />
          </View>
        </Card>
      </View>

      {/* Model */}
      <View className="gap-sm">
        <SectionLabel label={t("more:models.section.model")} />
        <Card>
          <KV label={t("more:models.field.task")} value={metadata.task ?? "—"} />
          <KV
            label={t("more:models.field.inputSize")}
            value={`${metadata.input_size}×${metadata.input_size}`}
            mono
          />
          <KV label={t("more:models.field.classes")} value={classesValue} />
          <KV label={t("more:models.field.outputShape")} value={outputShape} mono />
          <KV label={t("more:models.field.calibration")} value={calibrationValue} isLast />
        </Card>
      </View>

      {/* Training */}
      <View className="gap-sm">
        <SectionLabel label={t("more:models.section.training")} />
        <Card>
          <KV label={t("more:models.field.lr0")} value={hp("lr0")} mono />
          <KV label={t("more:models.field.batch")} value={hp("batch")} mono />
          <KV label={t("more:models.field.imgsz")} value={hp("imgsz")} mono />
          <KV label={t("more:models.field.epochs")} value={hp("epochs")} mono />
          <KV label={t("more:models.field.patience")} value={hp("patience")} mono isLast />
        </Card>
      </View>

      {/* Artifact */}
      <View className="gap-sm">
        <SectionLabel label={t("more:models.section.artifact")} />
        <Card>
          <KV label={t("more:models.field.versionId")} value={versionIdValue} mono />
          <KV label={t("more:models.field.sha256")} value={shaValue} mono />
          <KV label={t("more:models.field.channel")} value={channelValue} isLast />
        </Card>
      </View>

      {/* Actions — Delete for installed records, Install for available candidates. */}
      {sourceKind === "installed" ? (
        <Button
          variant="ghostDanger"
          size="sm"
          className="w-full"
          label={t("more:models.action.delete")}
          disabled={busy}
          onPress={onDelete}
        />
      ) : (
        <Button
          size="sm"
          className="w-full"
          label={busy ? t("common:states.loading") : t("more:models.download")}
          renderLeadingIcon={() => <Download color="#FFFFFF" size={16} />}
          disabled={busy}
          onPress={onInstall}
        />
      )}
    </ScrollView>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <Text className="px-xs text-caption uppercase tracking-[0.04em] text-fg-secondary">
      {label}
    </Text>
  );
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-lg border border-line-tertiary bg-bg-primary px-md py-md items-center">
      <Text className="text-[10px] uppercase tracking-[0.6px] font-semibold text-fg-tertiary">
        {label}
      </Text>
      <Text
        className="mt-xs font-semibold text-fg-primary"
        style={{ fontSize: 22, letterSpacing: -0.2, fontVariant: ["tabular-nums"] }}
      >
        {value}
      </Text>
    </View>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-md bg-bg-secondary px-md py-sm">
      <Text className="text-[10px] uppercase tracking-[0.6px] font-semibold text-fg-tertiary">
        {label}
      </Text>
      <Text
        className="mt-[2px] font-semibold text-fg-primary"
        style={{ fontSize: 18, letterSpacing: -0.2, fontVariant: ["tabular-nums"] }}
      >
        {value}
      </Text>
    </View>
  );
}

// Duplicated from the list screen so the detail file stays standalone.
// Installed-record IDs follow `${channel}-${version_id}-${platform}`.
function recoverChannel(recordId: string): "staging" | "production" | undefined {
  if (recordId.startsWith("staging-")) return "staging";
  if (recordId.startsWith("production-")) return "production";
  return undefined;
}

function pickNumber(source: unknown, keys: string[]): number | null {
  if (!source || typeof source !== "object") return null;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function pickHeadlineMap(metrics: unknown): number | null {
  return (
    pickNumber(metrics, [
      "metrics/mAP50(M)",
      "metrics/mAP50(B)",
      "mAP50",
      "map50",
      "metrics/mAP_0.5",
    ]) ?? null
  );
}

function pickAccuracy(metadata: InstalledModelRecord["metadata"]): number | null {
  const precision = pickNumber(metadata.metrics, [
    "metrics/precision(M)",
    "metrics/precision(B)",
    "precision",
  ]);
  if (precision !== null) return precision * 100;
  const map = pickHeadlineMap(metadata.metrics);
  return map !== null ? map * 100 : null;
}
