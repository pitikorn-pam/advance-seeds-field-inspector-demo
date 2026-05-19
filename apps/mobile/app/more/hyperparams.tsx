import { ScrollView, View, Text, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { ChevronLeft, RotateCcw } from "lucide-react-native";
import {
  DEFAULT_HYPERPARAMS,
  resetHyperParams,
  setHyperParams,
  useHyperParams,
} from "@/lib/analyzer/hyperparams";
import { type InferenceStat, useInferenceStats } from "@/lib/analyzer/inferenceStats";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { Toggle } from "@/components/ui/Toggle";

const SCORE_PRESETS = [0.25, 0.4, 0.5, 0.6, 0.75];
const IOU_PRESETS = [0.45, 0.55, 0.65, 0.75, 0.85];
const FPS_PRESETS = [5, 10, 15, 30, 60];

/**
 * Hyperparameters playground for QA. Persisted to AsyncStorage so a
 * reload keeps the user's tuning, and subscribed to live by both the
 * single-shot analyzer (`analyze()` reads `getHyperParamsSync()` per
 * call) and the live worklet (deps array on the inferOnJS memo + the
 * frameProcessor itself, so changing values rebuilds the worklet
 * with the new throttle).
 */
export default function HyperParamsScreen() {
  const { t } = useTranslation(["common", "more"]);
  const router = useRouter();
  const hp = useHyperParams();
  const stats = useInferenceStats();

  const onReset = () => {
    Alert.alert(t("more:hyperparams.resetTitle"), t("more:hyperparams.resetBody"), [
      { text: t("common:actions.cancel"), style: "cancel" },
      {
        text: t("more:hyperparams.reset"),
        style: "destructive",
        onPress: () => void resetHyperParams(),
      },
    ]);
  };

  const scoreDirty = Math.abs(hp.scoreThreshold - DEFAULT_HYPERPARAMS.scoreThreshold) > 1e-6;
  const iouDirty = Math.abs(hp.iouThreshold - DEFAULT_HYPERPARAMS.iouThreshold) > 1e-6;
  const fpsDirty = hp.targetFps !== DEFAULT_HYPERPARAMS.targetFps;

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("more:hyperparams.title")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#171717" size={20} />,
          onPress: () => router.back(),
        }}
      />
      <ScrollView contentContainerClassName="px-xl py-md gap-lg">
        <PresetGroup
          label={t("more:hyperparams.scoreThreshold")}
          hint={t("more:hyperparams.scoreThresholdHint")}
          value={hp.scoreThreshold}
          presets={SCORE_PRESETS}
          format={(v) => v.toFixed(2)}
          dirty={scoreDirty}
          onPick={(v) => void setHyperParams({ scoreThreshold: v })}
        />

        <PresetGroup
          label={t("more:hyperparams.iouThreshold")}
          hint={t("more:hyperparams.iouThresholdHint")}
          value={hp.iouThreshold}
          presets={IOU_PRESETS}
          format={(v) => v.toFixed(2)}
          dirty={iouDirty}
          onPick={(v) => void setHyperParams({ iouThreshold: v })}
        />

        <PresetGroup
          label={t("more:hyperparams.targetFps")}
          hint={t("more:hyperparams.targetFpsHint")}
          value={hp.targetFps}
          presets={FPS_PRESETS}
          format={(v) => `${v}`}
          unit="fps"
          dirty={fpsDirty}
          onPick={(v) => void setHyperParams({ targetFps: v })}
        />

        <FeatureToggleCard
          label={t("more:hyperparams.morphFeature")}
          hint={t("more:hyperparams.morphFeatureHint")}
          enabled={hp.preprocessProfile === "morph_fused_v1"}
          onToggle={(enabled) =>
            void setHyperParams({
              preprocessProfile: enabled ? "morph_fused_v1" : "raw_rgb",
            })
          }
          accessibilityLabel={t("more:hyperparams.morphFeature")}
        />

        {stats.length > 0 ? (
          <View>
            <Text className="text-caption uppercase tracking-wide text-fg-secondary mb-sm px-xs">
              {t("more:hyperparams.inferenceStats")}
            </Text>
            <Card>
              <Text className="text-caption text-fg-tertiary mb-md">
                {t("more:hyperparams.inferenceStatsHint")}
              </Text>
              <View className="gap-lg">
                {stats.map((s) => (
                  <InferenceStatRow key={s.source} stat={s} />
                ))}
              </View>
            </Card>
          </View>
        ) : null}

        <View>
          <Text className="text-caption uppercase tracking-wide text-fg-secondary mb-sm px-xs">
            {t("more:hyperparams.defaults")}
          </Text>
          <Card>
            <Text className="text-caption text-fg-tertiary">
              score {DEFAULT_HYPERPARAMS.scoreThreshold} · iou {DEFAULT_HYPERPARAMS.iouThreshold} ·{" "}
              {DEFAULT_HYPERPARAMS.targetFps} fps ·{" "}
              {t(
                `more:hyperparams.preprocessProfileValue.${DEFAULT_HYPERPARAMS.preprocessProfile}`,
              )}
            </Text>
            <Button
              className="mt-md"
              variant="outline"
              label={t("more:hyperparams.reset")}
              renderLeadingIcon={() => <RotateCcw color="#171717" size={14} />}
              onPress={onReset}
            />
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeatureToggleCard({
  label,
  hint,
  enabled,
  onToggle,
  accessibilityLabel,
}: {
  label: string;
  hint: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  accessibilityLabel: string;
}) {
  return (
    <Card>
      <View className="flex-row items-center justify-between gap-md">
        <View className="flex-1">
          <Text className="text-body font-medium text-fg-primary">{label}</Text>
          <Text className="text-caption text-fg-tertiary mt-xs">{hint}</Text>
        </View>
        <Toggle value={enabled} onValueChange={onToggle} accessibilityLabel={accessibilityLabel} />
      </View>
    </Card>
  );
}

