import { AppTopBar } from "@/components/ui/AppTopBar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Segmented } from "@/components/ui/Segmented";
import { Toggle } from "@/components/ui/Toggle";
import { useAutoInstallOnWifi } from "@/lib/models/autoInstall";
import { resetSharedTfliteModel } from "@/lib/analyzer/TfliteSeedAnalyzer";
import {
  cancelArtifactDownload,
  installCandidate,
  type InstallProgress,
} from "@/lib/models/modelRegistry";
import {
  activateInstalledModel,
  deleteInstalledModel,
  readActiveModel,
  readInstalledModels,
  readPreviousActiveModel,
} from "@/lib/models/modelStore";
import {
  listDeployedModelCandidates,
  resolveDefaultModel,
  type DeploymentChannel,
} from "@/lib/models/registryService";
import { publishResolveResult } from "@/lib/models/updateStore";
import {
  clearBackgroundModelInstall,
  useBackgroundModelInstall,
} from "@/lib/models/installProgressStore";
import type { InstalledModelRecord, ModelCandidate } from "@/lib/models/types";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Cpu,
  Download,
  Gauge,
  Inbox,
  Package,
  RefreshCw,
  Sliders,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type RowStatus = "active" | "installed" | "available" | "unsupported";

interface RegistryRow {
  candidate: ModelCandidate;
  installedRecord: InstalledModelRecord | null;
  isActive: boolean;
  isPreviousActive: boolean;
  status: RowStatus;
}

