import { AppTopBar } from "@/components/ui/AppTopBar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
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
  ChevronLeft,
  ChevronRight,
  Cloud,
  Cpu,
  Download,
  Inbox,
  RefreshCw,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
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
        <View className="flex-row gap-xs p-xs rounded-md bg-bg-tertiary border border-line-tertiary">
          {(["production", "staging"] as DeploymentChannel[]).map((value) => {
            const active = channel === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setChannel(value)}
                className={`flex-1 h-9 items-center justify-center rounded-sm ${
                  active ? "bg-bg-primary border border-line-tertiary" : "bg-transparent"
                }`}
              >
                <Text
                  className={`text-title ${
                    active ? "text-fg-primary font-semibold" : "text-fg-secondary font-medium"
                  }`}
                >
                  {t(`more:models.${value}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View className="flex-row items-center gap-md rounded-md bg-card-cream px-md py-md">
          <Cloud color="#704B00" size={16} />
          <View className="flex-1">
            <Text className="text-body text-fg-primary font-medium">
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
          onCancel={(id) => cancelInstall(id)}
          headerRight={
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
      {prepend}
      {rows.length === 0 ? (
        <Card>
          <View className="items-center gap-sm py-md">
            <Inbox color="rgba(0,0,0,0.35)" size={24} />
            <Text className="text-body text-fg-secondary text-center">
              {loading ? t("states.loading") : emptyLabel}
            </Text>
          </View>
        </Card>
      ) : (
        <View className="gap-sm">
          {rows.map((row) => (
            <ModelRow
              key={row.candidate.id}
              row={row}
              busy={busy}
              progress={progressById[row.candidate.id]}
              onInstall={() => onInstall(row.candidate)}
              onActivate={() => row.installedRecord && onActivate(row.installedRecord)}
              onCancel={() => onCancel(row.candidate.id)}
            />
          ))}
        </View>
      )}
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
  busy,
  progress,
  onInstall,
  onActivate,
  onCancel,
}: {
  row: RegistryRow;
  busy: string | null;
  progress?: InstallProgress | undefined;
  onInstall: () => void;
  onActivate: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(["common", "more"]);
  const router = useRouter();
  const { candidate, installedRecord, isPreviousActive, status } = row;
  const sizeMb = candidateSizeMb(candidate, installedRecord);
  const platformLabel = candidate.platform === "android" ? "TFLite" : "Core ML";
  const installing = busy === `install:${candidate.id}`;
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

  // Tappable when there is content to show on the detail screen. Available
  // candidates route only when they carry metadata (until installed, the
  // detail page falls back to the registry metadata payload). Unsupported
  // rows stay non-tappable so the warning text reads as terminal.
  const detailId = installedRecord?.id ?? candidate.id;
  const tappable =
    status === "active" || status === "installed" || (status === "available" && !!metadata);
  const showChevron = tappable && !progress;

  const cardContent = (
    <View className="gap-md">
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
          {status === "active" || status === "installed" || status === "available" ? (
            <StatStrip
              acc={pickAccuracy(metadata)}
              map={headlineMap}
              sizeMb={sizeMb}
              platformLabel={platformLabel}
              quantization={candidate.quantization}
            />
          ) : (
            <Text className="text-caption text-fg-secondary">
              {platformLabel}
              {sizeMb ? ` · ${sizeMb} MB` : ""}
              {` · ${candidate.quantization}`}
            </Text>
          )}
          {status === "unsupported" ? (
            <Text className="text-caption text-warning-text mt-xs">
              {candidate.unsupportedReason}
            </Text>
          ) : null}
        </View>
        {showChevron ? <ChevronRight color="#6B6B68" size={18} /> : null}
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
      ) : status === "installed" ? (
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
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
      ) : status === "available" ? (
        <Button
          size="sm"
          className="w-full"
          label={installing ? t("common:states.loading") : t("more:models.download")}
          renderLeadingIcon={() => <Download color="#FFFFFF" size={16} />}
          onPress={onInstall}
          disabled={busy !== null}
        />
      ) : null}
    </View>
  );

  // Active state: 2px green left-rail accent (in place of the prior lavender
  // background fill). Implemented via inline border style on the Card so the
  // accent doesn't conflict with the existing rounded-corner tone token.
  const activeRail =
    status === "active" ? { borderLeftWidth: 2, borderLeftColor: "#1F6E3A" } : undefined;
  const baseCardClass = `gap-md ${status === "unsupported" ? "opacity-70" : ""}`;

  if (tappable) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={cleanDisplayName(candidate.displayName)}
        onPress={() => router.push(`/more/models/${detailId}`)}
      >
        <Card className={baseCardClass} style={activeRail}>
          {cardContent}
        </Card>
      </Pressable>
    );
  }

  return (
    <Card className={baseCardClass} style={activeRail}>
      {cardContent}
    </Card>
  );
}

// Three-stat strip on the collapsed row: acc · mAP · size. Matches the
// prototype's stat-tile DNA — uppercase micro-label above, semibold
// tabular-num value below. Falls back gracefully when a metric is
// missing so the layout doesn't collapse.
function StatStrip({
  acc,
  map,
  sizeMb,
  platformLabel,
  quantization,
}: {
  acc: number | null;
  map: number | null;
  sizeMb: string | null;
  platformLabel: string;
  quantization: string;
}) {
  return (
    <View className="gap-xs">
      <View className="flex-row" style={{ marginHorizontal: -4 }}>
        <StatTile label="acc" value={acc !== null ? `${acc.toFixed(1)}%` : "—"} />
        <StatTile label="mAP" value={map !== null ? map.toFixed(2) : "—"} />
        <StatTile label="size" value={sizeMb ? `${sizeMb} MB` : "—"} />
      </View>
      <Text className="text-caption text-fg-tertiary">
        {platformLabel} · {quantization}
      </Text>
    </View>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, paddingHorizontal: 4 }}>
      <Text className="text-[10px] uppercase tracking-[0.6px] font-semibold text-fg-tertiary">
        {label}
      </Text>
      <Text
        className="mt-[1px] font-semibold text-fg-primary"
        style={{ fontSize: 15, letterSpacing: -0.2, fontVariant: ["tabular-nums"] }}
      >
        {value}
      </Text>
    </View>
  );
}

// "acc" in the prototype maps to precision-at-IoU-0.5 — the closest
// single-number proxy that field users read as "accuracy" for a
// detection/seg model. Falls back to mAP×100 so the tile is never
// empty when *some* signal is available.
function pickAccuracy(metadata: ModelCandidate["metadata"] | null | undefined): number | null {
  if (!metadata) return null;
  const precision = pickNumber(metadata.metrics, [
    "metrics/precision(M)",
    "metrics/precision(B)",
    "precision",
  ]);
  if (precision !== null) return precision * 100;
  const map = pickHeadlineMap(metadata.metrics);
  return map !== null ? map * 100 : null;
}

// Headline metric — surfaced on the collapsed row. Tries the
// segmentation mAP first (since this is a -seg model), then bbox mAP,
// then a generic key. Returns null if none are present.
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

// Old installed records baked the channel/default suffix into the
// stored display name. Strip those patterns so the row title is just
// the version and the rest renders as pills.
export function cleanDisplayName(name: string): string {
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
