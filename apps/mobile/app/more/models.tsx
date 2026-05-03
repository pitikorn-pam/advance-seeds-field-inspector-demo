import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { ChevronLeft, Download, RefreshCw, RotateCcw, Trash2, Zap } from "lucide-react-native";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import {
  activateInstalledModel,
  deleteInstalledModel,
  readActiveModel,
  readInstalledModels,
  readPreviousActiveModel,
  rollbackActiveModel,
} from "@/lib/models/modelStore";
import { installCandidate, loadCandidatesFromIndex } from "@/lib/models/modelRegistry";
import {
  defaultDeploymentListUrl,
  listDeployedModelCandidates,
  type DeploymentChannel,
} from "@/lib/models/registryService";
import type { InstalledModelRecord, ModelCandidate } from "@/lib/models/types";
import { resetSharedTfliteModel } from "@/lib/analyzer/TfliteSeedAnalyzer";

export default function ModelRegistryScreen() {
  const { t } = useTranslation(["common", "more"]);
  const router = useRouter();
  const [channel, setChannel] = useState<DeploymentChannel>("staging");
  const [indexUrl, setIndexUrl] = useState(defaultDeploymentListUrl("staging"));
  const [candidates, setCandidates] = useState<ModelCandidate[]>([]);
  const [installed, setInstalled] = useState<InstalledModelRecord[]>([]);
  const [active, setActive] = useState<InstalledModelRecord | null>(null);
  const [previous, setPrevious] = useState<InstalledModelRecord | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const installedById = useMemo(() => new Map(installed.map((m) => [m.id, m])), [installed]);

  const reloadInstalled = async () => {
    const [rows, activeRow, previousRow] = await Promise.all([
      readInstalledModels(),
      readActiveModel(),
      readPreviousActiveModel(),
    ]);
    setInstalled(rows);
    setActive(activeRow);
    setPrevious(previousRow);
  };

  useEffect(() => {
    void reloadInstalled();
  }, []);

  const refreshIndex = async () => {
    setBusy("index");
    setError(null);
    try {
      const selectedChannelUrl = defaultDeploymentListUrl(channel);
      const sourceUrl = indexUrl.trim();
      if (!sourceUrl || sourceUrl === selectedChannelUrl) {
        setCandidates(await listDeployedModelCandidates({ channel }));
        setIndexUrl(selectedChannelUrl);
      } else {
        setCandidates(await loadCandidatesFromIndex(sourceUrl));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const selectChannel = (next: DeploymentChannel) => {
    setChannel(next);
    setIndexUrl(defaultDeploymentListUrl(next));
  };

  const install = async (candidate: ModelCandidate) => {
    setBusy(`install:${candidate.id}`);
    setError(null);
    try {
      const record = await installCandidate(candidate);
      await reloadInstalled();
      Alert.alert(t("more:models.installedTitle"), record.displayName);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const activate = async (record: InstalledModelRecord) => {
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
  };

  const rollback = async () => {
    setBusy("rollback");
    setError(null);
    try {
      await rollbackActiveModel();
      resetSharedTfliteModel();
      await reloadInstalled();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (record: InstalledModelRecord) => {
    Alert.alert(t("common:actions.delete"), record.displayName, [
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
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("more:models.title")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#1A1A1A" size={20} />,
          onPress: () => router.back(),
        }}
      />
      <ScrollView contentContainerClassName="px-xl py-md gap-md">
        <Text className="text-caption text-fg-secondary">{t("more:models.intro")}</Text>
        <View className="flex-row gap-sm">
          <Pressable
            accessibilityRole="button"
            className={`h-9 flex-1 items-center justify-center rounded-md border ${
              channel === "staging"
                ? "border-brand bg-brand"
                : "border-line-secondary bg-bg-primary"
            }`}
            onPress={() => selectChannel("staging")}
          >
            <Text
              className={`text-title font-medium ${channel === "staging" ? "text-brand-on" : "text-fg-primary"}`}
            >
              {t("more:models.staging")}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            className={`h-9 flex-1 items-center justify-center rounded-md border ${
              channel === "production"
                ? "border-brand bg-brand"
                : "border-line-secondary bg-bg-primary"
            }`}
            onPress={() => selectChannel("production")}
          >
            <Text
              className={`text-title font-medium ${channel === "production" ? "text-brand-on" : "text-fg-primary"}`}
            >
              {t("more:models.production")}
            </Text>
          </Pressable>
        </View>
        <View className="rounded-xl border border-line-tertiary bg-bg-primary px-md py-sm">
          <Text className="text-caption text-fg-secondary">{t("more:models.indexUrl")}</Text>
          <TextInput
            value={indexUrl}
            onChangeText={setIndexUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            className="mt-xs text-body text-fg-primary"
          />
        </View>
        <Button
          label={busy === "index" ? t("common:states.loading") : t("more:models.refresh")}
          renderLeadingIcon={() => <RefreshCw color="#FFFFFF" size={18} />}
          onPress={refreshIndex}
          disabled={busy !== null}
        />
        <Text className="text-caption text-fg-secondary">{t("more:models.endpointHint")}</Text>
        {error ? <Text className="text-caption text-danger-text">{error}</Text> : null}

        <Section title={t("more:models.available")}>
          {candidates.length === 0 ? (
            <Text className="text-body text-fg-secondary">{t("more:models.noCandidates")}</Text>
          ) : (
            candidates.map((candidate) => (
              <CandidateRow
                key={candidate.id}
                candidate={candidate}
                installed={installedById.get(candidate.id)}
                busy={busy === `install:${candidate.id}`}
                onInstall={() => install(candidate)}
              />
            ))
          )}
        </Section>

        <Section title={t("more:models.installed")}>
          {installed.length === 0 ? (
            <Text className="text-body text-fg-secondary">{t("more:models.noInstalled")}</Text>
          ) : (
            installed.map((record) => (
              <InstalledRow
                key={record.id}
                record={record}
                active={active?.id === record.id}
                busy={busy}
                onActivate={() => activate(record)}
                onDelete={() => remove(record)}
              />
            ))
          )}
        </Section>

        <Section title={t("more:models.rollback")}>
          {previous ? (
            <Button
              variant="outline"
              label={t("more:models.rollbackTo", { name: previous.displayName })}
              renderLeadingIcon={() => <RotateCcw color="#0F6E56" size={18} />}
              onPress={rollback}
              disabled={busy !== null}
            />
          ) : (
            <Text className="text-body text-fg-secondary">{t("more:models.noRollback")}</Text>
          )}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-sm">
      <Text className="text-caption uppercase text-fg-secondary px-xs">{title}</Text>
      <Card className="gap-md">{children}</Card>
    </View>
  );
}

function CandidateRow({
  candidate,
  installed,
  busy,
  onInstall,
}: {
  candidate: ModelCandidate;
  installed: InstalledModelRecord | undefined;
  busy: boolean;
  onInstall: () => void;
}) {
  const { t } = useTranslation(["common", "more"]);
  return (
    <View className="gap-sm border-b border-line-tertiary pb-md">
      <View className="flex-row items-center gap-sm">
        <Text className="flex-1 text-title font-medium text-fg-primary">
          {candidate.displayName}
        </Text>
        <Pill
          tone={candidate.quantization === "fp16" ? "info" : "neutral"}
          label={candidate.quantization}
        />
      </View>
      <Text className="text-caption text-fg-secondary">
        {candidate.id} · {candidate.platform === "android" ? "TFLite" : "Core ML"}
        {candidate.channel ? ` · ${candidate.channel}` : ""}
      </Text>
      {candidate.isDefault ? <Pill tone="info" label={t("more:models.defaultPill")} /> : null}
      {!candidate.supported ? (
        <Text className="text-caption text-warning-text">{candidate.unsupportedReason}</Text>
      ) : installed ? (
        <Pill tone="success" label={t("more:models.installedPill")} />
      ) : (
        <Button
          size="sm"
          label={busy ? t("common:states.loading") : t("more:models.download")}
          renderLeadingIcon={() => <Download color="#FFFFFF" size={16} />}
          onPress={onInstall}
          disabled={busy}
        />
      )}
    </View>
  );
}

function InstalledRow({
  record,
  active,
  busy,
  onActivate,
  onDelete,
}: {
  record: InstalledModelRecord;
  active: boolean;
  busy: string | null;
  onActivate: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation(["common", "more"]);
  const sizeMb = (record.artifactSizeBytes / 1_000_000).toFixed(1);
  return (
    <View className="gap-sm border-b border-line-tertiary pb-md">
      <View className="flex-row items-center gap-sm">
        <Text className="flex-1 text-title font-medium text-fg-primary">{record.displayName}</Text>
        {active ? <Pill tone="success" dot label={t("more:models.activePill")} /> : null}
      </View>
      <Text className="text-caption text-fg-secondary">
        {record.id} · {record.quantization} · {sizeMb} MB · {record.metadata.model_name}
      </Text>
      <View className="flex-row gap-sm">
        <Pressable
          accessibilityRole="button"
          className="h-9 flex-row items-center gap-xs rounded-md bg-brand px-md"
          disabled={active || busy !== null}
          onPress={onActivate}
        >
          <Zap color="#FFFFFF" size={14} />
          <Text className="text-title font-medium text-brand-on">
            {busy === `activate:${record.id}`
              ? t("common:states.loading")
              : t("more:models.activate")}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          className="h-9 flex-row items-center gap-xs rounded-md bg-danger-bg px-md"
          disabled={active || busy !== null}
          onPress={onDelete}
        >
          <Trash2 color="#791F1F" size={14} />
          <Text className="text-title font-medium text-danger-text">
            {t("common:actions.delete")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