export default function ModelRegistryScreen() {
  const { t } = useTranslation(["common", "more", "settings"]);
  const [autoInstallOnWifi, setAutoInstallOnWifi] = useAutoInstallOnWifi();
  const router = useRouter();
  const params = useLocalSearchParams<{ install?: string }>();
  const requestedInstallVersionId = typeof params.install === "string" ? params.install : null;

  const [channel, setChannel] = useState<DeploymentChannel>("production");
  const [candidates, setCandidates] = useState<ModelCandidate[]>([]);
  const [installed, setInstalled] = useState<InstalledModelRecord[]>([]);
  const [active, setActive] = useState<InstalledModelRecord | null>(null);
  const [previous, setPrevious] = useState<InstalledModelRecord | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [progressById, setProgressById] = useState<Record<string, InstallProgress>>({});
  const autoInstallTriggeredRef = useRef(false);
  const backgroundInstall = useBackgroundModelInstall();

  const installedById = useMemo(() => new Map(installed.map((m) => [m.id, m])), [installed]);
  const backgroundCandidateId =
    backgroundInstall.status === "installing" ? backgroundInstall.candidateId : null;
  const effectiveBusy = backgroundCandidateId ? `install:${backgroundCandidateId}` : busy;
  const effectiveProgressById = useMemo(() => {
    if (
      backgroundInstall.status !== "installing" ||
      !backgroundInstall.candidateId ||
      !backgroundInstall.progress
    ) {
      return progressById;
    }
    return {
      ...progressById,
      [backgroundInstall.candidateId]: backgroundInstall.progress,
    };
  }, [backgroundInstall, progressById]);

  const reloadInstalled = useCallback(async () => {
    const [rows, activeRow, previousRow] = await Promise.all([
      readInstalledModels(),
      readActiveModel(),
      readPreviousActiveModel(),
    ]);
    setInstalled(rows);
    setActive(activeRow);
    setPrevious(previousRow);
  }, []);

  // One refresh = list candidates AND probe resolve-channel in parallel.
  // Publishing the resolve result keeps the Home banner in sync; listing
  // candidates is what populates this screen. Same intent, one button.
  const refresh = useCallback(
    async (nextChannel: DeploymentChannel) => {
      setBusy("refresh");
      setError(null);
      setStatusMessage(null);
      try {
        const activeRecord = await readActiveModel();
        const [list, resolveRes] = await Promise.all([
          listDeployedModelCandidates({ channel: nextChannel }),
          resolveDefaultModel({
            channel: nextChannel,
            currentVersion: activeRecord?.manifest?.display_name ?? "",
            currentCompat: activeRecord?.metadata?.model_version ?? "",
          }).catch(() => null),
        ]);
        setCandidates(list);
        if (resolveRes) publishResolveResult(resolveRes);
        return list;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return [];
      } finally {
        setBusy(null);
      }
    },
    [t],
  );

  const install = useCallback(
    async (candidate: ModelCandidate) => {
      setBusy(`install:${candidate.id}`);
      setError(null);
      setProgressById((p) => ({ ...p, [candidate.id]: { phase: "preparing" } }));
      try {
        const record = await installCandidate(candidate, (progress) => {
          setProgressById((p) => ({ ...p, [candidate.id]: progress }));
        });
        await activateInstalledModel(record);
        resetSharedTfliteModel();
        await reloadInstalled();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
        setProgressById((p) => {
          const next = { ...p };
          delete next[candidate.id];
          return next;
        });
      }
    },
    [reloadInstalled],
  );

  const activate = useCallback(
    async (record: InstalledModelRecord) => {
      setBusy(`activate:${record.id}`);
      setError(null);
      try {
        await activateInstalledModel(record);
        resetSharedTfliteModel();
        await reloadInstalled();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [reloadInstalled],
  );

  const remove = useCallback(
    (record: InstalledModelRecord) => {
      Alert.alert(
        t("more:models.deleteConfirmTitle", { name: record.displayName }),
        t("more:models.deleteConfirmBody"),
        [
          { text: t("common:actions.cancel"), style: "cancel" },
          {
            text: t("common:actions.delete"),
            style: "destructive",
            onPress: async () => {
              setBusy(`delete:${record.id}`);
              try {
                await deleteInstalledModel(record.id);
                await reloadInstalled();
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(null);
              }
            },
          },
        ],
        { cancelable: true },
      );
    },
    [reloadInstalled, t],
  );

  const cancelInstall = (id: string) => {
    setError(null);
    setBusy(null);
    cancelArtifactDownload(id);
    setProgressById((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
  };

  useEffect(() => {
    void reloadInstalled();
  }, [reloadInstalled]);

  useEffect(() => {
    if (backgroundInstall.status === "completed") {
      void reloadInstalled();
    }
  }, [backgroundInstall.status, backgroundInstall.runId, reloadInstalled]);

  // Auto-fetch on mount and on channel change.
  useEffect(() => {
    void refresh(channel);
  }, [channel, refresh]);

  // Deep link from the home banner: ?install=<version_id>. Switch to
  // production, refresh, then install the matching candidate. Guarded
  // by a ref so it fires once per mount.
  useEffect(() => {
    if (!requestedInstallVersionId || autoInstallTriggeredRef.current) return;
    autoInstallTriggeredRef.current = true;
    void (async () => {
      setChannel("production");
      const list = await refresh("production");
      const candidate = list.find((c) => {
        const reg = c.metadata?.registry as { version_id?: string } | undefined;
        return reg?.version_id === requestedInstallVersionId;
      });
      if (!candidate) {
        setError(t("more:models.candidateMissing"));
        return;
      }
      const installedRecord = (await readInstalledModels()).find((r) => r.id === candidate.id);
      if (installedRecord) {
        setStatusMessage(t("more:models.alreadyInstalled"));
        return;
      }
      await install(candidate);
    })();
  }, [requestedInstallVersionId, refresh, install, t]);

  // Build the unified list. Server-listed candidates come first (in the
  // order the registry returned them); any locally-installed records the
  // server no longer lists are appended so the user can still uninstall
  // them. Each row carries its own status — no parallel sections.
  const rows = useMemo<RegistryRow[]>(() => {
    const seen = new Set<string>();
    const fromCandidates: RegistryRow[] = candidates.map((candidate) => {
      seen.add(candidate.id);
      const installedRecord = installedById.get(candidate.id) ?? null;
      const isActive = active?.id === candidate.id;
      const isPreviousActive = !isActive && previous?.id === candidate.id;
      const status: RowStatus = !candidate.supported
        ? "unsupported"
        : isActive
          ? "active"
          : installedRecord
            ? "installed"
            : "available";
      return { candidate, installedRecord, isActive, isPreviousActive, status };
    });

    // Locally-installed rows that the current channel doesn't list (e.g.
    // installed from the other channel, or pulled from the registry
    // since). Surface them so the user can still activate / delete.
    const orphanRows: RegistryRow[] = installed
      .filter((r) => !seen.has(r.id))
      .map((record) => {
        const isActive = active?.id === record.id;
        const isPreviousActive = !isActive && previous?.id === record.id;
        // Old installed records baked the channel/default label into
        // the display name (e.g. "0.3.2 default"). Strip those so the
        // version shows alone and the channel/default render as pills.
        const cleanName = cleanDisplayName(record.displayName);
        // Recover `isDefault` and `channel` from the stored metadata so
        // pills render correctly even when the registry no longer lists
        // this version on the active channel.
        const reg = record.metadata?.registry as { is_default?: boolean } | undefined;
        const orphanChannel = recoverChannel(record.id);
        const synthetic: ModelCandidate = {
          id: record.id,
          displayName: cleanName,
          quantization: record.quantization,
          manifest: record.manifest,
          manifestUrl: "",
          metadataUrl: "",
          metadata: record.metadata,
          artifactUrl: null,
          platform: record.platform,
          supported: true,
          channel: orphanChannel,
          isDefault: reg?.is_default ?? false,
        };
        return {
          candidate: synthetic,
          installedRecord: record,
          isActive,
          isPreviousActive,
          status: isActive ? "active" : "installed",
        };
      });

    return [...fromCandidates, ...orphanRows];
  }, [candidates, installedById, installed, active?.id, previous?.id]);

  // Active first, then other installed; Available holds anything not yet
  // installed (plus unsupported candidates so the user sees why they
  // can't install them). The split lets the user distinguish "what I
  // have on device" from "what's on the registry I could fetch."
  const installedRows = useMemo(
    () =>
      rows
        .filter((r) => r.status === "active" || r.status === "installed")
        .sort((a, b) => Number(b.isActive) - Number(a.isActive)),
    [rows],
  );
  const availableRows = useMemo(
    () => rows.filter((r) => r.status === "available" || r.status === "unsupported"),
    [rows],
  );

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("more:models.title")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#171717" size={20} />,
          onPress: () => {
            if (router.canGoBack()) router.back();
            else router.replace("/(tabs)/more");
          },
        }}
      />
      <ScrollView contentContainerClassName="px-xl py-md gap-lg">
        <Card>
          <View className="flex-row items-center gap-md">
            <View className="flex-1">
              <Text className="text-body text-fg-primary">
                {t("settings:models.autoInstallOnWifi")}
              </Text>
              <Text className="text-caption text-fg-secondary mt-xs">
                {t("settings:models.autoInstallOnWifiHint")}
              </Text>
            </View>
            <Toggle
              value={autoInstallOnWifi}
              onValueChange={setAutoInstallOnWifi}
              accessibilityLabel={t("settings:models.autoInstallOnWifi")}
            />
          </View>
        </Card>

        {error ? (
          <StatusBanner
            tone="danger"
            title={t("more:models.installFailedTitle")}
            message={error}
            onDismiss={() => setError(null)}
          />
        ) : null}

        {backgroundInstall.status === "installing" ? (
          <StatusBanner
            tone="info"
            title={t("more:models.backgroundInstall.title")}
            message={t("more:models.backgroundInstall.body", {
              name: backgroundInstall.displayName ?? t("more:models.defaultPill"),
            })}
          />
        ) : backgroundInstall.status === "completed" ? (
          <StatusBanner
            tone="success"
            title={t("more:models.backgroundInstall.completedTitle")}
            message={t("more:models.backgroundInstall.completedBody", {
              name: backgroundInstall.displayName ?? t("more:models.defaultPill"),
            })}
            onDismiss={() => clearBackgroundModelInstall(backgroundInstall.runId)}
          />
        ) : backgroundInstall.status === "failed" ? (
          <StatusBanner
            tone="danger"
            title={t("more:models.backgroundInstall.failedTitle")}
            message={backgroundInstall.error ?? t("more:models.backgroundInstall.failedBody")}
            onDismiss={() => clearBackgroundModelInstall(backgroundInstall.runId)}
          />
        ) : null}

        <RowSection
          title={t("more:models.installed")}
          rows={installedRows}
          loading={busy === "refresh" && rows.length === 0}
          emptyLabel={t("more:models.noInstalled")}
          busy={effectiveBusy}
          progressById={effectiveProgressById}
          onInstall={(c) => install(c)}
          onActivate={(r) => activate(r)}
          onDelete={(r) => remove(r)}
          onCancel={(id) => cancelInstall(id)}
        />

        <RowSection
          title={t("more:models.available")}
          rows={availableRows}
          loading={busy === "refresh" && rows.length === 0}
          emptyLabel={t("more:models.noCandidatesForChannel")}
          busy={effectiveBusy}
          progressById={effectiveProgressById}
          onInstall={(c) => install(c)}
          onActivate={(r) => activate(r)}
          onDelete={(r) => remove(r)}
          onCancel={(id) => cancelInstall(id)}
          headerRight={
            <View className="flex-row items-center gap-xs">
              <Segmented<DeploymentChannel>
                value={channel}
                onChange={(v) => setChannel(v)}
                variant="tag"
                options={[
                  { value: "staging", label: t("more:models.staging") },
                  { value: "production", label: t("more:models.production") },
                ]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("more:models.refresh")}
                disabled={effectiveBusy !== null}
                onPress={() => void refresh(channel)}
                hitSlop={6}
                className={`h-7 w-7 items-center justify-center rounded-full border border-line-secondary ${
                  effectiveBusy === "refresh" ? "opacity-50" : ""
                }`}
              >
                <RefreshCw color="#6E40E0" size={14} />
              </Pressable>
            </View>
          }
          prepend={
            statusMessage ? (
              <StatusBanner
                tone="success"
                title={t("more:models.upToDateTitle")}
                message={statusMessage}
                onDismiss={() => setStatusMessage(null)}
              />
            ) : null
          }
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function RowSection({
  title,
  rows,
  loading,
  emptyLabel,
  busy,
  progressById,
  onInstall,
  onActivate,
  onDelete,
  onCancel,
  headerRight,
  prepend,
}: {
  title: string;
  rows: RegistryRow[];
  loading: boolean;
  emptyLabel: string;
  busy: string | null;
  progressById: Record<string, InstallProgress>;
  onInstall: (candidate: ModelCandidate) => void;
  onActivate: (record: InstalledModelRecord) => void;
  onDelete: (record: InstalledModelRecord) => void;
  onCancel: (id: string) => void;
  headerRight?: React.ReactNode;
  prepend?: React.ReactNode;
}) {
  const { t } = useTranslation("common");
  return (
    <View className="gap-sm">
      <View className="flex-row items-center gap-sm px-xs">
        <View className="flex-row items-baseline gap-xs flex-1">
          <Text className="text-caption uppercase text-fg-secondary">{title}</Text>
          {rows.length > 0 ? (
            <Text className="text-caption text-fg-tertiary">· {rows.length}</Text>
          ) : null}
        </View>
        {headerRight}
      </View>
      {loading ? <RefreshingPill /> : null}
      <Card className="gap-md">
        {prepend}
        {rows.length === 0 ? (
          <View className="items-center gap-sm py-md">
            <Inbox color="rgba(0,0,0,0.35)" size={24} />
            <Text className="text-body text-fg-secondary text-center">
              {loading ? t("states.loading") : emptyLabel}
            </Text>
          </View>
        ) : (
          rows.map((row, idx) => (
            <ModelRow
              key={row.candidate.id}
              row={row}
              isLast={idx === rows.length - 1}
              busy={busy}
              progress={progressById[row.candidate.id]}
              onInstall={() => onInstall(row.candidate)}
              onActivate={() => row.installedRecord && onActivate(row.installedRecord)}
              onDelete={() => row.installedRecord && onDelete(row.installedRecord)}
              onCancel={() => onCancel(row.candidate.id)}
            />
          ))
        )}
      </Card>
    </View>
  );
}

type StatusTone = "success" | "danger" | "info";

function RefreshingPill() {
  const { t } = useTranslation("more");
  return (
    <View className="flex-row items-center gap-xs self-start rounded-full bg-bg-secondary px-md py-xs">
      <ActivityIndicator size="small" color="#6E40E0" />
      <Text className="text-caption text-fg-secondary">{t("models.refreshing")}</Text>
    </View>
  );
}

function StatusBanner({
  tone,
  title,
  message,
  onDismiss,
}: {
  tone: StatusTone;
  title: string;
  message: string;
  onDismiss?: () => void;
}) {
  const { t } = useTranslation("common");
  const palette = STATUS_PALETTE[tone];
  const Icon = tone === "danger" ? AlertTriangle : tone === "success" ? CheckCircle2 : RefreshCw;
  return (
    <View
      accessibilityRole="alert"
      className="flex-row gap-md rounded-lg border px-md py-md"
      style={{ borderColor: palette.fg, backgroundColor: palette.bg }}
    >
      <Icon color={palette.fg} size={20} />
      <View className="flex-1 gap-xs">
        <Text className="text-title font-medium" style={{ color: palette.fg }}>
          {title}
        </Text>
        <Text className="text-caption" style={{ color: palette.fg }}>
          {message}
        </Text>
      </View>
      {onDismiss ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("actions.dismiss")}
          onPress={onDismiss}
          hitSlop={8}
        >
          <X color={palette.fg} size={18} />
        </Pressable>
      ) : null}
    </View>
  );
}

const STATUS_PALETTE: Record<StatusTone, { bg: string; fg: string }> = {
  success: { bg: "#E6F4EA", fg: "#1F6E3A" },
  danger: { bg: "#FBEAE8", fg: "#8A1F1B" },
  info: { bg: "#E5EEF7", fg: "#1F4F8B" },
};

function PhaseLabel({ progress }: { progress: InstallProgress }) {
  const { t } = useTranslation("more");
  if (progress.phase === "downloading") {
    const dl = progress.downloadedBytes ?? 0;
    const total = progress.totalBytes ?? 0;
    if (total > 0) {
      const percent = Math.min(100, Math.max(0, Math.round((dl / total) * 100)));
      return <Text className="text-caption">{t("models.phase.downloading", { percent })}</Text>;
    }
    return (
      <Text className="text-caption">
        {t("models.phase.downloadingBytes", { kb: Math.round(dl / 1024) })}
      </Text>
    );
  }
  return <Text className="text-caption">{t(`models.phase.${progress.phase}`)}</Text>;
}

function ModelRow({
  row,
  isLast,
  busy,
  progress,
  onInstall,
  onActivate,
  onDelete,
  onCancel,
}: {
  row: RegistryRow;
  isLast: boolean;
  busy: string | null;
  progress?: InstallProgress | undefined;
  onInstall: () => void;
  onActivate: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(["common", "more"]);
  const { candidate, installedRecord, isPreviousActive, status } = row;
  const sizeMb = candidateSizeMb(candidate, installedRecord);
  const platformLabel = candidate.platform === "android" ? "TFLite" : "Core ML";
  const installing = busy === `install:${candidate.id}`;
  const [expanded, setExpanded] = useState(false);
  const metadata = installedRecord?.metadata ?? candidate.metadata ?? null;
  const headlineMap = metadata ? pickHeadlineMap(metadata.metrics) : null;

  const downloading = progress?.phase === "downloading";
  const percent =
    downloading && progress?.totalBytes
      ? Math.min(
          100,
          Math.max(0, Math.round(((progress.downloadedBytes ?? 0) / progress.totalBytes) * 100)),
        )
      : null;

  return (
    <View
      className={`gap-md rounded-lg ${
        status === "active" ? "bg-card-lavender -mx-xs px-md py-md" : "py-xs"
      } ${status === "unsupported" ? "opacity-70" : ""} ${
        isLast ? "" : "border-b border-line-tertiary pb-md"
      }`}
    >
      <View className="flex-row items-start gap-md">
        <View className="h-10 w-10 items-center justify-center rounded-lg bg-card-lavender">
          <Cpu color="#6E40E0" size={20} />
        </View>
        <View className="flex-1 gap-xs">
          <View className="flex-row items-center gap-xs flex-wrap">
            <Text className="shrink text-title font-medium text-fg-primary" numberOfLines={1}>
              {cleanDisplayName(candidate.displayName)}
            </Text>
            {status === "active" ? (
              <Pill tone="success" dot label={t("more:models.activePill")} />
            ) : null}
            {candidate.channel ? (
              <Pill
                tone={candidate.channel === "production" ? "success" : "warning"}
                label={t(`more:models.${candidate.channel}`)}
              />
            ) : null}
            {candidate.isDefault ? (
              <Pill tone="brand" label={t("more:models.defaultPill")} />
            ) : null}
            {isPreviousActive ? (
              <Pill tone="neutral" label={t("more:models.previousPill")} />
            ) : null}
          </View>
          <View className="flex-row flex-wrap items-center gap-xs">
            <Text className="text-caption text-fg-secondary">
              {platformLabel}
              {sizeMb ? ` · ${sizeMb} MB` : ""}
              {` · ${candidate.quantization}`}
            </Text>
            {headlineMap !== null ? (
              <Pill tone="info" label={`mAP@50 ${headlineMap.toFixed(2)}`} />
            ) : null}
          </View>
          {status === "unsupported" ? (
            <Text className="text-caption text-warning-text mt-xs">
              {candidate.unsupportedReason}
            </Text>
          ) : null}
        </View>
        {metadata ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={
              expanded ? t("more:models.hideDetails") : t("more:models.showDetails")
            }
            className="h-7 w-7 items-center justify-center"
            onPress={() => setExpanded((v) => !v)}
            hitSlop={6}
          >
            {expanded ? (
              <ChevronUp color="#6B6B68" size={16} />
            ) : (
              <ChevronDown color="#6B6B68" size={16} />
            )}
          </Pressable>
        ) : null}
      </View>

      {progress ? (
        <View className="gap-xs">
          {downloading ? (
            <View className="h-1.5 w-full overflow-hidden rounded-full bg-line-tertiary">
              <View
                className="h-full rounded-full bg-primary"
                style={{ width: `${percent ?? 0}%` }}
              />
            </View>
          ) : null}
          <View className="flex-row items-center justify-between gap-sm">
            <View className="flex-1">
              <PhaseLabel progress={progress} />
            </View>
            {downloading ? (
              <Button
                variant="ghost"
                size="sm"
                label={t("common:actions.cancel")}
                onPress={onCancel}
              />
            ) : null}
          </View>
        </View>
      ) : status === "active" ? null : status === "installed" ? (
        <View className="flex-row justify-end gap-sm">
          <Button
            variant="secondary"
            size="sm"
            label={
              busy === `activate:${candidate.id}`
                ? t("common:states.loading")
                : isPreviousActive
                  ? t("more:models.restore")
                  : t("more:models.activate")
            }
            disabled={busy !== null}
            onPress={onActivate}
          />
          <Button
            variant="danger"
            size="sm"
            label={t("common:actions.delete")}
            disabled={busy !== null}
            onPress={onDelete}
          />
        </View>
      ) : status === "available" ? (
        <Button
          size="sm"
          label={installing ? t("common:states.loading") : t("more:models.download")}
          renderLeadingIcon={() => <Download color="#FFFFFF" size={16} />}
          onPress={onInstall}
          disabled={busy !== null}
        />
      ) : null}

      {expanded && metadata ? (
        <ModelDetails metadata={metadata} record={installedRecord} candidate={candidate} />
      ) : null}
    </View>
  );
}

// Headline metric — surfaced as a Pill on the collapsed row. Tries the
// segmentation mAP first (since this is a -seg model), then bbox mAP,
// then a generic key. Returns null if none are present so the badge
// can be skipped cleanly.
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

function pickNumber(source: unknown, keys: string[]): number | null {
  if (!source || typeof source !== "object") return null;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

interface MetricDef {
  label: string;
  keys: string[];
  format?: (n: number) => string;
}

const PERFORMANCE_METRICS: MetricDef[] = [
  { label: "mAP@50 (mask)", keys: ["metrics/mAP50(M)"] },
  { label: "mAP@50-95 (mask)", keys: ["metrics/mAP50-95(M)"] },
  { label: "mAP@50 (box)", keys: ["metrics/mAP50(B)", "mAP50"] },
  { label: "mAP@50-95 (box)", keys: ["metrics/mAP50-95(B)", "mAP50-95"] },
  { label: "Precision", keys: ["metrics/precision(M)", "metrics/precision(B)", "precision"] },
  { label: "Recall", keys: ["metrics/recall(M)", "metrics/recall(B)", "recall"] },
  { label: "Fitness", keys: ["fitness"] },
];

function ModelDetails({
  metadata,
  record,
  candidate,
}: {
  metadata: ModelCandidate["metadata"] & {};
  record: InstalledModelRecord | null;
  candidate: ModelCandidate;
}) {
  const { t } = useTranslation("more");
  const performanceRows = PERFORMANCE_METRICS.map((m) => ({
    label: m.label,
    value: pickNumber(metadata.metrics, m.keys),
  })).filter((r): r is { label: string; value: number } => r.value !== null);

  const hyperparams = metadata.hyperparameters as Record<string, unknown> | undefined;
  const trainingRows: { label: string; value: string }[] = hyperparams
    ? Object.entries(hyperparams)
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .slice(0, 12)
        .map(([k, v]) => ({ label: humanizeKey(k), value: formatPrimitive(v) }))
    : [];

  const classCount = Array.isArray(metadata.class_names) ? metadata.class_names.length : 0;
  const sha = record?.artifactSha256 ?? null;
  const versionId = (metadata.registry as { version_id?: string } | undefined)?.version_id ?? null;

  return (
    <View className="gap-md rounded-lg bg-bg-secondary px-md py-md">
      {performanceRows.length > 0 ? (
        <DetailGroup title={t("models.details.performance")} icon="performance">
          <View className="flex-row flex-wrap gap-x-md gap-y-xs">
            {performanceRows.map((r) => (
              <View key={r.label} className="w-[48%]">
                <Text className="text-caption text-fg-secondary">{r.label}</Text>
                <Text className="text-title font-medium text-fg-primary">{r.value.toFixed(3)}</Text>
              </View>
            ))}
          </View>
        </DetailGroup>
      ) : null}

      <DetailGroup title={t("models.details.model")} icon="model">
        <DetailRow label={t("models.details.task")} value={metadata.task} />
        <DetailRow
          label={t("models.details.inputSize")}
          value={`${metadata.input_size}×${metadata.input_size}`}
        />
        <DetailRow
          label={t("models.details.classes")}
          value={
            classCount > 0
              ? `${classCount} (${metadata.class_names.slice(0, 4).join(", ")}${
                  classCount > 4 ? "…" : ""
                })`
              : "—"
          }
        />
        <DetailRow
          label={t("models.details.outputShape")}
          value={Array.isArray(metadata.output_shape) ? metadata.output_shape.join("×") : "—"}
        />
        {metadata.calibration?.required ? (
          <DetailRow
            label={t("models.details.calibration")}
            value={`${metadata.calibration.default_marker_mm ?? "?"} mm · ${
              metadata.calibration.supported_sources?.join(", ") ?? ""
            }`}
          />
        ) : null}
      </DetailGroup>

      {trainingRows.length > 0 ? (
        <DetailGroup title={t("models.details.training")} icon="training">
          {trainingRows.map((r) => (
            <DetailRow key={r.label} label={r.label} value={r.value} />
          ))}
        </DetailGroup>
      ) : null}

      <DetailGroup title={t("models.details.artifact")} icon="artifact">
        {versionId ? (
          <DetailRow
            label={t("models.details.versionId")}
            value={
              versionId.length > 14 ? `${versionId.slice(0, 8)}…${versionId.slice(-4)}` : versionId
            }
          />
        ) : null}
        {sha ? (
          <DetailRow
            label={t("models.details.sha256")}
            value={`${sha.slice(0, 8)}…${sha.slice(-6)}`}
          />
        ) : null}
        {candidate.channel ? (
          <DetailRow label={t("models.details.channel")} value={candidate.channel} />
        ) : null}
      </DetailGroup>
    </View>
  );
}

type DetailIcon = "performance" | "model" | "training" | "artifact";

function DetailGroup({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: DetailIcon;
  children: React.ReactNode;
}) {
  const Icon =
    icon === "performance"
      ? Gauge
      : icon === "model"
        ? Cpu
        : icon === "training"
          ? Sliders
          : icon === "artifact"
            ? Package
            : null;
  return (
    <View className="gap-xs">
      <View className="flex-row items-center gap-xs">
        {Icon ? <Icon color="#6B6B68" size={12} /> : null}
        <Text className="text-caption uppercase text-fg-secondary">{title}</Text>
      </View>
      <View className="gap-xs">{children}</View>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start gap-md">
      <Text className="w-32 text-caption text-fg-secondary">{label}</Text>
      <Text className="flex-1 text-caption text-fg-primary" numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function humanizeKey(key: string): string {
  return key
    .replace(/[_/]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function formatPrimitive(value: unknown): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/\.?0+$/, "");
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.slice(0, 4).map(formatPrimitive).join(", ");
  return JSON.stringify(value);
}

// Old installed records baked the channel/default suffix into the
// stored display name. Strip those patterns so the row title is just
// the version and the rest renders as pills.
function cleanDisplayName(name: string): string {
  return name
    .replace(/\s*·\s*(staging|production)\s*$/i, "")
    .replace(/\s+default\s*$/i, "")
    .trim();
}

// Installed record IDs follow `${channel}-${version_id}-${platform}`,
// so we can recover the original channel for pills even when the
// current registry list doesn't include this version anymore.
function recoverChannel(recordId: string): "staging" | "production" | undefined {
  if (recordId.startsWith("staging-")) return "staging";
  if (recordId.startsWith("production-")) return "production";
  return undefined;
}

function candidateSizeMb(
  candidate: ModelCandidate,
  installedRecord: InstalledModelRecord | null,
): string | null {
  if (installedRecord?.artifactSizeBytes) {
    return (installedRecord.artifactSizeBytes / 1_000_000).toFixed(1);
  }
  const artifact =
    candidate.platform === "ios"
      ? candidate.manifest.artifacts.coreml
      : candidate.manifest.artifacts.tflite;
  if (!artifact?.size_bytes) return null;
  return (artifact.size_bytes / 1_000_000).toFixed(1);
}