function PresetGroup({
  label,
  hint,
  value,
  presets,
  format,
  unit,
  dirty,
  onPick,
}: {
  label: string;
  hint: string;
  value: number;
  presets: number[];
  format: (v: number) => string;
  unit?: string;
  dirty: boolean;
  onPick: (v: number) => void;
}) {
  return (
    <View>
      <View className="flex-row items-baseline justify-between px-xs mb-xs">
        <Text className="text-caption uppercase tracking-wide text-fg-secondary">{label}</Text>
        <View className="flex-row items-baseline gap-[3px]">
          <Text
            className={`text-title font-medium ${dirty ? "text-warning-text" : "text-fg-primary"}`}
          >
            {format(value)}
          </Text>
          {unit ? <Text className="text-caption text-fg-tertiary">{unit}</Text> : null}
          {dirty ? <Text className="text-caption text-warning-text"> ·</Text> : null}
        </View>
      </View>
      <Text className="text-caption text-fg-tertiary px-xs mb-sm">{hint}</Text>
      <View className="flex-row gap-xs">
        {presets.map((p) => (
          <PresetButton
            key={p}
            label={format(p)}
            active={Math.abs(value - p) < 1e-6}
            onPress={() => onPick(p)}
          />
        ))}
      </View>
    </View>
  );
}

function PresetButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`flex-1 py-md items-center rounded-md border-2 ${
        active ? "border-brand bg-bg-primary" : "border-line-tertiary bg-bg-primary"
      }`}
    >
      <Text className={`text-body font-medium ${active ? "text-brand-deep" : "text-fg-primary"}`}>
        {label}
      </Text>
    </Pressable>
  );
}

function InferenceStatRow({ stat }: { stat: InferenceStat }) {
  const maxBucket = Math.max(1, ...stat.buckets);
  return (
    <View>
      <View className="flex-row items-baseline justify-between">
        <Text className="text-body font-medium text-fg-primary">{stat.source}</Text>
        <Text className="text-caption text-fg-tertiary">
          n={stat.count} (total {stat.total})
        </Text>
      </View>
      <View className="flex-row gap-xl mt-sm">
        <TimingStat label="p50" value={stat.p50} />
        <TimingStat label="p95" value={stat.p95} />
        <TimingStat label="p99" value={stat.p99} />
      </View>
      <View className="mt-md flex-row items-end gap-[2px] h-[64px]">
        {stat.buckets.map((count, i) => {
          const heightPct = count === 0 ? 4 : 4 + (count / maxBucket) * 96;
          const hot = i >= stat.buckets.length - 4 && count > 0;
          return (
            <View
              key={i}
              className={`flex-1 rounded-sm ${
                count === 0 ? "bg-line-tertiary" : hot ? "bg-warning" : "bg-brand opacity-60"
              }`}
              style={{ height: `${heightPct}%` }}
            />
          );
        })}
      </View>
      <View className="flex-row justify-between mt-xs">
        <Text className="text-caption text-fg-tertiary">{`<${stat.bucketEdgesMs[0]}ms`}</Text>
        <Text className="text-caption text-fg-tertiary">
          {`<${stat.bucketEdgesMs[Math.floor(stat.bucketEdgesMs.length / 2)]}`}
        </Text>
        <Text className="text-caption text-fg-tertiary">
          {`≥${stat.bucketEdgesMs[stat.bucketEdgesMs.length - 1]}`}
        </Text>
      </View>
    </View>
  );
}

function TimingStat({ label, value }: { label: string; value: number }) {
  return (
    <View>
      <Text className="text-caption uppercase tracking-wide text-fg-tertiary">{label}</Text>
      <View className="flex-row items-baseline gap-[3px] mt-[2px]">
        <Text className="text-xl font-medium text-fg-primary">{value}</Text>
        <Text className="text-caption text-fg-tertiary">ms</Text>
      </View>
    </View>
  );
}
